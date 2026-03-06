// public/js/app.js

const API_BASE = '/financeiro_martinelli/api';

// Variáveis de Estado
let categoriasCache = [];
let graficoInstance = null;
let transacoesCache = [];

// Estado do Orçamento
let orcamentoState = {
    modo: 'realizado',       // 'realizado' | 'planejado'
    receita: 0,
    categorias: [],          // [{id, nome, total_realizado, valor_planejado}, ...]
    planejado: {},           // {catId: valor, ...}
    chartInstance: null
};

document.addEventListener('DOMContentLoaded', () => {
    inicializarDatas();
    carregarCategorias(); // Carrega categorias silenciosamente
    carregarDashboard();  // Carrega o dashboard principal

    // Listeners de Filtro
    document.getElementById('filtroMes').addEventListener('change', carregarDashboard);
    document.getElementById('filtroAno').addEventListener('change', carregarDashboard);

    // Opcional: Se o formFixa estiver na tela, adiciona listener
    const formFixa = document.getElementById('formFixa');
    if (formFixa) formFixa.addEventListener('submit', salvarFixa);

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
        notificar("Erro de comunicação com o servidor.", "erro");
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

let linkWppSalvo = null;

function atualizarCards(resumo) {
    const fmt = (v) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    document.getElementById('cardReceitaReal').textContent = fmt(resumo.receitas.receita_realizada);
    document.getElementById('cardReceitaPend').textContent = fmt(resumo.receitas.receita_pendente);

    document.getElementById('cardDespesaReal').textContent = fmt(resumo.despesas.despesa_realizada);
    document.getElementById('cardDespesaPend').textContent = fmt(resumo.despesas.despesa_pendente);

    const valorSaldo = parseFloat(resumo.saldo_atual);
    const elSaldo = document.getElementById('cardSaldoAtual');

    elSaldo.textContent = fmt(valorSaldo);

    if (valorSaldo >= 0) {
        elSaldo.classList.remove('text-red-600');
        elSaldo.classList.add('text-blue-600');
    } else {
        elSaldo.classList.remove('text-blue-600');
        elSaldo.classList.add('text-red-600');
    }

    const elSaldoPrev = document.getElementById('cardSaldoPrevisto');
    const elDetalhePrev = document.getElementById('cardSaldoPrevistoDetalhe');

    elSaldoPrev.textContent = fmt(resumo.saldo_previsto);

    const valorFatura = parseFloat(resumo.fatura_prevista || 0);

    if (valorFatura > 0) {
        elDetalhePrev.innerHTML = `Já descontando <span class="text-red-300 font-bold">${fmt(valorFatura)}</span> de fatura`;
    } else {
        elDetalhePrev.textContent = "Projeção sem dívida de cartão";
    }

    if (resumo.saldo_previsto >= 0) {
        elSaldoPrev.classList.remove('text-red-400');
        elSaldoPrev.classList.add('text-white');
    } else {
        elSaldoPrev.classList.remove('text-white');
        elSaldoPrev.classList.add('text-red-400');
    }

    // Integração do WhatsApp
    if (resumo.link_wpp) {
        linkWppSalvo = resumo.link_wpp;
        atualizarEstiloBotaoWpp(true);
    } else {
        linkWppSalvo = null;
        atualizarEstiloBotaoWpp(false);
    }
}

function atualizarEstiloBotaoWpp(temLink) {
    const btn = document.getElementById('btnWhatsappAction');
    if (!btn) return;
    if (temLink) {
        btn.classList.remove('animate-pulse');
        btn.title = "Acessar Grupo";
    } else {
        btn.title = "Criar Grupo";
    }
}

function acaoWhatsapp() {
    if (linkWppSalvo) {
        window.open(linkWppSalvo, '_blank');
    } else {
        document.getElementById('modalWhatsapp').classList.remove('hidden');
        document.getElementById('wppInput').focus();
    }
}

async function processarCriacaoGrupo(e) {
    e.preventDefault();
    const telefone = document.getElementById('wppInput').value.replace(/\D/g, '');

    if (telefone.length < 10) {
        notificar("Número de telefone parece inválido.", "erro");
        return;
    }

    toggleLoader(true);
    document.getElementById('modalWhatsapp').classList.add('hidden');

    try {
        notificar("Solicitando criação do grupo...", "info");

        const n8nResponse = await fetch('https://sistema-crescer-n8n.vuvd0x.easypanel.host/webhook/criar-grupo-financeiro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: telefone })
        });

        if (!n8nResponse.ok) throw new Error("Erro na comunicação com o robô.");

        const dadosN8n = await n8nResponse.json();
        const item = Array.isArray(dadosN8n) ? dadosN8n[0] : dadosN8n;

        const linkRecebido = item.link || item.groupLink || item.url;
        const idGrupoRecebido = item.id_grupo;

        if (!linkRecebido) {
            throw new Error("O robô não retornou o link do grupo.");
        }

        const saveRes = await fetchAPI('/usuario/wpp', {
            method: 'POST',
            body: JSON.stringify({
                link: linkRecebido,
                id_grupo: idGrupoRecebido
            })
        });

        if (saveRes && saveRes.success) {
            linkWppSalvo = linkRecebido;
            atualizarEstiloBotaoWpp(true);
            notificar("Grupo criado e vinculado com sucesso!", "sucesso");
            setTimeout(() => window.open(linkRecebido, '_blank'), 1500);
        } else {
            throw new Error("Grupo criado, mas erro ao salvar no sistema.");
        }

    } catch (error) {
        console.error(error);
        notificar(error.message || "Erro ao criar grupo.", "erro");
        setTimeout(() => document.getElementById('modalWhatsapp').classList.remove('hidden'), 2000);
    } finally {
        toggleLoader(false);
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
        const dataFmt = t.data.split('-').reverse().slice(0, 2).join('/');

        let badgeStatus = '';
        if (t.status === 'pendente') {
            badgeStatus = `<span class="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded ml-2 font-bold uppercase">Pendente</span>`;
        }

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

async function marcarComoPagoRapido(id, dadosTransacao) {
    const confirmou = await confirmarAcao("Pagar Agora", `Deseja confirmar o pagamento de "${dadosTransacao.descricao}" agora?`, "Sim, Pagar", "bg-green-600");
    if (!confirmou) return;

    toggleLoader(true);
    const corpo = { ...dadosTransacao, status: 'pago' };

    const res = await fetchAPI(`/transacoes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(corpo)
    });

    toggleLoader(false);

    if (res && res.success) {
        carregarDashboard();
        notificar("Marcado como pago!", "sucesso");
    } else {
        notificar("Erro ao processar pagamento.", "erro");
    }
}

// --- GRÁFICO (Chart.js) ---
function atualizarGrafico(dadosAnuais) {
    const ctx = document.getElementById('financeChart').getContext('2d');

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
    document.getElementById('statusInput').checked = true;

    carregarOpcoesCategorias();
    document.getElementById('modalTransacao').classList.remove('hidden');
}

function fecharModalTransacao() {
    document.getElementById('modalTransacao').classList.add('hidden');
}

window.editarTransacao = function (t) {
    document.getElementById('transacaoId').value = t.id;
    document.getElementById('descInput').value = t.descricao;
    document.getElementById('valorInput').value = t.valor;
    document.getElementById('dataInput').value = t.data;
    document.getElementById('tipoInput').value = t.tipo;
    document.getElementById('statusInput').checked = (t.status === 'pago');
    document.getElementById('modalTitulo').textContent = 'Editar Transação';

    carregarOpcoesCategorias(t.id_categoria);
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
        res = await fetchAPI(`/transacoes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    } else {
        res = await fetchAPI('/transacoes', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    toggleLoader(false);
    if (res && res.success) {
        fecharModalTransacao();
        carregarDashboard();
        notificar("Transação salva com sucesso!", "sucesso");
    } else {
        notificar(res.message || "Erro ao salvar.", "erro");
    }
}

window.excluirTransacao = async function (id) {
    const confirmou = await confirmarAcao("Excluir Transação", "Você tem certeza que deseja apagar este registro? Isso não pode ser desfeito.");
    if (!confirmou) return;

    toggleLoader(true);
    const res = await fetchAPI(`/transacoes/${id}`, { method: 'DELETE' });
    toggleLoader(false);

    if (res && res.success) {
        notificar("Transação excluída com sucesso!", "sucesso");
        carregarDashboard();
    } else {
        notificar("Erro ao excluir transação.", "erro");
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
    renderizarListaCategorias();
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

function renderizarListaCategorias(filtro = 'all') {
    const listaEl = document.getElementById('listaCategoriasModal');
    listaEl.innerHTML = '';

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
        const isSistema = (cat.id_usuario === null);

        const acoesHtml = isSistema
            ? `<span class="text-xs text-gray-400 italic flex items-center gap-1"><i class="ph ph-lock"></i> Padrão</span>`
            : `<div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick='prepararEdicaoCategoria(${JSON.stringify(cat)})' class="p-1.5 text-blue-600 hover:bg-blue-100 rounded">
                    <i class="ph ph-pencil-simple"></i>
                </button>
                <button onclick="excluirCategoria(${cat.id})" class="p-1.5 text-red-600 hover:bg-red-100 rounded">
                    <i class="ph ph-trash"></i>
                </button>
               </div>`;

        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 mb-2 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-300 transition group";

        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${corTipo}">${cat.tipo}</span>
                <span class="text-sm font-semibold text-gray-700">${cat.nome}</span>
            </div>
            ${acoesHtml}
        `;
        listaEl.appendChild(div);
    });
}

function filtrarListaCategorias(tipo) {
    renderizarListaCategorias(tipo);
}

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

async function salvarCategoria(e) {
    e.preventDefault();
    toggleLoader(true);

    const id = document.getElementById('catIdEdit').value;
    const nome = document.getElementById('catNomeInput').value;
    const tipo = document.getElementById('catTipoInput').value;

    let res;

    if (id) {
        res = await fetchAPI(`/categorias/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ nome, tipo })
        });
    } else {
        res = await fetchAPI('/categorias', {
            method: 'POST',
            body: JSON.stringify({ nome, tipo })
        });
    }

    toggleLoader(false);

    if (res && res.success) {
        await carregarCategorias();
        renderizarListaCategorias();
        resetarFormCategoria();
        notificar("Categoria salva com sucesso!");
    } else {
        notificar("Erro ao salvar categoria: " + (res.message || 'Erro desconhecido'), "erro");
    }
}

async function excluirCategoria(id) {
    const confirmou = await confirmarAcao("Excluir Categoria", "Tem certeza? Transações com esta categoria ficarão 'Sem Categoria'.");
    if (!confirmou) return;

    toggleLoader(true);
    const res = await fetchAPI(`/categorias/${id}`, { method: 'DELETE' });
    toggleLoader(false);

    if (res && res.success) {
        await carregarCategorias();
        renderizarListaCategorias();
        notificar("Categoria excluída com sucesso.");
    } else {
        notificar("Erro ao excluir: " + (res.message || 'Erro desconhecido'), "erro");
    }
}

function mudarAba(aba) {
    ['viewFluxo', 'viewCartao', 'viewCofrinhos', 'viewPlanejamento'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    ['tabFluxo', 'tabCartao', 'tabCofrinhos', 'tabPlanejamento'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('border-blue-600', 'text-blue-600');
        el.classList.add('border-transparent', 'text-gray-500');
    });

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
        const total = parseFloat(res.data.total);
        document.getElementById('faturaValor').textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
        notificar("A fatura já está zerada.", "info");
        return;
    }

    const confirmou = await confirmarAcao("Pagar Fatura", `Confirma o pagamento da fatura no valor de ${valorTexto}? Isso marcará todas as compras como 'Pagas'.`, "Pagar Agora", "bg-purple-600");
    if (!confirmou) return;

    toggleLoader(true);
    const res = await fetchAPI('/cartao/pagar', { method: 'POST' });
    toggleLoader(false);

    if (res && res.success) {
        notificar("Fatura paga com sucesso!", "sucesso");
        carregarDadosCartao();
    } else {
        notificar("Erro ao pagar fatura.", "erro");
    }
}

// --- COFRINHOS ---
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

function abrirModalNovoCofrinho() {
    document.getElementById('modalNovoCofrinho').classList.remove('hidden');
    document.getElementById('cofreNome').value = '';
    document.getElementById('cofreMeta').value = '';
}

function selectCorCofre(cor) {
    document.getElementById('cofreCor').value = cor;
    // Opcional: Feedback visual ao selecionar cor poderia vir aqui
}

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
        notificar("Caixinha criada com sucesso!");
    } else {
        notificar('Erro ao criar caixinha.', 'erro');
    }
});

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
        notificar("Digite um valor válido.", "aviso");
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
        carregarDashboard();
        notificar(tipo === 'deposito' ? 'Dinheiro guardado!' : 'Dinheiro resgatado!', 'sucesso');
    } else {
        notificar(res.message || "Erro na operação.", "erro");
    }
}

