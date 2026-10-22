const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
let clock = Date.parse('2026-10-22T12:00:00Z'), userId = 'operator', failWrite = false, conflict = false;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const tables = { history_events: [], service_orders: [{ id: 'os-a', status: 'Aguardando Desmontagem OS' }, { id: 'os-b', status: 'Em Produção' }] };
const client = { auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId, user_metadata: { name: userId } } } : null } }) },
    from(table) {
        assert.ok(['history_events', 'service_orders'].includes(table), 'não deve criar componente fictício');
        let operation = 'select', payload, filters = [], bounds, one = false;
        const q = { select() { return q; }, eq(k, v) { filters.push(row => row[k] === v); return q; },
            in(k, values) { filters.push(row => values.includes(row[k])); return q; }, order() { return q; }, range(a, b) { bounds = [a, b]; return q; },
            single() { one = true; return q; }, insert(p) { operation = 'insert'; payload = p; return q; }, update(p) { operation = 'update'; payload = p; return q; },
            then(resolve, reject) {
                if (operation !== 'select') {
                    assert.equal(table, 'history_events');
                    Object.keys(payload).forEach(key => assert.ok(['action', 'description', 'details', 'service_order_id', 'user_id', 'timestamp'].includes(key), key));
                    if (failWrite) return Promise.resolve({ data: null, error: Error('Sem conexão') }).then(resolve, reject);
                }
                let rows = tables[table].filter(row => filters.every(f => f(row)));
                if (operation === 'insert') { const row = { id: tables.history_events.length + 1, ...payload }; tables.history_events.push(row); rows = [row]; }
                if (operation === 'update') { if (conflict) rows = []; else rows.forEach(row => Object.assign(row, payload)); }
                if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
                return Promise.resolve({ data: one ? rows[0] || null : structuredClone(rows), error: one && !rows.length ? Error('Conflito') : null }).then(resolve, reject);
            } }; return q;
    }
};
function runtime() {
    const ctx = vm.createContext({ window: {}, Date: Clock, crypto: { randomUUID }, supabaseClient: client,
        document: { addEventListener() {}, getElementById: () => null } });
    vm.runInContext(fs.readFileSync('js/general-disassembly.js', 'utf8'), ctx);
    return ctx.window.GeneralDisassembly;
}
function selectedSource(file, name) {
    const src = fs.readFileSync(file, 'utf8'), start = src.indexOf('async function ' + name + '(');
    for (const end of src.slice(start).matchAll(/^[ \t]{0,8}\}/gm)) {
        const text = src.slice(start, start + end.index + end[0].length);
        try { new vm.Script(text); return text; } catch {}
    }
    throw Error(name);
}
(async () => {
    let general = runtime();
    await general.change(client, 'os-a', 'start');
    assert.equal(tables.history_events.length, 1);
    assert.equal(tables.history_events[0].service_order_id, 'os-a');
    assert.equal(tables.history_events[0].user_id, 'operator');
    assert.ok(tables.history_events[0].details.startsWith('Desmontagem geral da peça — Em execução.'));
    clock += 125000;
    general = runtime(); // Outra página/dispositivo recupera o relógio do banco.
    assert.equal(general.seconds((await general.sessions(client, 'os-a'))[0]), 125);
    assert.equal((await general.completed(client)).length, 0, 'tempo aberto não entra como serviço entregue');
    assert.ok((await general.openOrderIds(client, ['os-a', 'os-b'])).has('os-a'));
    await assert.rejects(general.change(client, 'os-a', 'start'), /Já existe/);
    userId = 'outro-operador';
    await assert.rejects(general.change(client, 'os-a', 'pause'), /pertence a operator/);
    userId = 'operator';
    await general.change(client, 'os-a', 'pause');
    clock += 600000;
    assert.equal(general.seconds((await general.sessions(client, 'os-a'))[0]), 125, 'pausa não é tempo produtivo');
    await general.change(client, 'os-a', 'resume'); clock += 35000;
    failWrite = true;
    await assert.rejects(general.change(client, 'os-a', 'finish'), /Sem conexão/);
    assert.equal((await general.sessions(client, 'os-a'))[0].state, 'running', 'erro não perde a contagem');
    failWrite = false; conflict = true;
    await assert.rejects(general.change(client, 'os-a', 'finish'), /Conflito/);
    conflict = false;
    await general.change(client, 'os-a', 'finish');
    assert.equal((await general.completed(client))[0].duration_seconds, 160);
    assert.equal((await general.openOrderIds(client, ['os-a'])).size, 0);
    await assert.rejects(general.change(client, 'os-a', 'finish'), /Não há/);
    assert.equal(tables.history_events.length, 1, 'retomar/finalizar atualiza uma sessão, sem duplicar métricas');
    await general.change(client, 'os-a', 'start'); clock += 60000;
    await general.change(client, 'os-a', 'pause'); clock += 600000;
    await general.change(client, 'os-a', 'finish');
    assert.equal((await general.completed(client)).reduce((sum, s) => sum + s.duration_seconds, 0), 220, 'novas execuções são somadas');
    assert.equal(general.time(3661), '01:01:01');
    userId = null; await assert.rejects(general.change(client, 'os-b', 'start'), /Entre no sistema/); userId = 'operator';
    tables.service_orders[1].status = 'Finalizado';
    await assert.rejects(general.change(client, 'os-b', 'start'), /não está mais em produção/);
    assert.equal((await general.sessions(client, 'os-b')).length, 0, 'sessões não vazam entre O.S.');

    // Verifica a integração real da Performance com os filtros de setor e operador.
    const nodes = new Map();
    const node = () => ({ value: '', innerHTML: '', textContent: '', options: [{}, {}], before() {} });
    const doc = { addEventListener() {}, getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); } };
    const admin = vm.createContext({ window: {}, document: doc, console, GeneralDisassembly: general,
        Rework: { events: async () => [], parse: () => null }, supabaseClient: { from(table) {
            if (table === 'history_events' || table === 'service_orders') return client.from(table);
            const q = { select() { return q; }, not() { return q; }, then(resolve) { return Promise.resolve(resolve({ data: [], error: null })); } }; return q;
        } } });
    const src = fs.readFileSync('admin.html', 'utf8');
    const match = src.slice(0, src.indexOf("const srvList = document.getElementById('performance-services-list')")).match(/async function (\w+)\([^)]*\)\s*\{\s*$/);
    assert.ok(match, 'nome do carregador de performance');
    vm.runInContext(selectedSource('admin.html', match[1]), admin);
    doc.getElementById('filter-perf-sector').value = 'DESMONTAGEM';
    await admin[match[1]]();
    assert.ok(doc.getElementById('performance-services-list').innerHTML.includes('Desmontagem geral da peça'));
    assert.ok(doc.getElementById('performance-users-list').innerHTML.includes('operator'));
    doc.getElementById('filter-perf-sector').value = 'SOLDA';
    await admin[match[1]]();
    assert.ok(!doc.getElementById('performance-services-list').innerHTML.includes('Desmontagem geral da peça'));
    doc.getElementById('filter-perf-sector').value = 'DESMONTAGEM'; doc.getElementById('filter-perf-operator').value = 'outro';
    await admin[match[1]]();
    assert.ok(!doc.getElementById('performance-services-list').innerHTML.includes('Desmontagem geral da peça'));
    // Mesmo após enviar todos os componentes, a O.S. fica acessível para encerrar o tempo geral.
    await general.change(client, 'os-a', 'start');
    tables.service_orders[0].is_blocked = false;
    const parts = ['EIXO', 'ROTOR', 'CCE', 'REPAROS', 'CT', 'CCO'];
    const queueDoc = { addEventListener() {}, getElementById: () => ({ innerHTML: '', appendChild() {} }), createElement: () => ({}) };
    const queue = vm.createContext({ window: {}, document: queueDoc, console, GeneralDisassembly: general, queueData: [], MASTER_COMPONENTS: parts.map(title => ({ title })),
        AccessoryFlow: { part: () => false }, supabaseClient: { from(table) {
            if (table === 'history_events' || table === 'service_orders') return client.from(table);
            const q = { select() { return q; }, in() { return q; }, then(resolve) { return Promise.resolve(resolve({ data: table === 'component_tracking' ? parts.map(component_name => ({ component_name, current_stage: 'MONTAGEM', service_order_id: 'os-a' })) : [], error: null })); } }; return q;
        } } });
    vm.runInContext(fs.readFileSync('js/production-flow.js', 'utf8'), queue);
    vm.runInContext(selectedSource('desmontagem.html', 'loadDisassemblyQueue'), queue);
    await queue.loadDisassemblyQueue(true);
    assert.equal(queue.queueData.length, 1, 'serviço aberto mantém a O.S. na fila');
    assert.equal(await general.ensureFinished('os-a'), false);
    clock += 1000; await general.change(client, 'os-a', 'finish');
    assert.equal(await general.ensureFinished('os-a'), true);
    await queue.loadDisassemblyQueue(true);
    assert.equal(queue.queueData.length, 0, 'após finalizar, a fila volta a depender apenas dos componentes');
    console.log('OK: desmontagem geral por O.S./operador, pausa, retomada, recarga, erros sem perda, nova execução, sessão única e filtros reais da Performance');
})().catch(error => { console.error(error); process.exitCode = 1; });
