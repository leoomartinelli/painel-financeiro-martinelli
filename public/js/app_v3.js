// public/js/app.js

const API_BASE = '/financeiro_martinelli/api'; // Como seu index.php está na raiz, a API responde aqui

// Variáveis de Estado
let categoriasCache = [];
let graficoInstance = null;
let transacoesCache = [];

document.addEventListener('DOMContentLoaded', () => {
    inicializarDatas();
    carregarCategorias(); // Carrega categorias silenciosamente
    carregarDashboard();  // Carrega o dashboard principal

    // Listeners de Filtro
    document.getElementById('filtroMes').addEventListener('change', carregarDashboard);
    document.getElementById('filtroAno').addEventListener('change', carregarDashboard);

    // Listener de Formulários
    document.getElementById('formTransacao').addEventListener('submit', salvarTransacao);
    document.getElementById('formCategoria').addEventListener('submit', salvarCategoria);
});

// --- INICIALIZAÇÃO ---
function inicializarDatas() {
    const hoje = new Date();
    const selectMes = document.getElementById('filtroMes');
    const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    nomesMeses.forEach((nome, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.textContent = nome;
        if (index === hoje.getMonth()) option.selected = true;
        selectMes.appendChild(option);
    });

    document.getElementById('filtroAno').value = hoje.getFullYear();
    document.getElementById('dataInput').valueAsDate = hoje;
}