function abrirDetalhesCofre(cofreString) {
    const c = JSON.parse(decodeURIComponent(cofreString));

    const saldo = parseFloat(c.saldo_atual);
    const meta = parseFloat(c.meta);
    let porcentagem = meta > 0 ? (saldo / meta) * 100 : 0;
    if (porcentagem > 100) porcentagem = 100;
    const falta = meta - saldo;

    document.getElementById('idCofreDetalhe').value = c.id;

    // Tratando caso exista o input novo do index atualizado ou h2 antigo
    const inputNome = document.getElementById('detalheNomeCofreInput');
    if (inputNome) {
        inputNome.value = c.nome;
    } else {
        document.getElementById('detalheNomeCofre').textContent = c.nome;
    }

    const header = document.getElementById('headerDetalheCofre');
    const bar = document.getElementById('barDetalheCofre');

    header.className = header.className.replace(/bg-\w+-\d+/g, '');
    bar.className = bar.className.replace(/bg-\w+-\d+/g, '');

    header.classList.add(c.cor_fundo);
    bar.classList.add(c.cor_fundo);

    document.getElementById('detalheSaldoCofre').textContent = saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('detalheMetaCofre').textContent = meta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    bar.style.width = `${porcentagem}%`;
    const elPorcentagem = document.getElementById('detalhePorcentagem');
    elPorcentagem.textContent = `${porcentagem.toFixed(1)}%`;

    const elFalta = document.getElementById('detalheFalta');
    if (falta > 0) {
        elFalta.textContent = `Faltam ${falta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para a meta!`;
        elFalta.className = 'text-sm text-gray-500 font-medium';
    } else {
        elFalta.textContent = "Parabéns! Meta atingida! 🎉";
        elFalta.className = 'text-sm text-green-600 font-bold';
    }

    document.getElementById('novaMetaInput').value = meta;

    document.getElementById('modalDetalhesCofre').classList.remove('hidden');
}

