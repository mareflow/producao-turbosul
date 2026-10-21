const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('quadro-producao.html', 'utf8');
const start = source.indexOf('async function abrirRastreio(');
const end = source.indexOf('        function fecharModalRastreio(', start);
const core = ['EIXO', 'ROTOR', 'CCE', 'REPAROS'];
function fixture() {
    return {
        component_tracking: [...core, 'CONJUNTO ROTATIVO'].map(component_name => ({ component_name, current_stage: 'MONTAGEM', verdict_vendas: 'TROCAR CONJUNTO' }))
            .concat([{ component_name: 'CCO', current_stage: 'DESMONTAGEM' }, { component_name: 'CT', current_stage: 'COMPRA', status: 'AGUARDANDO_COMPRA' }]),
        checklist_analysis_general: core.map(item_name => ({ item_name, decisao_vendas: 'TROCAR CONJUNTO' })),
        triage_parts: core.map(part_name => ({ part_name, availability: 'STOCK', is_resolved: true }))
            .concat([{ part_name: 'CARCAÇA DE TURBINA (CT)', availability: 'PURCHASE_REQUEST', is_resolved: false }]),
        service_orders: { status: 'Aguardando Desmontagem OS' }
    };
}
function node() {
    const classes = new Set();
    return { innerHTML: '', innerText: '', classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) } };
}
async function render(tables, failTable = '') {
    const nodes = new Map(), errors = [];
    const ctx = vm.createContext({ window: {}, document: { addEventListener() {}, getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); } },
        console: { error: (...args) => errors.push(args) }, COLUMNS: [{ id: 'producao' }], currentSearchTerm: '', currentViewMode: 'production', isOrderInStandby: () => false,
        supabaseClient: { from(table) {
            const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; },
                then(resolve) { return Promise.resolve(resolve({ data: tables[table], error: table === failTable ? Error('Falha de leitura') : null })); } }; return q;
        } }
    });
    vm.runInContext(fs.readFileSync('js/production-flow.js', 'utf8'), ctx);
    vm.runInContext(source.slice(start, end), ctx);
    vm.runInContext(source.slice(source.indexOf('        function getOrderColumnId('), start), ctx);
    ctx.allOrders = [{ id: 'os', business_id: 'O.S-003', status: 'Em Produção', tracking: ctx.window.ProductionFlow.tracking({ full_tracking: tables.component_tracking, analysis: tables.checklist_analysis_general, purchase_parts: tables.triage_parts }) }];
    ctx.distributeOrders();
    await ctx.abrirRastreio('os', 'O.S-003', 'Modelo teste');
    const html = nodes.get('components-list').innerHTML;
    return { html, nodes, errors, labels: [...html.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)].map(m => m[1]) };
}
function assertFull(result, location) {
    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.labels, ['CCO', 'CT', 'CONJUNTO ROTATIVO (FULL)']);
    const fullRow = result.html.slice(result.html.indexOf('CONJUNTO ROTATIVO (FULL)'));
    assert.ok(fullRow.includes('Inclui eixo, rotor, CCE e reparos'));
    assert.ok(fullRow.includes('>' + location + '</span>'), 'Localização do FULL: ' + location);
}
(async () => {
    const live = fixture(), before = JSON.stringify(live);
    const example = await render(live);
    assertFull(example, 'MONTAGEM');
    const summary = example.nodes.get('col-producao').innerHTML;
    assert.ok(summary.includes('Desmonte: 1'), 'Desmontagem não é contada como Montagem');
    assert.ok(summary.includes('Montagem: 1'), 'FULL conta como uma unidade na Montagem');
    assert.ok(summary.includes('Compra: 1'), 'CT permanece separado em Compra');
    assert.equal(JSON.stringify(live), before, 'apenas apresentação; não altera componentes/dados');
    for (const [availability, expected] of [['PURCHASE_REQUEST', 'AGUARDANDO COMPRA'], ['STOCK_REQUEST', 'AGUARDANDO RETIRADA DO ESTOQUE'], ['PENDING', 'AGUARDANDO DECISÃO NA TRIAGEM']]) {
        const data = fixture();
        data.triage_parts = core.map(part_name => ({ part_name, availability, is_resolved: false }));
        assertFull(await render(data), expected);
    }
    const partial = fixture();
    partial.triage_parts.find(p => p.part_name === 'REPAROS').availability = 'PURCHASE_REQUEST';
    partial.triage_parts.find(p => p.part_name === 'REPAROS').is_resolved = false;
    assertFull(await render(partial), 'AGUARDANDO COMPRA');
    const missing = fixture(); missing.triage_parts = []; missing.component_tracking = missing.component_tracking.filter(t => t.component_name !== 'CONJUNTO ROTATIVO');
    assertFull(await render(missing), 'AGUARDANDO DECISÃO NA TRIAGEM');
    for (const sector of ['DESMONTAGEM', 'RETIFICA', 'SOLDA', 'METROLOGIA', 'BANCADA', 'BALANCEAMENTO', 'MONTAGEM', 'QUALIDADE']) {
        const data = fixture(); data.component_tracking.find(t => t.component_name === 'CONJUNTO ROTATIVO').current_stage = sector;
        assertFull(await render(data), sector === 'RETIFICA' ? 'RETÍFICA' : sector);
    }
    const normal = fixture(); normal.checklist_analysis_general = [];
    normal.component_tracking = normal.component_tracking.filter(t => t.component_name !== 'CONJUNTO ROTATIVO').map(t => ({ ...t, verdict_vendas: 'RECONDICIONAR' }));
    assert.deepEqual((await render(normal)).labels, ['CCO', 'CCE', 'CT', 'EIXO', 'ROTOR', 'REPAROS'], 'componentes avulsos continuam separados');
    normal.component_tracking.push({ component_name: 'CONJUNTO ROTATIVO', current_stage: 'BALANCEAMENTO' });
    assert.deepEqual((await render(normal)).labels, ['CCO', 'CT', 'CONJUNTO ROTATIVO'], 'núcleo montado não é rotulado como FULL novo');
    const extras = fixture(); extras.component_tracking.push({ component_name: 'ATUADOR', current_stage: 'BANCADA' });
    assert.deepEqual((await render(extras)).labels, ['CCO', 'CT', 'CONJUNTO ROTATIVO (FULL)', 'ATUADOR']);
    const broken = await render(fixture(), 'triage_parts');
    assert.equal(broken.labels.length, 0, 'falha de leitura não inventa localização/recebimento');
    assert.equal(broken.nodes.get('no-components').classList.contains('hidden'), false);
    console.log('OK: FULL único, componentes internos identificados, localização nos oito setores, compra/estoque/baixa parcial e peças avulsas preservadas');
})().catch(error => { console.error(error); process.exitCode = 1; });