// --- API FETCH WRAPPER ---
async function fetchAPI(endpoint, method = 'GET', body = null) {
    try {
        const opts = { method };
        if (body !== null) {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(`${API_BASE}${endpoint}`, opts);
        if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("Erro Fetch:", e);
        return null;
    }
}

// --- DASHBOARD ---
async function carregarDashboard() {
    toggleLoader(true);
    const mes = document.getElementById('filtroMes').value;
    const ano = document.getElementById('filtroAno').value;

    const res = await fetchAPI(`/dashboard?mes=${mes}&ano=${ano}`);

    if (res && res.success) {
        atualizarCards(res.data.resumo);
        atualizarListaTransacoes(res.data.transacoes);
        atualizarGrafico(res.data.grafico);
        transacoesCache = res.data.transacoes;
    }

    toggleLoader(false);

    // Carrega seção de orçamento
    carregarOrcamento();
}

function atualizarCards(resumo) {
    // Helper de formatação
    const fmt = (v) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // 1. Receitas
    // O console mostrou que vem dentro de um objeto 'receitas'
    document.getElementById('cardReceitaReal').textContent = fmt(resumo.receitas.receita_realizada);
    document.getElementById('cardReceitaPend').textContent = fmt(resumo.receitas.receita_pendente);

    // 2. Despesas
    // O console mostrou que vem dentro de um objeto 'despesas'
    document.getElementById('cardDespesaReal').textContent = fmt(resumo.despesas.despesa_realizada);
    document.getElementById('cardDespesaPend').textContent = fmt(resumo.despesas.despesa_pendente);

    // 3. Saldo Atual (AQUI ESTAVA O PROBLEMA)
    // O console mostrou que a chave é direta: 'saldo_atual'
    const valorSaldo = parseFloat(resumo.saldo_atual);
    const elSaldo = document.getElementById('cardSaldoAtual');

    elSaldo.textContent = fmt(valorSaldo);

    // Muda a cor do texto se for negativo
    if (valorSaldo >= 0) {
        elSaldo.classList.remove('text-red-600');
        elSaldo.classList.add('text-blue-600');
    } else {
        elSaldo.classList.remove('text-blue-600');
        elSaldo.classList.add('text-red-600');
    }

    // 4. Saldo Previsto
    const elSaldoPrev = document.getElementById('cardSaldoPrevisto');
    const elDetalhePrev = document.getElementById('cardSaldoPrevistoDetalhe');

    elSaldoPrev.textContent = fmt(resumo.saldo_previsto);

    // Detalhe da fatura
    const valorFatura = parseFloat(resumo.fatura_prevista || 0);

    if (valorFatura > 0) {
        elDetalhePrev.innerHTML = `Já descontando <span class="text-red-300 font-bold">${fmt(valorFatura)}</span> de fatura`;
    } else {
        elDetalhePrev.textContent = "Projeção sem dívida de cartão";
    }

    // Cor do saldo previsto
    if (resumo.saldo_previsto >= 0) {
        elSaldoPrev.classList.remove('text-red-400');
        elSaldoPrev.classList.add('text-white');
    } else {
        elSaldoPrev.classList.remove('text-white');
        elSaldoPrev.classList.add('text-red-400');
    }
}

function atualizarListaTransacoes(lista) {
    const container = document.getElementById('listaTransacoes');
    container.innerHTML = '';

    if (lista.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400 mt-10">
                <i class="ph ph-receipt text-4xl mb-2"></i>
                <span class="text-sm">Nenhuma transação neste mês.</span>
            </div>`;
        return;
    }

    lista.forEach(t => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 mb-2 bg-gray-50 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition group";

        const isDespesa = t.tipo === 'despesa';
        const corValor = isDespesa ? 'text-red-600' : 'text-green-600';
        const sinal = isDespesa ? '- ' : '+ ';
        const dataFmt = t.data.split('-').reverse().slice(0, 2).join('/'); // DD/MM

        // Badge de Status
        let badgeStatus = '';
        if (t.status === 'pendente') {
            badgeStatus = `<span class="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded ml-2 font-bold uppercase">Pendente</span>`;
        }

        // Categoria
        const nomeCat = t.categoria_nome || 'Sem Categoria';

        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="flex flex-col items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-lg shadow-sm text-xs font-bold text-gray-500">
                    <span>${dataFmt.split('/')[0]}</span>
                    <span class="text-[8px] uppercase">${dataFmt.split('/')[1]}</span>
                </div>
                <div>
                    <p class="text-sm font-bold text-gray-800 flex items-center">
                        ${t.descricao}
                        ${badgeStatus}
                    </p>
                    <p class="text-xs text-gray-500">${nomeCat}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-sm font-bold ${corValor} font-mono">${sinal}${parseFloat(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <div class="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2 mt-1">
                    <button onclick='editarTransacao(${JSON.stringify(t)})' class="text-blue-500 hover:text-blue-700 text-xs">Editar</button>
                    <button onclick="excluirTransacao(${t.id})" class="text-red-500 hover:text-red-700 text-xs">Excluir</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
    renderizarPendenciasRapidas(lista);
}

function renderizarPendenciasRapidas(lista) {
    const container = document.getElementById('listaPendentesRapida');
    const badge = document.getElementById('badgeQtdPendentes');

    // Filtra apenas o que é pendente
    const pendentes = lista.filter(t => t.status === 'pendente');

    badge.textContent = pendentes.length;
    container.innerHTML = '';

    if (pendentes.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10 text-sm italic">Tudo pago! Nenhuma pendência.</div>';
        return;
    }

    pendentes.forEach(t => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 mb-2 bg-red-50/30 border border-red-100 rounded-lg hover:bg-red-50 transition group";

        const isDespesa = t.tipo === 'despesa';
        const corValor = isDespesa ? 'text-red-600' : 'text-green-600';
        const prefixo = isDespesa ? 'PAGAR:' : 'RECEBER:';

        div.innerHTML = `
            <div class="flex flex-col">
                <span class="text-[9px] font-black uppercase tracking-tighter ${corValor}">${prefixo}</span>
                <span class="text-sm font-bold text-gray-800">${t.descricao}</span>
                <span class="text-[10px] text-gray-500 italic">${t.categoria_nome || 'Geral'}</span>
            </div>
            <div class="text-right flex flex-col items-end">
                <span class="text-sm font-mono font-black ${corValor}">${parseFloat(t.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                <button onclick='marcarComoPagoRapido(${t.id}, ${JSON.stringify(t)})' 
                    class="mt-1 bg-white border border-gray-200 text-[10px] font-bold px-3 py-1 rounded hover:bg-green-600 hover:text-white hover:border-green-600 transition shadow-sm">
                    PAGAR AGORA
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

// 3. Função de atalho para pagar direto da lista
async function marcarComoPagoRapido(id, dadosTransacao) {
    if (!confirm(`Deseja confirmar o pagamento de "${dadosTransacao.descricao}" agora?`)) return;

    toggleLoader(true);

    // Preparamos os dados mudando apenas o status para 'pago'
    const corpo = { ...dadosTransacao, status: 'pago' };

    const res = await fetchAPI(`/transacoes/${id}`, 'PUT', corpo);

    toggleLoader(false);

    if (res && res.success) {
        // Recarrega o dashboard para atualizar os saldos e sumir da lista de pendentes
        carregarDashboard();
    } else {
        alert("Erro ao processar pagamento.");
    }
}

// --- GRÁFICO (Chart.js) ---
function atualizarGrafico(dadosAnuais) {
    const ctx = document.getElementById('financeChart').getContext('2d');

    // Preparar dados (o backend manda array de 12 meses?)
    // O backend atual manda apenas os meses que tem dados. Vamos normalizar para 12 meses.
    const receitas = new Array(12).fill(0);
    const despesas = new Array(12).fill(0);

    dadosAnuais.forEach(d => {
        const idx = parseInt(d.mes) - 1;
        if (idx >= 0 && idx < 12) {
            receitas[idx] = parseFloat(d.receitas);
            despesas[idx] = parseFloat(d.despesas);
        }
    });

    const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    if (graficoInstance) graficoInstance.destroy();

    graficoInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Receitas',
                    data: receitas,
                    backgroundColor: '#16a34a',
                    borderRadius: 4,
                },
                {
                    label: 'Despesas',
                    data: despesas,
                    backgroundColor: '#dc2626',
                    borderRadius: 4,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// --- OPERAÇÕES DE TRANSAÇÃO ---

function abrirModalTransacao() {
    document.getElementById('formTransacao').reset();
    document.getElementById('transacaoId').value = '';
    document.getElementById('modalTitulo').textContent = 'Nova Transação';
    document.getElementById('dataInput').valueAsDate = new Date();
    document.getElementById('statusInput').checked = true; // Padrão Pago

    carregarOpcoesCategorias(); // Atualiza select
    document.getElementById('modalTransacao').classList.remove('hidden');
}

function fecharModalTransacao() {
    document.getElementById('modalTransacao').classList.add('hidden');
}

// Função auxiliar para preencher modal na edição
window.editarTransacao = function (t) {
    document.getElementById('transacaoId').value = t.id;
    document.getElementById('descInput').value = t.descricao;
    document.getElementById('valorInput').value = t.valor;
    document.getElementById('dataInput').value = t.data;
    document.getElementById('tipoInput').value = t.tipo;
    document.getElementById('statusInput').checked = (t.status === 'pago');
    document.getElementById('modalTitulo').textContent = 'Editar Transação';

    carregarOpcoesCategorias(t.id_categoria); // Passa o ID selecionado
    document.getElementById('modalTransacao').classList.remove('hidden');
}

async function salvarTransacao(e) {
    e.preventDefault();
    toggleLoader(true);

    const id = document.getElementById('transacaoId').value;
    const body = {
        descricao: document.getElementById('descInput').value,
        valor: document.getElementById('valorInput').value,
        data: document.getElementById('dataInput').value,
        tipo: document.getElementById('tipoInput').value,
        id_categoria: document.getElementById('categoriaInput').value,
        status: document.getElementById('statusInput').checked ? 'pago' : 'pendente'
    };

    let res;
    if (id) {
        // Editar
        res = await fetchAPI(`/transacoes/${id}`, 'PUT', body);
    } else {
        // Criar
        res = await fetchAPI('/transacoes', 'POST', body);
    }

    toggleLoader(false);
    if (res && res.success) {
        fecharModalTransacao();
        carregarDashboard();
    } else {
        alert("Erro ao salvar: " + (res.message || 'Desconhecido'));
    }
}

window.excluirTransacao = async function (id) {
    if (!confirm("Tem certeza que deseja apagar?")) return;

    toggleLoader(true);
    const res = await fetchAPI(`/transacoes/${id}`, 'DELETE');
    toggleLoader(false);

    if (res && res.success) {
        carregarDashboard();
    } else {
        alert("Erro ao excluir");
    }
}

// --- CATEGORIAS ---

async function carregarCategorias() {
    const res = await fetchAPI('/categorias');
    if (res && res.success) {
        categoriasCache = res.data;
    }
}

function carregarOpcoesCategorias(idSelecionado = null) {
    const tipoAtual = document.getElementById('tipoInput').value;
    const select = document.getElementById('categoriaInput');
    select.innerHTML = '<option value="">Selecione...</option>';

    const filtradas = categoriasCache.filter(c => c.tipo === tipoAtual);

    filtradas.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        if (idSelecionado && c.id == idSelecionado) opt.selected = true;
        select.appendChild(opt);
    });
}



function abrirModalCategoria() {
    document.getElementById('modalCategoria').classList.remove('hidden');
    resetarFormCategoria();
    renderizarListaCategorias(); // Carrega a lista ao abrir
}

function resetarFormCategoria() {
    document.getElementById('catIdEdit').value = '';
    document.getElementById('catNomeInput').value = '';
    document.getElementById('catTipoInput').value = 'despesa';
    document.getElementById('btnSalvarCat').textContent = 'Adicionar';
    document.getElementById('btnSalvarCat').classList.remove('bg-green-600', 'hover:bg-green-700');
    document.getElementById('btnSalvarCat').classList.add('bg-blue-600', 'hover:bg-blue-700');
    document.getElementById('btnCancelarEdicaoCat').classList.add('hidden');
}

// Renderiza a lista dentro do modal
function renderizarListaCategorias(filtro = 'all') {
    const listaEl = document.getElementById('listaCategoriasModal');
    listaEl.innerHTML = '';

    // Usa o cache que já temos (categoriasCache)
    let itens = categoriasCache;

    if (filtro !== 'all') {
        itens = itens.filter(c => c.tipo === filtro);
    }

    if (itens.length === 0) {
        listaEl.innerHTML = '<div class="text-center text-gray-400 text-sm mt-4">Nenhuma categoria encontrada.</div>';
        return;
    }

    itens.forEach(cat => {
        const corTipo = cat.tipo === 'receita' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 mb-2 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-300 transition group";

        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${corTipo}">${cat.tipo}</span>
                <span class="text-sm font-semibold text-gray-700">${cat.nome}</span>
            </div>
            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick='prepararEdicaoCategoria(${JSON.stringify(cat)})' class="p-1.5 text-blue-600 hover:bg-blue-100 rounded">
                    <i class="ph ph-pencil-simple"></i>
                </button>
                <button onclick="excluirCategoria(${cat.id})" class="p-1.5 text-red-600 hover:bg-red-100 rounded">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        `;
        listaEl.appendChild(div);
    });
}

function filtrarListaCategorias(tipo) {
    renderizarListaCategorias(tipo);
}

// Prepara o formulário para edição
window.prepararEdicaoCategoria = function (cat) {
    document.getElementById('catIdEdit').value = cat.id;
    document.getElementById('catNomeInput').value = cat.nome;
    document.getElementById('catTipoInput').value = cat.tipo;

    const btn = document.getElementById('btnSalvarCat');
    btn.textContent = 'Salvar Alteração';
    btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    btn.classList.add('bg-green-600', 'hover:bg-green-700');

    document.getElementById('btnCancelarEdicaoCat').classList.remove('hidden');
}

// Salvar (Criar ou Editar)
async function salvarCategoria(e) {
    e.preventDefault();
    toggleLoader(true);

    const id = document.getElementById('catIdEdit').value;
    const nome = document.getElementById('catNomeInput').value;
    const tipo = document.getElementById('catTipoInput').value;

    let res;

    if (id) {
        // EDIÇÃO (PUT)
        res = await fetchAPI(`/categorias/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ nome, tipo })
        });
    } else {
        // CRIAÇÃO (POST)
        res = await fetchAPI('/categorias', 'POST', { nome, tipo });
    }

    toggleLoader(false);

    if (res && res.success) {
        await carregarCategorias(); // Recarrega do servidor
        renderizarListaCategorias(); // Atualiza visual
        resetarFormCategoria(); // Limpa form
    } else {
        alert("Erro ao salvar categoria: " + (res.message || 'Erro desconhecido'));
    }
}

async function excluirCategoria(id) {
    if (!confirm("Tem certeza? Transações com esta categoria ficarão 'Sem Categoria'.")) return;

    toggleLoader(true);
    const res = await fetchAPI(`/categorias/${id}`, 'DELETE');
    toggleLoader(false);

    if (res && res.success) {
        await carregarCategorias();
        renderizarListaCategorias();
    } else {
        alert("Erro ao excluir: " + (res.message || 'Erro desconhecido'));
    }
}

function mudarAba(aba) {
    // Oculta todas as views de forma segura (null-safe)
    ['viewFluxo', 'viewCartao', 'viewCofrinhos', 'viewPlanejamento'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    // Remove destaque de todos os tabs
    ['tabFluxo', 'tabCartao', 'tabCofrinhos', 'tabPlanejamento'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('border-blue-600', 'text-blue-600');
        el.classList.add('border-transparent', 'text-gray-500');
    });

    // Helper para mostrar view e destacar tab
    const mostrar = (viewId, tabId) => {
        const v = document.getElementById(viewId);
        if (v) v.classList.remove('hidden');
        const t = document.getElementById(tabId);
        if (t) { t.classList.add('border-blue-600', 'text-blue-600'); t.classList.remove('border-transparent', 'text-gray-500'); }
    };

    if (aba === 'fluxo') {
        mostrar('viewFluxo', 'tabFluxo');
        carregarDashboard();
    } else if (aba === 'cartao') {
        mostrar('viewCartao', 'tabCartao');
        carregarDadosCartao();
    } else if (aba === 'cofrinhos') {
        mostrar('viewCofrinhos', 'tabCofrinhos');
        carregarCofrinhos();
    } else if (aba === 'planejamento') {
        mostrar('viewPlanejamento', 'tabPlanejamento');
        try {
            recalcularPlanejamento();
        } catch (err) {
            const v = document.getElementById('viewPlanejamento');
            if (v) v.innerHTML = '<div style="padding:20px;color:red;font-family:monospace;font-size:12px;background:#fff3f3;border:1px solid red;border-radius:8px"><b>Erro JS:</b><br>' + err.message + '<br><pre>' + (err.stack || '') + '</pre></div>';
        }
    }
}

// --- LÓGICA DO CARTÃO ---

async function carregarDadosCartao() {
    toggleLoader(true);
    const res = await fetchAPI('/cartao');
    toggleLoader(false);

    if (res && res.success) {
        // Atualiza Valor Total
        const total = parseFloat(res.data.total);
        document.getElementById('faturaValor').textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Renderiza Lista
        const listaEl = document.getElementById('listaFatura');
        listaEl.innerHTML = '';

        if (res.data.itens.length === 0) {
            listaEl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                    <i class="ph ph-smiley text-4xl mb-2"></i>
                    <span class="text-sm">Fatura zerada! Nenhuma conta pendente.</span>
                </div>`;
            return;
        }

        res.data.itens.forEach(item => {
            const dataFmt = item.data.split('-').reverse().slice(0, 2).join('/');
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-4 mb-2 bg-white hover:bg-gray-50 border-b border-gray-100 last:border-0 transition";

            div.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="bg-purple-100 text-purple-600 w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs">
                        ${dataFmt}
                    </div>
                    <div>
                        <p class="font-bold text-gray-800">${item.descricao}</p>
                        <p class="text-xs text-gray-500">Compra no Crédito</p>
                    </div>
                </div>
                <div class="font-mono font-bold text-gray-800">
                    ${parseFloat(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
            `;
            listaEl.appendChild(div);
        });
    }
}

