const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const rows = [];
let clock = Date.parse('2026-10-19T12:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const alerts = [];
const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'operator', user_metadata: { name: 'Operador' } } } } }) },
    from() {
        let op = 'select', payload, filters = [], bounds, single = false;
        const q = {
            select() { return q; }, eq(k, v) { filters.push(row => row[k] === v); return q; },
            order() { return q; }, range(a, b) { bounds = [a, b]; return q; },
            single() { single = true; return q; },
            insert(p) { op = 'insert'; payload = p; return q; }, update(p) { op = 'update'; payload = p; return q; },
            then(resolve) {
                let found = rows.filter(row => filters.every(f => f(row)));
                if (op === 'insert') { const row = { id: rows.length + 1, ...payload }; rows.push(row); found = [row]; }
                if (op === 'update') found.forEach(row => Object.assign(row, payload));
                if (bounds) found = found.slice(bounds[0], bounds[1] + 1);
                resolve({ data: single ? found[0] : found, error: single && !found.length ? new Error('Conflito') : null });
            }
        }; return q;
    }
};
function runtime() {
    const context = vm.createContext({ window: {}, location: { pathname: '/retifica.html' }, selectedOS: { id: 'os' },
        supabaseClient: client, Date: Clock, crypto: { randomUUID }, document: { addEventListener() {}, querySelectorAll: () => [] },
        setInterval() {}, alert: message => alerts.push(message) });
    vm.runInContext(fs.readFileSync('js/rework.js', 'utf8'), context);
    return context.window.Rework;
}
(async () => {
    let rework = runtime();
    const panel = { dataset: { reworkOrder: 'os', reworkSector: 'RETIFICA', reworkComponent: 'CCO', reworkEnabled: 'true' } };
    rework.requestNote = async () => null;
    await rework.act(panel, 'start'); assert.equal(rows.length, 0);
    rework.requestNote = async () => '   ';
    await rework.act(panel, 'start'); assert.equal(rows.length, 0, 'Observação vazia bloqueia início');
    rework.requestNote = async () => 'Refazer a rosca danificada';
    await rework.act(panel, 'start'); assert.equal(rows.length, 1);
    clock += 65000;
    await rework.act(panel, 'pause');
    let data = JSON.parse(rows[0].details); assert.equal(data.duration_seconds, 65);
    assert.equal(data.state, 'paused');
    clock += 600000;
    rework = runtime(); // Recuperação após recarregar, sem cronômetro do navegador anterior.
    rework.requestNote = async () => '';
    await rework.act(panel, 'resume'); assert.equal(JSON.parse(rows[0].details).state, 'paused');
    rework.requestNote = async () => 'Conferir e finalizar o ajuste';
    await rework.act(panel, 'resume'); clock += 30000;
    await rework.act(panel, 'finish');
    data = JSON.parse(rows[0].details);
    assert.equal(data.duration_seconds, 95, 'Pausa não soma tempo');
    assert.equal(data.segments.length, 2); assert.equal(data.state, 'finished');
    rework.requestNote = async () => 'Segundo retrabalho, novo ajuste';
    await rework.act(panel, 'start'); clock += 20000; await rework.act(panel, 'finish');
    assert.equal(rows.length, 2, 'Nova execução preserva a anterior');
    assert.equal(rows.reduce((sum, row) => sum + JSON.parse(row.details).duration_seconds, 0), 115);
    assert.throws(() => rework.validateLeader(true, true, ' '));
    assert.throws(() => rework.validateLeader(true, false, 'Corrigido')); 
    assert.doesNotThrow(() => rework.validateLeader(true, true, 'Medida conferida e corrigida'));
    for (const file of ['desmontagem.html', 'retifica.html', 'solda.html', 'metrologia.html', 'bancada.html', 'montagem.html', 'balanceamento.html', 'qualidade.html']) {
        const source = fs.readFileSync(file, 'utf8');
        assert.ok(source.includes('js/rework.js'), file);
        assert.ok(source.includes('Rework.render('), file);
        assert.ok(source.includes('Rework.ensureFinished(') || source.includes('ProductionFlow.send('), file);
    }
    console.log('OK: observação obrigatória, pausa, retomada, recuperação, múltiplas execuções, líder e cobertura dos setores');
})().catch(error => { console.error(error); process.exitCode = 1; });
