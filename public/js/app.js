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
async function fetchAPI(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("Erro Fetch:", e);
        alert("Erro de comunicação com o servidor.");
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
        transacoesCache = res.data.transacoes; // Guarda para uso local se precisar
    }

    toggleLoader(false);
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

    const res = await fetchAPI(`/transacoes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(corpo)
    });

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
        res = await fetchAPI(`/transacoes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    } else {
        // Criar
        res = await fetchAPI(`/transacoes`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
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
    const res = await fetchAPI(`/transacoes/${id}`, { method: 'DELETE' });
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
        res = await fetchAPI('/categorias', {
            method: 'POST',
            body: JSON.stringify({ nome, tipo })
        });
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
    const res = await fetchAPI(`/categorias/${id}`, { method: 'DELETE' });
    toggleLoader(false);

    if (res && res.success) {
        await carregarCategorias();
        renderizarListaCategorias();
    } else {
        alert("Erro ao excluir: " + (res.message || 'Erro desconhecido'));
    }
}

function mudarAba(aba) {
    const viewFluxo = document.getElementById('viewFluxo');
    const viewCartao = document.getElementById('viewCartao');
    const tabFluxo = document.getElementById('tabFluxo');
    const tabCartao = document.getElementById('tabCartao');
    const viewCofrinhos = document.getElementById('viewCofrinhos');
    const tabCofrinhos = document.getElementById('tabCofrinhos');

    [viewFluxo, viewCartao, viewCofrinhos].forEach(el => el.classList.add('hidden'));
    [tabFluxo, tabCartao, tabCofrinhos].forEach(el => {
        el.classList.remove('border-blue-600', 'text-blue-600');
        el.classList.add('border-transparent', 'text-gray-500');
    });

    if (aba === 'fluxo') {
        viewFluxo.classList.remove('hidden');
        tabFluxo.classList.add('border-blue-600', 'text-blue-600');
        tabFluxo.classList.remove('border-transparent', 'text-gray-500');
        carregarDashboard();
    } else if (aba === 'cartao') {
        viewCartao.classList.remove('hidden');
        tabCartao.classList.add('border-blue-600', 'text-blue-600');
        tabCartao.classList.remove('border-transparent', 'text-gray-500');
        carregarDadosCartao();
    } else if (aba === 'cofrinhos') {
        viewCofrinhos.classList.remove('hidden');
        tabCofrinhos.classList.add('border-blue-600', 'text-blue-600');
        tabCofrinhos.classList.remove('border-transparent', 'text-gray-500');
        carregarCofrinhos(); // Nova função
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
    const res = await fetchAPI('/cartao/pagar', { method: 'POST' });
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
    const res = await fetchAPI('/cofrinhos', {
        method: 'POST',
        body: JSON.stringify({ nome, meta, cor })
    });
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
    const res = await fetchAPI('/cofrinhos/movimentar', {
        method: 'POST',
        body: JSON.stringify({ id, tipo, valor })
    });
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
    await fetchAPI(`/cofrinhos/${id}`, { method: 'DELETE' });
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
    const res = await fetchAPI(`/cofrinhos/${id}/meta`, {
        method: 'PUT',
        body: JSON.stringify({ meta: novaMeta })
    });
    toggleLoader(false);

    if (res && res.success) {
        document.getElementById('modalDetalhesCofre').classList.add('hidden');
        carregarCofrinhos(); // Recarrega a lista para atualizar os dados
        alert("Meta atualizada com sucesso!");
    } else {
        alert("Erro ao atualizar meta: " + (res.message || "Erro desconhecido"));
    }
});

async function logout() {
    if (!confirm("Deseja realmente encerrar sua sessão?")) return;

    try {
        const response = await fetch('/financeiro_martinelli/api/logout', {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Erro ao sair:', error);
        alert('Não foi possível encerrar a sessão.');
    }
}



// --- UTILITÁRIOS ---
function toggleLoader(show) {
    const el = document.getElementById('loader');
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}