async function pagarFatura() {
    const valorTexto = document.getElementById('faturaValor').textContent;
    if (valorTexto === 'R$ 0,00') {
        alert("A fatura já está zerada.");
        return;
    }

    if (!confirm(`Confirma o pagamento da fatura no valor de ${valorTexto}? Isso marcará todas as compras como 'Pagas'.`)) return;

    toggleLoader(true);
    const res = await fetchAPI('/cartao/pagar', 'POST');
    toggleLoader(false);

    if (res && res.success) {
        alert("Fatura paga com sucesso!");
        carregarDadosCartao(); // Atualiza a tela (deve zerar)
    } else {
        alert("Erro ao pagar fatura.");
    }
}


async function carregarCofrinhos() {
    toggleLoader(true);
    const res = await fetchAPI('/cofrinhos');
    toggleLoader(false);

    const grid = document.getElementById('gridCofrinhos');
    grid.innerHTML = '';

    if (res && res.success) {
        if (res.data.length === 0) {
            grid.innerHTML = `<div class="col-span-3 text-center text-gray-400 py-10">Você ainda não tem caixinhas. Crie uma agora!</div>`;
            return;
        }

        res.data.forEach(c => {
            // Calcula porcentagem da meta
            const saldo = parseFloat(c.saldo_atual);
            const meta = parseFloat(c.meta);
            const cofreString = encodeURIComponent(JSON.stringify(c));
            let porcentagem = meta > 0 ? (saldo / meta) * 100 : 0;
            if (porcentagem > 100) porcentagem = 100;

            const div = document.createElement('div');
            div.className = "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col transition hover:shadow-md";

            div.innerHTML = `
    <div class="cursor-pointer group" onclick="abrirDetalhesCofre('${cofreString}')">
        <div class="${c.cor_fundo} p-4 text-white flex justify-between items-start transition group-hover:brightness-110">
            <div>
                <h3 class="font-bold text-lg">${c.nome}</h3>
                <p class="text-xs opacity-80">Meta: ${meta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>
            <i class="ph ph-piggy-bank text-3xl opacity-50 group-hover:scale-110 transition"></i>
        </div>
        <div class="p-5">
            <div class="mb-4">
                <span class="text-gray-500 text-xs font-bold uppercase">Saldo Atual</span>
                <div class="text-2xl font-bold text-gray-800">${saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div class="${c.cor_fundo} h-2 rounded-full transition-all duration-500" style="width: ${porcentagem}%"></div>
            </div>
            <div class="text-right text-[10px] text-gray-400 font-bold mb-4">${porcentagem.toFixed(0)}%</div>
        </div>
    </div>

    <div class="px-5 pb-5 flex gap-2">
        <button onclick="abrirMovimentacao(${c.id}, 'deposito')" class="flex-1 bg-gray-900 text-white text-xs font-bold py-2 rounded hover:bg-black transition">Guardar</button>
        <button onclick="abrirMovimentacao(${c.id}, 'resgate')" class="flex-1 bg-white border border-gray-200 text-gray-700 text-xs font-bold py-2 rounded hover:bg-gray-50 transition">Resgatar</button>
    </div>
`;
            grid.appendChild(div);
        });
    }
}