// Salvar Meta (e possivelmente Nome)
const formEditCofre = document.getElementById('formEditarCofre') || document.getElementById('formEditarMeta');
if (formEditCofre) {
    formEditCofre.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('idCofreDetalhe').value;
        const novaMeta = document.getElementById('novaMetaInput').value;
        const inputNome = document.getElementById('detalheNomeCofreInput');
        const novoNome = inputNome ? inputNome.value : null;

        if (novaMeta < 0) {
            notificar("A meta não pode ser negativa.", "aviso");
            return;
        }

        const payload = { meta: novaMeta };
        if (novoNome && novoNome.trim() !== '') {
            payload.nome = novoNome;
        }

        toggleLoader(true);
        // O Endpoint pode ser /cofrinhos/ID (PUT) dependendo do seu backend atual
        // Ajustando para tentar /cofrinhos/ID que permite editar tudo
        let endpoint = `/cofrinhos/${id}`;

        const res = await fetchAPI(endpoint, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        toggleLoader(false);

        if (res && res.success) {
            document.getElementById('modalDetalhesCofre').classList.add('hidden');
            carregarCofrinhos();
            notificar("Caixinha atualizada com sucesso!");
        } else {
            notificar("Erro ao atualizar: " + (res.message || "Erro desconhecido"), "erro");
        }
    });
}

