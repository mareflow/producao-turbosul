const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('comercial.html', 'utf8');
function extract(name) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert.ok(start >= 0, name);
    for (const tail of source.slice(start).matchAll(/^[ \t]{0,8}\}/gm)) {
        const text = source.slice(start, start + tail.index + tail[0].length);
        try { new vm.Script(text); return text; } catch {}
    }
    throw Error('Função não encontrada: ' + name);
}
function node(html = '') {
    let cards = [], content = '';
    const classes = new Set();
    const element = { textContent: '', value: '', dataset: {}, onclick: null,
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
            toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
        querySelectorAll: () => cards,
        addEventListener() { throw Error('A vinculação de clique não deve acumular listeners'); },
        insertAdjacentHTML(_, text) { element.innerHTML = content + text; }
    };
    Object.defineProperty(element, 'innerHTML', { get: () => content, set(text) {
        content = text;
        cards = [...text.matchAll(/<div class="os-card ([^"]*)"\s+data-order-id="([^"]+)"/g)].map(match => {
            const card = node(); card.dataset.orderId = match[2];
            if (match[1].split(/\s+/).includes('active')) card.classList.add('active');
            return card;
        });
    } });
    element.innerHTML = html;
    return element;
}
const row = id => ({ id, business_id: 'ORÇ-' + id, model: 'Teste', client: 'Teste', status: 'Aguardando Aprovação Comercial' });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function setup() {
    const container = node(), loading = node(), pdf = node(), editor = node();
    let orders = [row('003')], failure = null, lookup = async () => ({ data: [], error: null });
    let response = async table => table === 'service_orders' ? { data: orders, error: failure } : lookup();
    const ctx = vm.createContext({ window: {}, document: { addEventListener() {}, getElementById: () => pdf }, console: { error() {}, warn() {} }, currentOrders: [], activeOSId: null,
        filaContainer: container, loadingMessage: loading, renders: [],
        getUrgencyBadge: () => '',
        populateDecisionPanel(order) { ctx.activeOSId = order.id; ctx.renders.push(order.id); editor.value = 'Carregado ' + order.id; },
        supabaseClient: { from(table) { const filters = {}; const q = {
            select() { return q; }, in() { return q; }, eq(k, v) { filters[k] = v; return q; },
            single() { return q; }, then(resolve, reject) { return Promise.resolve(response(table, filters)).then(resolve, reject); }
        }; return q; } }
    });
    vm.runInContext(fs.readFileSync('js/production-flow.js', 'utf8'), ctx);
    for (const name of ['renderOrderCard', 'loadSalesOrders', 'addCardClickListeners', 'loadPDFButtons', 'rejectSalesOrder']) vm.runInContext(extract(name), ctx);
    return { ctx, container, loading, pdf, editor, orders: value => orders = value,
        fail: value => failure = value, response: fn => response = fn, lookup: fn => lookup = fn };
}
(async () => {
    const test = setup(), { ctx, container, editor, loading } = test;
    await ctx.loadSalesOrders();
    assert.equal(container.querySelectorAll().length, 1);
    await container.querySelectorAll()[0].onclick({ currentTarget: container.querySelectorAll()[0] });
    editor.value = 'Observação ainda não salva';
    for (let i = 0; i < 30; i++) await ctx.loadSalesOrders(true);
    assert.equal(container.querySelectorAll().length, 1, '30 atualizações deixam só um card');
    assert.ok(container.querySelectorAll()[0].classList.contains('active'), 'seleção preservada');
    assert.equal(editor.value, 'Observação ainda não salva');
    assert.equal(ctx.renders.length, 1, 'atualização não reabre o formulário');
    ctx.addCardClickListeners(); ctx.addCardClickListeners();
    const selected = container.querySelectorAll()[0];
    await selected.onclick({ currentTarget: selected });
    assert.equal(ctx.renders.length, 1, 'clicar no selecionado não apaga a edição');
    test.fail(Error('Sem rede'));
    assert.equal(await ctx.loadSalesOrders(true), false);
    assert.equal(container.querySelectorAll().length, 1, 'erro preserva a última fila');
    assert.equal(loading.classList.contains('hidden'), false, 'erro fica visível fora da fila');
    test.fail(null); test.orders([]); await ctx.loadSalesOrders(true);
    assert.equal(container.querySelectorAll().length, 0);
    test.orders([row('004')]); await ctx.loadSalesOrders(true);
    assert.equal(container.querySelectorAll().length, 1, 'retorno da fila vazia não acumula placeholder/cards');

    const race = setup(), first = deferred(), second = deferred(); let reads = 0;
    race.response(() => (++reads === 1 ? first.promise : second.promise));
    const oldRead = race.ctx.loadSalesOrders(); await Promise.resolve();
    const newRead = race.ctx.loadSalesOrders(true); await Promise.resolve();
    second.resolve({ data: [row('NEW')], error: null }); await newRead;
    first.resolve({ data: [row('OLD')], error: null }); await oldRead;
    assert.equal(race.ctx.currentOrders[0].id, 'NEW', 'resposta antiga não substitui a fila atual');

    const clicks = setup(), slow = deferred();
    clicks.orders([row('A'), row('B')]); await clicks.ctx.loadSalesOrders();
    clicks.response((table, filters) => table === 'checklist_analysis_general' && filters.service_order_id === 'A'
        ? slow.promise : { data: [], error: null });
    const [a, b] = clicks.container.querySelectorAll();
    const openA = a.onclick({ currentTarget: a });
    await b.onclick({ currentTarget: b });
    slow.resolve({ data: [], error: null }); await openA;
    assert.deepEqual(Array.from(clicks.ctx.renders), ['B'], 'último clique prevalece sobre consulta lenta');
    const pdfRead = deferred(); clicks.response(() => pdfRead.promise);
    const oldPDF = clicks.ctx.loadPDFButtons('A');
    clicks.pdf.innerHTML = 'PDF do orçamento B';
    pdfRead.resolve({ data: { sector_pdfs: { vendas: 'pdf-antigo-A' } } }); await oldPDF;
    assert.equal(clicks.pdf.innerHTML, 'PDF do orçamento B', 'PDF de outro orçamento não substitui o atual');

    const broken = setup(); await broken.ctx.loadSalesOrders();
    broken.lookup(async () => ({ data: null, error: Error('Checklist indisponível') }));
    const card = broken.container.querySelectorAll()[0]; await card.onclick({ currentTarget: card });
    assert.equal(broken.ctx.renders.length, 0, 'falha de consulta não abre checklist vazio');
    assert.equal(broken.loading.classList.contains('hidden'), false);

    // O mesmo helper de status usado em produção, com esquema estrito e sem banco real.
    const rejection = setup(), record = { ...row('003'), observation: 'Observação técnica original' };
    rejection.ctx.supabaseClient = { from(table) {
        assert.equal(table, 'service_orders'); let patch = null; const filters = [];
        const q = { select() { return q; }, eq(k, v) { filters.push([k, v]); return q; },
            update(values) { patch = values; Object.keys(values).forEach(k => assert.ok(['status', 'updated_at', 'observation'].includes(k), k)); return q; },
            single() { return q; }, maybeSingle() { return q; }, then(resolve, reject) {
                const matches = filters.every(([k, v]) => record[k] === v);
                if (patch && matches) Object.assign(record, patch);
                return Promise.resolve({ data: matches ? { ...record } : null, error: null }).then(resolve, reject);
            } }; return q;
    } };
    await rejection.ctx.rejectSalesOrder('003', 'Cliente não autorizou');
    assert.equal(record.status, 'Cancelada');
    assert.equal(record.observation, 'Observação técnica original\nMotivo da reprovação comercial: Cliente não autorizou');
    record.status = 'Aguardando Triagem';
    await assert.rejects(rejection.ctx.rejectSalesOrder('003', 'Tela antiga'), /não está mais nesta etapa/);
    assert.equal(record.status, 'Aguardando Triagem');
    console.log('OK: fila comercial sem duplicação, edição preservada, cliques/consultas/PDFs concorrentes, falhas de leitura e reprovação no esquema real');
})().catch(error => { console.error(error); process.exitCode = 1; });