// --- CRIAR COFRINHO ---

function abrirModalNovoCofrinho() {
    document.getElementById('modalNovoCofrinho').classList.remove('hidden');
    document.getElementById('cofreNome').value = '';
    document.getElementById('cofreMeta').value = '';
}

function selectCorCofre(cor) {
    document.getElementById('cofreCor').value = cor;
    // Remove borda de todos e adiciona no selecionado (efeito visual simples)
    alert("Cor selecionada: " + cor.replace('bg-', '').replace('-600', ''));
}

// Listener para criar (adicione no final do DOMContentLoaded ou aqui mesmo)
document.getElementById('formCofrinho').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('cofreNome').value;
    const meta = document.getElementById('cofreMeta').value;
    const cor = document.getElementById('cofreCor').value;

    toggleLoader(true);
    const res = await fetchAPI('/cofrinhos', 'POST', { nome, meta, cor });
    toggleLoader(false);

    if (res && res.success) {
        document.getElementById('modalNovoCofrinho').classList.add('hidden');
        carregarCofrinhos();
    } else {
        alert('Erro ao criar.');
    }
});

// --- MOVIMENTAR (GUARDAR/RESGATAR) ---

function abrirMovimentacao(id, tipo) {
    document.getElementById('modalMovCofrinho').classList.remove('hidden');
    document.getElementById('movCofreId').value = id;
    document.getElementById('movCofreTipo').value = tipo;
    document.getElementById('movCofreValor').value = '';

    const titulo = document.getElementById('tituloMovCofre');
    const sub = document.getElementById('subtituloMovCofre');

    if (tipo === 'deposito') {
        titulo.textContent = 'Guardar Dinheiro';
        sub.textContent = 'O valor sairá do seu saldo principal como uma despesa.';
    } else {
        titulo.textContent = 'Resgatar Dinheiro';
        sub.textContent = 'O valor voltará para seu saldo principal como receita.';
    }
}

async function confirmarMovimentacaoCofrinho() {
    const id = document.getElementById('movCofreId').value;
    const tipo = document.getElementById('movCofreTipo').value;
    const valor = document.getElementById('movCofreValor').value;

    if (!valor || valor <= 0) {
        alert("Digite um valor válido.");
        return;
    }

    toggleLoader(true);
    const res = await fetchAPI('/cofrinhos/movimentar', 'POST', { id, tipo, valor });
    toggleLoader(false);

    if (res && res.success) {
        document.getElementById('modalMovCofrinho').classList.add('hidden');
        carregarCofrinhos();
        alert(tipo === 'deposito' ? 'Dinheiro guardado!' : 'Dinheiro resgatado!');
    } else {
        alert("Erro na operação.");
    }
}

async function excluirCofrinho(id) {
    if (!confirm("Excluir esta caixinha? O dinheiro que está nela 'sumirá' do controle (ou você deve resgatar antes).")) return;
    await fetchAPI(`/cofrinhos/${id}`, 'DELETE');
    carregarCofrinhos();
}

function abrirDetalhesCofre(cofreString) {
    const c = JSON.parse(decodeURIComponent(cofreString));

    const saldo = parseFloat(c.saldo_atual);
    const meta = parseFloat(c.meta);
    let porcentagem = meta > 0 ? (saldo / meta) * 100 : 0;
    if (porcentagem > 100) porcentagem = 100;

    const falta = meta - saldo;

    // Preenche Modal
    document.getElementById('idCofreDetalhe').value = c.id;
    document.getElementById('detalheNomeCofre').textContent = c.nome;

    // Atualiza cores do header e da barra baseado na cor do cofre
    const header = document.getElementById('headerDetalheCofre');
    const bar = document.getElementById('barDetalheCofre');

    // Remove classes antigas de cor (bg-*)
    header.className = header.className.replace(/bg-\w+-\d+/g, '');
    bar.className = bar.className.replace(/bg-\w+-\d+/g, '');

    // Adiciona nova cor
    header.classList.add(c.cor_fundo);
    bar.classList.add(c.cor_fundo);

    // Valores
    document.getElementById('detalheSaldoCofre').textContent = saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('detalheMetaCofre').textContent = meta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Barra
    bar.style.width = `${porcentagem}%`;
    document.getElementById('detalhePorcentagem').textContent = `${porcentagem.toFixed(1)}%`;
    document.getElementById('detalhePorcentagem').className = `text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600`; // Reset cor texto

    // Texto de quanto falta
    const elFalta = document.getElementById('detalheFalta');
    if (falta > 0) {
        elFalta.textContent = `Faltam ${falta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para a meta!`;
        elFalta.classList.remove('text-green-600');
        elFalta.classList.add('text-gray-500');
    } else {
        elFalta.textContent = "Parabéns! Meta atingida! 🎉";
        elFalta.classList.remove('text-gray-500');
        elFalta.classList.add('text-green-600', 'font-bold');
    }

    // Input de Edição
    document.getElementById('novaMetaInput').value = meta;

    document.getElementById('modalDetalhesCofre').classList.remove('hidden');
}

// Listener para salvar a meta
document.getElementById('formEditarMeta').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('idCofreDetalhe').value;
    const novaMeta = document.getElementById('novaMetaInput').value;

    if (novaMeta < 0) {
        alert("A meta não pode ser negativa.");
        return;
    }

    toggleLoader(true);
    const res = await fetchAPI(`/cofrinhos/${id}/meta`, 'PUT', { meta: novaMeta });
    toggleLoader(false);

    if (res && res.success) {
        document.getElementById('modalDetalhesCofre').classList.add('hidden');
        carregarCofrinhos(); // Recarrega a lista para atualizar os dados
        alert("Meta atualizada com sucesso!");
    } else {
        alert("Erro ao atualizar meta: " + (res.message || "Erro desconhecido"));
    }
});