async function excluirCofrePeloModal() {
    const id = document.getElementById('idCofreDetalhe').value;
    const saldoTexto = document.getElementById('detalheSaldoCofre').textContent;

    const confirmou = await confirmarAcao("Excluir Caixinha", `Tem certeza que deseja excluir esta caixinha?\n\nO saldo atual (${saldoTexto}) será devolvido para sua conta principal.`, "Excluir", "bg-red-600");
    if (!confirmou) return;

    toggleLoader(true);
    const res = await fetchAPI(`/cofrinhos/${id}`, { method: 'DELETE' });
    toggleLoader(false);

    if (res && res.success) {
        document.getElementById('modalDetalhesCofre').classList.add('hidden');
        carregarCofrinhos();
        carregarDashboard();
        notificar("Caixinha excluída e saldo estornado para a conta!");
    } else {
        notificar("Erro ao excluir: " + (res.message || "Erro desconhecido"), "erro");
    }
}

// --- FIXAS E RECORRENTES ---
function abrirModalFixas() {
    document.getElementById('modalFixas').classList.remove('hidden');
    carregarOpcoesCategoriasFixas();
    carregarListaFixas();
}

function carregarOpcoesCategoriasFixas() {
    const select = document.getElementById('fixaCategoria');
    select.innerHTML = '<option value="">Sem categoria</option>';

    categoriasCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        select.appendChild(opt);
    });
}