// --- UTILITÁRIOS ---
function toggleLoader(show) {
    const el = document.getElementById('loader');
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

// ============================================================
// ===== PLANEJAMENTO FUTURO — SIMULADOR FINANCEIRO ============
// ============================================================

let planejamentoChartInstance = null;

// --- Parâmetros fixos do modelo ---
const PLAN_RENTABILIDADE_ANUAL = 0.12;    // 12% a.a. bruto (perfil moderado)
const PLAN_IPCA_ANUAL = 0.05;    // 5% a.a. (cenário base)
const PLAN_IR_INVESTIMENTO = 0.15;    // IR 15% sobre lucro (longo prazo)
const PLAN_IDADE_MAX = 95;      // simular até 95 anos

// Taxa mensal equivalente
const taxaMensalBruta = Math.pow(1 + PLAN_RENTABILIDADE_ANUAL, 1 / 12) - 1;
const taxaMensalIPCA = Math.pow(1 + PLAN_IPCA_ANUAL, 1 / 12) - 1;
// Taxa mensal líquida de IR (acumulação): lucro × (1 - 0.15)
const taxaMensalLiqAccum = taxaMensalBruta * (1 - PLAN_IR_INVESTIMENTO);

/**
 * Calcula IR progressivo anual sobre retirada mensal.
 * Tabela 2024: faixas mensais.
 * Retorna a alíquota efetiva sobre o rendimento mensal.
 */
function calcularAliquotaEfetivaIR(rendaMensalBruta) {
    if (rendaMensalBruta <= 2824.00) return 0;
    if (rendaMensalBruta <= 3751.05) {
        // 7,5% sobre a parcela acima de 2824
        const base = rendaMensalBruta - 2824.00;
        const imposto = base * 0.075;
        return imposto / rendaMensalBruta;
    }
    if (rendaMensalBruta <= 4664.68) {
        const imposto = (rendaMensalBruta - 3751.05) * 0.15 + (3751.05 - 2824.00) * 0.075;
        return imposto / rendaMensalBruta;
    }
    if (rendaMensalBruta <= 6101.06) {
        const imposto = (rendaMensalBruta - 4664.68) * 0.225
            + (4664.68 - 3751.05) * 0.15
            + (3751.05 - 2824.00) * 0.075;
        return imposto / rendaMensalBruta;
    }
    // Acima de R$6.101,06 — 27,5%
    const imposto = (rendaMensalBruta - 6101.06) * 0.275
        + (6101.06 - 4664.68) * 0.225
        + (4664.68 - 3751.05) * 0.15
        + (3751.05 - 2824.00) * 0.075;
    return imposto / rendaMensalBruta;
}

/**
 * Executa a simulação completa mês a mês.
 * Retorna array de { idade, patrimonioReal, patrimonioNominal, fase }
 */
function simularTrajetoria(idadeAtual, idadeAposentadoria, aporteMensal, rendaDesejadaHoje, patrimonioInicial) {
    const resultado = [];
    let patrimonio = patrimonioInicial;
    // Fator de deflação acumulado (começa em 1, vai crescendo com IPCA)
    let fatorIPCA = 1;

    const totalMeses = (PLAN_IDADE_MAX - idadeAtual) * 12;
    const mesesAcumulacao = (idadeAposentadoria - idadeAtual) * 12;

    for (let mes = 0; mes <= totalMeses; mes++) {
        const idadeAtualMes = idadeAtual + mes / 12;
        fatorIPCA *= (1 + taxaMensalIPCA);

        if (patrimonio <= 0) {
            // Patrimônio zerou — encerra simulação
            resultado.push({
                idade: Math.round(idadeAtualMes * 10) / 10,
                patrimonioReal: 0,
                patrimonioNominal: 0,
                fase: 'retirada'
            });
            if (idadeAtualMes >= PLAN_IDADE_MAX) break;
            continue;
        }

        if (mes < mesesAcumulacao) {
            // ====== FASE ACUMULAÇÃO ======
            const lucroMensal = patrimonio * taxaMensalBruta;
            const irMensal = lucroMensal * PLAN_IR_INVESTIMENTO;
            patrimonio += (lucroMensal - irMensal) + aporteMensal;

            resultado.push({
                idade: Math.round(idadeAtualMes * 10) / 10,
                patrimonioReal: patrimonio / fatorIPCA,
                patrimonioNominal: patrimonio,
                fase: 'acumulacao'
            });

        } else {
            // ====== FASE RETIRADA ======
            // Renda desejada em valores nominais (corrigida pelo IPCA)
            const rendaNominalDesejada = rendaDesejadaHoje * fatorIPCA;

            // Quanto o patrimônio rendeu bruto neste mês
            const lucroMensal = patrimonio * taxaMensalBruta;
            const irInvestimento = lucroMensal * PLAN_IR_INVESTIMENTO;
            patrimonio += lucroMensal - irInvestimento;

            // Calcular IR sobre o saque (tabela progressiva)
            // A renda nominal é o valor que o usuário quer LÍQUIDO,
            // então precisamos calcular o gross-up para saber quanto sacar bruto
            const aliquota = calcularAliquotaEfetivaIR(rendaNominalDesejada);
            const sacoBruto = rendaNominalDesejada / (1 - aliquota); // gross-up

            patrimonio -= sacoBruto;
            if (patrimonio < 0) patrimonio = 0;

            resultado.push({
                idade: Math.round(idadeAtualMes * 10) / 10,
                patrimonioReal: patrimonio / fatorIPCA,
                patrimonioNominal: patrimonio,
                fase: 'retirada'
            });
        }
    }

    return resultado;
}

/**
 * Formata valor em R$ reduzido (K/M)
 */
function fmtPlan(v) {
    if (Math.abs(v) >= 1e6) return 'R$ ' + (v / 1e6).toFixed(2).replace('.', ',') + ' M';
    if (Math.abs(v) >= 1e3) return 'R$ ' + (v / 1e3).toFixed(1).replace('.', ',') + ' K';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Calcula renda mensal líquida que o patrimônio gera passivamente.
 * Usa rentabilidade real (descontando IPCA e IR) do patrimônio.
 */
function calcularRendaMensalLiquida(patrimonio) {
    // Lucro bruto mensal
    const lucroMensal = patrimonio * taxaMensalBruta;
    // Desconta IR de inv.
    const lucroLiquidoInv = lucroMensal * (1 - PLAN_IR_INVESTIMENTO);
    // Desconta IR progressivo sobre o saque (estimativa)
    const aliquota = calcularAliquotaEfetivaIR(lucroLiquidoInv);
    return lucroLiquidoInv * (1 - aliquota);
}

function recalcularPlanejamento() {
    const idadeAtual = parseInt(document.getElementById('planIdadeAtual').value) || 30;
    const idadeAposentadoria = parseInt(document.getElementById('planIdadeAposentadoria').value) || 55;
    const aporteMensal = parseFloat(document.getElementById('planAporte').value) || 0;
    const rendaDesejada = parseFloat(document.getElementById('planRenda').value) || 0;
    const patrimonioInicial = parseFloat(document.getElementById('planPatrimonioInicial').value) || 0;

    // Validações
    if (idadeAposentadoria <= idadeAtual) {
        document.getElementById('planIdadeAposentadoria').value = idadeAtual + 1;
        return recalcularPlanejamento();
    }

    const dados = simularTrajetoria(idadeAtual, idadeAposentadoria, aporteMensal, rendaDesejada, patrimonioInicial);

    // ---- Extrair dados anuais para o gráfico (1 ponto por ano) ----
    const pontosPorAno = dados.filter((_, i) => i % 12 === 0);

    const idades = pontosPorAno.map(p => p.idade);
    const patrimoniosReais = pontosPorAno.map(p => p.patrimonioReal);
    const fases = pontosPorAno.map(p => p.fase);

    // Separa segmentos: acumulação e retirada
    const coresAcum = fases.map(f => f === 'acumulacao' ? 'rgba(59,130,246,0.9)' : 'rgba(249,115,22,0.9)');
    const bordaAcum = fases.map(f => f === 'acumulacao' ? 'rgba(37,99,235,1)' : 'rgba(234,88,12,1)');

    // ---- KPI: patrimônio no momento da aposentadoria ----
    const idxAposentadoria = pontosPorAno.findIndex(p => p.idade >= idadeAposentadoria);
    const patrimonioNaAposentadoria = idxAposentadoria >= 0 ? pontosPorAno[idxAposentadoria].patrimonioReal : 0;
    const patrimonioNominalNaAp = idxAposentadoria >= 0 ? pontosPorAno[idxAposentadoria].patrimonioNominal : 0;

    // Renda mensal gerada pelo patrimônio nominal na aposentadoria (em valores da época)
    const rendaMensalGeradaNominal = calcularRendaMensalLiquida(patrimonioNominalNaAp);
    // Convertendo para valores de hoje (poder de compra)
    const fatorIPCAnaAp = Math.pow(1 + PLAN_IPCA_ANUAL, idadeAposentadoria - idadeAtual);
    const rendaMensalGeradaReal = rendaMensalGeradaNominal / fatorIPCAnaAp;

    // ---- KPI: patrimônio sustenta até quando? ----
    const primeiroZero = dados.findIndex(p => p.patrimonioNominal <= 0);
    let idadeSustenta;
    if (primeiroZero === -1) {
        idadeSustenta = PLAN_IDADE_MAX + '+';
    } else {
        idadeSustenta = (idadeAtual + primeiroZero / 12).toFixed(0) + ' anos';
    }

    // ---- KPI: independência financeira? ----
    const isIndependente = rendaMensalGeradaReal >= rendaDesejada;

    // ---- Atualizar KPIs ----
    document.getElementById('kpiPatrimonio').textContent = fmtPlan(patrimonioNaAposentadoria);
    document.getElementById('kpiRendaGerada').textContent = fmtPlan(rendaMensalGeradaReal) + '/mês';

    const elIndep = document.getElementById('kpiIndependencia');
    const elIndepDesc = document.getElementById('kpiIndependenciaDesc');
    if (isIndependente) {
        elIndep.textContent = '✅ Sim!';
        elIndep.className = 'text-xl font-bold text-green-600';
        elIndepDesc.textContent = `Renda gerada supera a desejada`;
    } else {
        const deficit = rendaDesejada - rendaMensalGeradaReal;
        elIndep.textContent = '⚠️ Não';
        elIndep.className = 'text-xl font-bold text-red-500';
        elIndepDesc.textContent = `Faltam ${fmtPlan(deficit)}/mês`;
    }

    const elSustenta = document.getElementById('kpiSustenta');
    if (primeiroZero === -1) {
        elSustenta.textContent = PLAN_IDADE_MAX + '+ anos';
        elSustenta.className = 'text-xl font-bold text-purple-600';
    } else {
        const idZero = (idadeAtual + primeiroZero / 12).toFixed(0);
        elSustenta.textContent = idZero + ' anos';
        elSustenta.className = idZero < 75 ? 'text-xl font-bold text-red-500' : 'text-xl font-bold text-yellow-600';
    }

    // ---- Alert Banner ----
    const alertEl = document.getElementById('alertPlanejamento');
    if (primeiroZero !== -1) {
        const idZero = (idadeAtual + primeiroZero / 12).toFixed(0);
        alertEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200';
        alertEl.innerHTML = `⚠️ Com os parâmetros atuais, seu patrimônio se esgota aos <strong>${idZero} anos</strong>. Considere aumentar o aporte, reduzir a renda desejada ou atrasar a aposentadoria.`;
        alertEl.classList.remove('hidden');
    } else if (isIndependente) {
        alertEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200';
        alertEl.innerHTML = `🎉 Parabéns! Com estes aportes, você alcança a independência financeira aos <strong>${idadeAposentadoria} anos</strong> e seu patrimônio sustenta sua renda indefinidamente.`;
        alertEl.classList.remove('hidden');
    } else {
        alertEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-700 border border-yellow-200';
        alertEl.innerHTML = `💡 Seu patrimônio sustenta a renda, mas abaixo do desejado. Aumente o aporte ou revise a renda alvo para atingir a independência financeira.`;
        alertEl.classList.remove('hidden');
    }


    // ---- Renderizar Grafico ----
    const idxAnot = idades.findIndex(id => id >= idadeAposentadoria);
    renderizarGraficoPlanejamento(idades, pontosPorAno, idxAnot >= 0 ? idxAnot : 0, idadeAposentadoria);
}

function renderizarGraficoPlanejamento(idades, pontos, idxAnnot, idadeAposentadoria) {
    const ctx = document.getElementById('planejamentoChart').getContext('2d');

    if (planejamentoChartInstance) planejamentoChartInstance.destroy();

    // Separar dados: acumulacao (azul) e retirada (laranja)
    const dadosAcum = pontos.map((p, i) => i <= idxAnnot ? p.patrimonioReal : null);
    const dadosRetirada = pontos.map((p, i) => i >= idxAnnot ? p.patrimonioReal : null);

    // Plugin inline para linha vertical de aposentadoria
    const verticalLinePlugin = {
        id: 'verticalLinePlugin',
        afterDraw(chart) {
            if (idxAnnot < 0) return;
            const xPos = chart.scales.x.getPixelForValue(idxAnnot);
            const yTop = chart.scales.y.top;
            const yBottom = chart.scales.y.bottom;
            const c = chart.ctx;
            c.save();
            c.beginPath();
            c.setLineDash([7, 5]);
            c.strokeStyle = 'rgba(234, 88, 12, 0.75)';
            c.lineWidth = 2;
            c.moveTo(xPos, yTop);
            c.lineTo(xPos, yBottom);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = 'rgba(234, 88, 12, 0.9)';
            const labelText = 'Aposentadoria (' + idadeAposentadoria + ' a)';
            c.font = 'bold 11px Inter, sans-serif';
            const labelW = c.measureText(labelText).width + 16;
            const labelH = 22;
            const labelX = Math.min(xPos + 6, chart.width - labelW - 10);
            const labelY = yTop + 10;
            c.beginPath();
            if (c.roundRect) {
                c.roundRect(labelX, labelY, labelW, labelH, 4);
            } else {
                c.rect(labelX, labelY, labelW, labelH);
            }
            c.fill();
            c.fillStyle = '#fff';
            c.textBaseline = 'middle';
            c.fillText(labelText, labelX + 8, labelY + labelH / 2);
            c.restore();
        }
    };

    planejamentoChartInstance = new Chart(ctx, {
        type: 'line',
        plugins: [verticalLinePlugin],
        data: {
            labels: idades,
            datasets: [
                {
                    label: 'Acumulacao',
                    data: dadosAcum,
                    borderColor: 'rgba(37,99,235,1)',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: 'rgba(37,99,235,1)',
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    fill: true,
                    spanGaps: false
                },
                {
                    label: 'Retirada',
                    data: dadosRetirada,
                    borderColor: 'rgba(234,88,12,1)',
                    backgroundColor: 'rgba(249,115,22,0.07)',
                    borderWidth: 2.5,
                    pointBackgroundColor: 'rgba(234,88,12,1)',
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    fill: true,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 14,
                        callback: (v) => idades[v] !== undefined ? idades[v] + ' a' : ''
                    },
                    title: { display: true, text: 'Idade', color: '#9ca3af', font: { size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6' },
                    ticks: {
                        callback: v => {
                            if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + 'K';
                            return 'R$ ' + v;
                        }
                    },
                    title: { display: true, text: 'Patrimonio (R$)', color: '#9ca3af', font: { size: 11 } }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.parsed.y === null) return null;
                            return ctx.dataset.label + ': ' + fmtPlan(ctx.parsed.y);
                        },
                        title: ctx => 'Idade: ' + ctx[0].label + ' anos'
                    }
                }
            }
        }
    });
}

// Sincroniza slider -> input
function sincronizarInput(sliderId, inputId) {
    document.getElementById(inputId).value = document.getElementById(sliderId).value;
}

// Sincroniza input -> slider
function sincronizarSlider(inputId, sliderId) {
    document.getElementById(sliderId).value = document.getElementById(inputId).value;
}
// ================================================================
// ORCAMENTO MENSAL  Secao no Fluxo de Caixa
// ================================================================

const CAT_COLORS = [
    '#6366F1', '#F59E0B', '#10B981', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
    '#84CC16', '#14B8A6', '#F43F5E', '#A855F7'
];

let orcamentoState = {
    modo: 'realizado',       // 'realizado' | 'planejado'
    receita: 0,
    categorias: [],          // [{id, nome, total_realizado, valor_planejado}, ...]
    planejado: {},           // {catId: valor, ...}
    chartInstance: null
};

// Chamado por carregarDashboard() apos carregar dados do mes
async function carregarOrcamento() {
    const mes = document.getElementById('filtroMes').value;
    const ano = document.getElementById('filtroAno').value;

    const res = await fetchAPI('/orcamento?mes=' + mes + '&ano=' + ano);
    if (!res || !res.success) return;

    const d = res.data;
    orcamentoState.receita = d.receita || 0;
    orcamentoState.categorias = d.categorias || [];

    // Inicializar planejado com valores salvos
    orcamentoState.planejado = {};
    orcamentoState.categorias.forEach(c => {
        orcamentoState.planejado[c.id] = c.valor_planejado || 0;
    });

    renderizarOrcamento();
}