async function carregarListaFixas() {
    const listaEl = document.getElementById('listaFixas');
    listaEl.innerHTML = '<div class="text-center text-gray-400 mt-4">Carregando...</div>';

    const res = await fetchAPI('/fixas');

    if (res && res.success) {
        listaEl.innerHTML = '';
        if (res.data.length === 0) {
            listaEl.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="ph ph-calendar-check text-4xl mb-2"></i><span>Nenhuma conta fixa cadastrada.</span></div>';
            return;
        }

        res.data.forEach(f => {
            const isDespesa = f.tipo === 'despesa';
            const corIcone = isDespesa ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50';

            let htmlStatus = '';
            if (f.status_mes_atual === 'pago') {
                htmlStatus = `<span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><i class="ph ph-check-circle"></i> Pago</span>`;
            } else if (f.status_mes_atual === 'pendente') {
                htmlStatus = `<span class="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><i class="ph ph-clock"></i> Pendente</span>`;
            } else {
                htmlStatus = `<span class="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit">Não gerado</span>`;
            }

            let textoRecorrencia = '<span class="text-blue-600"><i class="ph ph-infinity"></i> Fixo Mensal</span>';

            if (f.limite_parcelas > 0) {
                if (f.parcelas_geradas >= f.limite_parcelas) {
                    textoRecorrencia = `<span class="text-gray-400 font-bold">Finalizado (${f.parcelas_geradas}/${f.limite_parcelas})</span>`;
                    htmlStatus = '';
                } else {
                    textoRecorrencia = `<span class="text-purple-600 font-bold">Parcela ${parseInt(f.parcelas_geradas) + 1}/${f.limite_parcelas}</span>`;
                }
            }

            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-4 mb-3 rounded-lg border border-gray-100 hover:shadow-sm transition bg-white";

            div.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-lg ${corIcone} flex flex-col items-center justify-center font-bold shadow-sm shrink-0">
                        <span class="text-xs uppercase">DIA</span>
                        <span class="text-lg leading-none">${f.dia_vencimento}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <h4 class="font-bold text-gray-800 leading-tight">${f.descricao}</h4>
                            ${htmlStatus}
                        </div>
                        <div class="flex items-center gap-2 text-xs">
                            <span class="text-gray-500">${f.categoria_nome || 'Sem Categoria'}</span>
                            <span class="text-gray-300">|</span>
                            ${textoRecorrencia}
                        </div>
                    </div>
                </div>
                <div class="text-right shrink-0 ml-2">
                    <div class="font-mono font-bold text-gray-700 mb-1">
                        ${parseFloat(f.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <button onclick="excluirFixa(${f.id})" class="text-red-400 hover:text-red-600 text-xs font-bold flex items-center justify-end gap-1 ml-auto">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            `;
            listaEl.appendChild(div);
        });
    }
}

async function salvarFixa(e) {
    e.preventDefault();
    toggleLoader(true);

    const body = {
        descricao: document.getElementById('fixaDesc').value,
        valor: document.getElementById('fixaValor').value,
        dia: document.getElementById('fixaDia').value,
        tipo: document.getElementById('fixaTipo').value,
        id_categoria: document.getElementById('fixaCategoria').value,
        limite_parcelas: document.getElementById('fixaLimite').value
    };

    const res = await fetchAPI('/fixas', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    toggleLoader(false);

    if (res && res.success) {
        document.getElementById('formFixa').reset();
        carregarListaFixas();
        carregarDashboard();
        notificar("Regra criada com sucesso!", "sucesso");
    } else {
        notificar("Erro ao salvar.", "erro");
    }
}

async function excluirFixa(id) {
    const confirmou = await confirmarAcao("Parar Regra Fixa", "Deseja parar de gerar essa conta automaticamente? As transações passadas não serão apagadas.");
    if (!confirmou) return;

    toggleLoader(true);
    await fetchAPI(`/fixas/${id}`, { method: 'DELETE' });
    toggleLoader(false);

    carregarListaFixas();
    notificar("Regra fixa excluída.", "sucesso");
}

function toggleMenuMobile() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('hidden');
}

// Fechar menu ao clicar fora
document.addEventListener('click', (e) => {
    const menu = document.getElementById('mobileMenu');
    const btn = document.querySelector('button[onclick="toggleMenuMobile()"]');

    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target) && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

// --- LÓGICA DE NOTIFICAÇÕES (TOAST E MODAL) ---
function notificar(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const config = {
        sucesso: { icone: 'ph-check-circle', cor: 'bg-green-500', titulo: 'Sucesso' },
        erro: { icone: 'ph-x-circle', cor: 'bg-red-500', titulo: 'Erro' },
        info: { icone: 'ph-info', cor: 'bg-blue-500', titulo: 'Informação' },
        aviso: { icone: 'ph-warning', cor: 'bg-yellow-500', titulo: 'Atenção' }
    }[tipo];

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center w-full max-w-xs p-4 mb-4 text-white rounded-xl shadow-lg transform transition-all duration-300 translate-x-full opacity-0 ${config.cor}`;

    toast.innerHTML = `
        <div class="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 text-white bg-white/20 rounded-lg">
            <i class="ph ${config.icone} text-xl"></i>
        </div>
        <div class="ml-3 text-sm font-bold">${mensagem}</div>
        <button type="button" class="ml-auto -mx-1.5 -my-1.5 bg-transparent text-white rounded-lg focus:ring-2 focus:ring-white/50 p-1.5 hover:bg-white/20 inline-flex h-8 w-8" onclick="this.parentElement.remove()">
            <i class="ph ph-x"></i>
        </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 300);
    }, 4000);
}

function confirmarAcao(titulo, mensagem, textoBotao = 'Sim, confirmar', corBotao = 'bg-red-600') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalConfirmacao');
        const content = document.getElementById('modalConfirmacaoContent');
        const tituloEl = document.getElementById('confirmTitulo');
        const msgEl = document.getElementById('confirmMensagem');
        const btnSim = document.getElementById('btnConfirmarSim');
        const btnNao = document.getElementById('btnConfirmarNao');

        if (!modal) { resolve(confirm(mensagem)); return; }

        tituloEl.textContent = titulo;
        msgEl.textContent = mensagem;
        btnSim.textContent = textoBotao;

        btnSim.className = `flex-1 text-white text-sm font-bold py-2 rounded-lg shadow-lg transition hover:brightness-90 ${corBotao}`;

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }, 10);

        const fechar = (resultado) => {
            modal.classList.add('opacity-0');
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                resolve(resultado);
            }, 300);
        };

        const novoBtnSim = btnSim.cloneNode(true);
        const novoBtnNao = btnNao.cloneNode(true);
        btnSim.parentNode.replaceChild(novoBtnSim, btnSim);
        btnNao.parentNode.replaceChild(novoBtnNao, btnNao);

        novoBtnSim.addEventListener('click', () => fechar(true));
        novoBtnNao.addEventListener('click', () => fechar(false));
    });
}

// --- UTILITÁRIOS ---
function toggleLoader(show) {
    const el = document.getElementById('loader');
    if (!el) return;
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

async function logout() {
    const confirmou = await confirmarAcao("Sair", "Deseja realmente encerrar sua sessão?", "Sair do Sistema");
    if (!confirmou) return;

    try {
        const response = await fetch('/financeiro_martinelli/api/logout', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Erro ao sair:', error);
        notificar('Não foi possível encerrar a sessão.', 'erro');
    }
}


// ============================================================
// ===== PLANEJAMENTO FUTURO — SIMULADOR FINANCEIRO ============
// ============================================================

let planejamentoChartInstance = null;

const PLAN_RENTABILIDADE_ANUAL = 0.12;
const PLAN_IPCA_ANUAL = 0.05;
const PLAN_IR_INVESTIMENTO = 0.15;
const PLAN_IDADE_MAX = 95;

const taxaMensalBruta = Math.pow(1 + PLAN_RENTABILIDADE_ANUAL, 1 / 12) - 1;
const taxaMensalIPCA = Math.pow(1 + PLAN_IPCA_ANUAL, 1 / 12) - 1;
const taxaMensalLiqAccum = taxaMensalBruta * (1 - PLAN_IR_INVESTIMENTO);

function calcularAliquotaEfetivaIR(rendaMensalBruta) {
    if (rendaMensalBruta <= 2824.00) return 0;
    if (rendaMensalBruta <= 3751.05) {
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
    const imposto = (rendaMensalBruta - 6101.06) * 0.275
        + (6101.06 - 4664.68) * 0.225
        + (4664.68 - 3751.05) * 0.15
        + (3751.05 - 2824.00) * 0.075;
    return imposto / rendaMensalBruta;
}

function simularTrajetoria(idadeAtual, idadeAposentadoria, aporteMensal, rendaDesejadaHoje, patrimonioInicial) {
    const resultado = [];
    let patrimonio = patrimonioInicial;
    let fatorIPCA = 1;

    const totalMeses = (PLAN_IDADE_MAX - idadeAtual) * 12;
    const mesesAcumulacao = (idadeAposentadoria - idadeAtual) * 12;

    for (let mes = 0; mes <= totalMeses; mes++) {
        const idadeAtualMes = idadeAtual + mes / 12;
        fatorIPCA *= (1 + taxaMensalIPCA);

        if (patrimonio <= 0) {
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
            const rendaNominalDesejada = rendaDesejadaHoje * fatorIPCA;
            const lucroMensal = patrimonio * taxaMensalBruta;
            const irInvestimento = lucroMensal * PLAN_IR_INVESTIMENTO;
            patrimonio += lucroMensal - irInvestimento;

            const aliquota = calcularAliquotaEfetivaIR(rendaNominalDesejada);
            const sacoBruto = rendaNominalDesejada / (1 - aliquota);

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

function fmtPlan(v) {
    if (Math.abs(v) >= 1e6) return 'R$ ' + (v / 1e6).toFixed(2).replace('.', ',') + ' M';
    if (Math.abs(v) >= 1e3) return 'R$ ' + (v / 1e3).toFixed(1).replace('.', ',') + ' K';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcularRendaMensalLiquida(patrimonio) {
    const lucroMensal = patrimonio * taxaMensalBruta;
    const lucroLiquidoInv = lucroMensal * (1 - PLAN_IR_INVESTIMENTO);
    const aliquota = calcularAliquotaEfetivaIR(lucroLiquidoInv);
    return lucroLiquidoInv * (1 - aliquota);
}

function recalcularPlanejamento() {
    const idadeAtual = parseInt(document.getElementById('planIdadeAtual').value) || 30;
    const idadeAposentadoria = parseInt(document.getElementById('planIdadeAposentadoria').value) || 55;
    const aporteMensal = parseFloat(document.getElementById('planAporte').value) || 0;
    const rendaDesejada = parseFloat(document.getElementById('planRenda').value) || 0;
    const patrimonioInicial = parseFloat(document.getElementById('planPatrimonioInicial').value) || 0;

    if (idadeAposentadoria <= idadeAtual) {
        document.getElementById('planIdadeAposentadoria').value = idadeAtual + 1;
        return recalcularPlanejamento();
    }

    const dados = simularTrajetoria(idadeAtual, idadeAposentadoria, aporteMensal, rendaDesejada, patrimonioInicial);

    const pontosPorAno = dados.filter((_, i) => i % 12 === 0);

    const idades = pontosPorAno.map(p => p.idade);
    const patrimoniosReais = pontosPorAno.map(p => p.patrimonioReal);
    const fases = pontosPorAno.map(p => p.fase);

    const idxAposentadoria = pontosPorAno.findIndex(p => p.idade >= idadeAposentadoria);
    const patrimonioNaAposentadoria = idxAposentadoria >= 0 ? pontosPorAno[idxAposentadoria].patrimonioReal : 0;
    const patrimonioNominalNaAp = idxAposentadoria >= 0 ? pontosPorAno[idxAposentadoria].patrimonioNominal : 0;

    const rendaMensalGeradaNominal = calcularRendaMensalLiquida(patrimonioNominalNaAp);
    const fatorIPCAnaAp = Math.pow(1 + PLAN_IPCA_ANUAL, idadeAposentadoria - idadeAtual);
    const rendaMensalGeradaReal = rendaMensalGeradaNominal / fatorIPCAnaAp;

    const primeiroZero = dados.findIndex(p => p.patrimonioNominal <= 0);
    let idadeSustenta;
    if (primeiroZero === -1) {
        idadeSustenta = PLAN_IDADE_MAX + '+';
    } else {
        idadeSustenta = (idadeAtual + primeiroZero / 12).toFixed(0) + ' anos';
    }

    const isIndependente = rendaMensalGeradaReal >= rendaDesejada;

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

    const idxAnot = idades.findIndex(id => id >= idadeAposentadoria);
    renderizarGraficoPlanejamento(idades, pontosPorAno, idxAnot >= 0 ? idxAnot : 0, idadeAposentadoria);
}

function renderizarGraficoPlanejamento(idades, pontos, idxAnnot, idadeAposentadoria) {
    const ctx = document.getElementById('planejamentoChart').getContext('2d');

    if (planejamentoChartInstance) planejamentoChartInstance.destroy();

    const dadosAcum = pontos.map((p, i) => i <= idxAnnot ? p.patrimonioReal : null);
    const dadosRetirada = pontos.map((p, i) => i >= idxAnnot ? p.patrimonioReal : null);

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

function sincronizarInput(sliderId, inputId) {
    document.getElementById(inputId).value = document.getElementById(sliderId).value;
}

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

async function carregarOrcamento() {
    const mes = document.getElementById('filtroMes').value;
    const ano = document.getElementById('filtroAno').value;

    const res = await fetchAPI(`/orcamento?mes=${mes}&ano=${ano}`);
    if (!res || !res.success) return;

    const d = res.data;
    orcamentoState.receita = d.receita || 0;
    orcamentoState.categorias = d.categorias || [];

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
    const { modo, receita } = orcamentoState;
    const alertSemReceita = document.getElementById('alertSemReceita');
    const painelSliders = document.getElementById('painelSliders');
    const painelLegenda = document.getElementById('painelLegendaRealizado');

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
            'Você alocou ' + pct + '% acima da receita. Precisa de mais R$ ' +
            deficit.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' de renda para cobrir os gastos planejados.';
    } else {
        alertDeficit.classList.add('hidden');
    }

    const labels = ['Renda', 'Gastos'];

    const datasets = [{
        label: 'Renda',
        data: [receita, 0],
        backgroundColor: 'rgba(22,163,74,0.9)',
        borderColor: 'rgba(22,163,74,1)',
        borderWidth: 1,
        borderRadius: 8,
        stack: 'stack1'
    }];

    cats.forEach((c, i) => {
        const valor = modo === 'realizado' ? c.total_realizado : (planejado[c.id] || 0);
        datasets.push({
            label: c.nome,
            data: [0, valor],
            backgroundColor: getCatColor(i, 0.7),
            borderColor: getCatColor(i, 1),
            borderWidth: 1,
            borderRadius: i === cats.length - 1 ? 8 : 0,
            stack: 'stack1'
        });
    });

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
    cats.sort((a, b) => b.total_realizado - a.total_realizado);

    if (cats.length === 0) {
        lista.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Nenhuma despesa registrada neste mês.</p>';
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

    toggleLoader(true);
    const res = await fetchAPI('/orcamento', {
        method: 'POST',
        body: JSON.stringify({
            mes: parseInt(mes),
            ano: parseInt(ano),
            alocacoes: planejado
        })
    });
    toggleLoader(false);

    if (res && res.success) {
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
        notificar("Planejamento salvo com sucesso!", "sucesso");
    } else {
        notificar("Erro ao salvar planejamento.", "erro");
    }
}