function toggleModoOrcamento(modo) {
    orcamentoState.modo = modo;

    const btnR = document.getElementById('btnOrcRealizado');
    const btnP = document.getElementById('btnOrcPlanejado');

    if (modo === 'realizado') {
        btnR.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
        btnR.classList.remove('text-gray-500');
        btnP.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
        btnP.classList.add('text-gray-500');
    } else {
        btnP.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
        btnP.classList.remove('text-gray-500');
        btnR.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
        btnR.classList.add('text-gray-500');
    }

    renderizarOrcamento();
}

function renderizarOrcamento() {
    const { modo, receita, categorias, planejado } = orcamentoState;
    const alertSemReceita = document.getElementById('alertSemReceita');
    const painelSliders = document.getElementById('painelSliders');
    const painelLegenda = document.getElementById('painelLegendaRealizado');

    // Verificar se tem receita no modo planejado
    if (modo === 'planejado' && receita <= 0) {
        alertSemReceita.classList.remove('hidden');
        painelSliders.classList.add('hidden');
        painelLegenda.classList.remove('hidden');
        renderizarGraficoOrcamento(false);
        renderizarLegendaRealizado();
        return;
    }
    alertSemReceita.classList.add('hidden');

    if (modo === 'planejado') {
        painelSliders.classList.remove('hidden');
        painelLegenda.classList.add('hidden');
        renderizarSliders();
    } else {
        painelSliders.classList.add('hidden');
        painelLegenda.classList.remove('hidden');
        renderizarLegendaRealizado();
    }

    renderizarGraficoOrcamento(true);
}

function getCatColor(idx) {
    return CAT_COLORS[idx % CAT_COLORS.length];
}

function renderizarGraficoOrcamento(comReceita) {
    const ctx = document.getElementById('graficoOrcamento');
    if (!ctx) return;
    const context = ctx.getContext('2d');

    if (orcamentoState.chartInstance) {
        orcamentoState.chartInstance.destroy();
        orcamentoState.chartInstance = null;
    }

    const { modo, receita, categorias, planejado } = orcamentoState;
    const cats = categorias.filter(c => {
        if (modo === 'realizado') return c.total_realizado > 0;
        return true;
    });

    const totalPlanejado = cats.reduce((s, c) => s + (planejado[c.id] || 0), 0);
    const deficit = modo === 'planejado' ? Math.max(0, totalPlanejado - receita) : 0;

    const alertDeficit = document.getElementById('alertDeficit');
    if (deficit > 0) {
        alertDeficit.classList.remove('hidden');
        const pct = ((deficit / receita) * 100).toFixed(1);
        document.getElementById('alertDeficitTexto').textContent =
            'Voce alocou ' + pct + '% acima da receita. Precisa de mais R$ ' +
            deficit.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' de renda para cobrir os gastos planejados.';
    } else {
        alertDeficit.classList.add('hidden');
    }

    // Configuração do Gráfico Empilhado
    const labels = ['Renda', 'Gastos'];

    // Dataset 0: Renda
    const datasets = [{
        label: 'Renda',
        data: [receita, 0],
        backgroundColor: 'rgba(22,163,74,0.9)',
        borderColor: 'rgba(22,163,74,1)',
        borderWidth: 1,
        borderRadius: 8,
        stack: 'stack1'
    }];

    // Datasets para Gatutos (categorias empilhadas no label 'Gastos')
    cats.forEach((c, i) => {
        const valor = modo === 'realizado' ? c.total_realizado : (planejado[c.id] || 0);
        datasets.push({
            label: c.nome,
            data: [0, valor],
            backgroundColor: getCatColor(i, 0.7),
            borderColor: getCatColor(i, 1),
            borderWidth: 1,
            borderRadius: i === cats.length - 1 ? 8 : 0, // Arredonda só o topo do stack
            stack: 'stack1'
        });
    });

    // Plugin para desenhar valores dentro das barras
    const labelsPlugin = {
        id: 'labelsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillStyle = '#ffffff';

            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                meta.data.forEach((bar, index) => {
                    const value = dataset.data[index];
                    if (value > 0) {
                        // Só desenha se a barra for alta o suficiente
                        if (bar.height > 20) {
                            const formatted = 'R$ ' + Math.round(value).toLocaleString('pt-BR');
                            ctx.fillText(formatted, bar.x, bar.y + bar.height / 2);
                        }
                    }
                });
            });
            ctx.restore();
        }
    };

    const deficitPlugin = {
        id: 'deficitPlugin',
        afterDraw(chart) {
            if (deficit <= 0) return;
            const ds = chart.getDatasetMeta(0);
            if (!ds.data.length) return;
            const bar = ds.data[0];
            const c = chart.ctx;
            const yScale = chart.scales.y;
            const totalNecessario = receita + deficit;
            const yDeficit = yScale.getPixelForValue(totalNecessario);
            const yTopo = yScale.getPixelForValue(receita);

            c.save();
            c.fillStyle = 'rgba(22,163,74,0.1)';
            c.strokeStyle = 'rgba(22,163,74,0.8)';
            c.setLineDash([5, 5]);
            c.lineWidth = 2;
            c.beginPath();
            c.rect(bar.x - bar.width / 2, yDeficit, bar.width, yTopo - yDeficit);
            c.fill();
            c.strokeRect(bar.x - bar.width / 2, yDeficit, bar.width, yTopo - yDeficit);
            c.setLineDash([]);
            c.restore();
        }
    };

    orcamentoState.chartInstance = new Chart(context, {
        type: 'bar',
        plugins: [labelsPlugin, deficitPlugin],
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v === 0) return null;
                            return ' ' + ctx.dataset.label + ': R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: 'bold' }, color: '#374151' }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: '#f3f4f6' },
                    ticks: {
                        callback: v => 'R$ ' + v.toLocaleString('pt-BR'),
                        font: { size: 11 },
                        color: '#6b7280'
                    }
                }
            }
        }
    });
}

function renderizarSliders() {
    const { receita, categorias, planejado } = orcamentoState;
    const lista = document.getElementById('listaSliders');
    if (!lista) return;

    lista.innerHTML = '';
    categorias.forEach((cat, idx) => {
        const cor = getCatColor(idx);
        const val = planejado[cat.id] || 0;
        const pct = receita > 0 ? Math.min(((val / receita) * 100), 200) : 0;
        const pctDisplay = receita > 0 ? ((val / receita) * 100).toFixed(1) : '0.0';

        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-xl p-3';
        div.innerHTML = `
            <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${cor}"></span>
                    <span class="text-sm font-semibold text-gray-700">${cat.nome}</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                    <span class="font-bold text-gray-800" id="pct_${cat.id}">${pctDisplay}%</span>
                    <span class="text-gray-400" id="val_${cat.id}">R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>
            <input type="range" min="0" max="${Math.max(receita * 2, 100)}" step="10"
                value="${val}"
                class="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style="accent-color: ${cor}"
                oninput="atualizarSliderOrcamento(${cat.id}, this.value, ${receita}, ${idx})">
        `;
        lista.appendChild(div);
    });

    atualizarTotaisOrcamento();
}

function atualizarSliderOrcamento(catId, valor, receita, idx) {
    orcamentoState.planejado[catId] = parseFloat(valor);
    const pct = receita > 0 ? ((valor / receita) * 100).toFixed(1) : '0.0';
    const pctEl = document.getElementById('pct_' + catId);
    const valEl = document.getElementById('val_' + catId);
    if (pctEl) pctEl.textContent = pct + '%';
    if (valEl) valEl.textContent = 'R$ ' + parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    atualizarTotaisOrcamento();
    renderizarGraficoOrcamento(true);
}

function atualizarTotaisOrcamento() {
    const { receita, categorias, planejado } = orcamentoState;
    const total = categorias.reduce((s, c) => s + (planejado[c.id] || 0), 0);
    const disponivel = receita - total;

    const elTotal = document.getElementById('totalAlocado');
    const elDisp = document.getElementById('disponivelOrc');
    if (elTotal) elTotal.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    if (elDisp) {
        elDisp.textContent = 'R$ ' + Math.abs(disponivel).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + (disponivel < 0 ? ' (deficit)' : '');
        elDisp.className = 'font-bold ' + (disponivel < 0 ? 'text-red-600' : 'text-green-600');
    }
}

function renderizarLegendaRealizado() {
    const { categorias, receita } = orcamentoState;
    const lista = document.getElementById('listaLegendaRealizado');
    if (!lista) return;

    const totalDespesas = categorias.reduce((s, c) => s + c.total_realizado, 0);
    const saldoLivre = receita - totalDespesas;

    lista.innerHTML = '';

    const cats = categorias.filter(c => c.total_realizado > 0);

    // Sort descending by amount spent
    cats.sort((a, b) => b.total_realizado - a.total_realizado);

    if (cats.length === 0) {
        lista.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Nenhuma despesa registrada neste mes.</p>';
        return;
    }

    cats.forEach((cat, idx) => {
        const cor = getCatColor(idx);
        const pct = receita > 0 ? ((cat.total_realizado / receita) * 100).toFixed(1) : '0.0';
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-xl p-3';
        div.innerHTML = `
            <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${cor}"></span>
                    <span class="text-sm font-semibold text-gray-700">${cat.nome}</span>
                </div>
                <span class="text-xs font-bold text-gray-600">${pct}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1.5">
                <div class="h-1.5 rounded-full transition-all" style="width:${pct}%;background:${cor}"></div>
            </div>
            <p class="text-xs text-gray-400 mt-1 text-right">R$ ${cat.total_realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        `;
        lista.appendChild(div);
    });

    const elTotalRealizado = document.getElementById('totalRealizadoLbl');
    const elDisponivelRealizado = document.getElementById('disponivelRealizadoLbl');

    if (elTotalRealizado) {
        elTotalRealizado.textContent = 'R$ ' + totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }

    if (elDisponivelRealizado) {
        elDisponivelRealizado.textContent = 'R$ ' + Math.abs(saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + (saldoLivre < 0 ? ' (déficit)' : '');
        elDisponivelRealizado.className = 'font-bold ' + (saldoLivre < 0 ? 'text-red-600' : 'text-green-600');
    }
}

async function salvarOrcamento() {
    const mes = document.getElementById('filtroMes').value;
    const ano = document.getElementById('filtroAno').value;
    const { planejado } = orcamentoState;

    if (Object.keys(planejado).length === 0) return;

    const res = await fetchAPI('/orcamento', 'POST', {
        mes: parseInt(mes),
        ano: parseInt(ano),
        alocacoes: planejado
    });

    if (res && res.success) {
        // Feedback visual rapido
        const btn = document.querySelector('button[onclick="salvarOrcamento()"]');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="ph ph-check-circle"></i> Salvo!';
            btn.classList.replace('bg-blue-600', 'bg-green-600');
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.classList.replace('bg-green-600', 'bg-blue-600');
            }, 2000);
        }
    }
}
