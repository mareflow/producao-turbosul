const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('js/accessory-flow.js', 'utf8'), context);
const flow = context.window.AccessoryFlow;

function database(rows) {
    return {
        rows,
        from(table) {
            let op = 'select', payload, filters = [];
            const query = {
                select() { return query; },
                eq(key, value) { filters.push(row => row[key] === value); return query; },
                update(value) { op = 'update'; payload = value; return query; },
                upsert(value) { op = 'upsert'; payload = value; return query; },
                then(resolve, reject) {
                    try {
                        let selected = rows[table].filter(row => filters.every(f => f(row)));
                        if (op === 'update') selected.forEach(row => Object.assign(row, payload));
                        if (op === 'upsert') {
                            const key = table === 'triage_parts' ? 'part_name' : 'component_name';
                            const existing = rows[table].find(row => row.service_order_id === payload.service_order_id && row[key] === payload[key]);
                            if (existing) Object.assign(existing, payload);
                            else rows[table].push({ ...payload });
                        }
                        resolve({ data: selected, error: null });
                    } catch (error) { reject(error); }
                }
            };
            return query;
        }
    };
}

(async () => {
    const client = database({
        checklist_analysis_general: [
            { id: 1, service_order_id: 'os', item_name: 'ATUADOR', decisao_vendas: 'OK' },
            { id: 2, service_order_id: 'os', item_name: 'CANOTE DA GEOMETRIA', decisao_vendas: 'RECONDICIONAR' },
            { id: 3, service_order_id: 'os', item_name: 'GEOMETRIA VARIÁVEL', decisao_vendas: 'TROCAR' },
            { id: 4, service_order_id: 'os', item_name: 'FLANGE DA GEOMETRIA', decisao_vendas: 'TROCAR' },
            { id: 5, service_order_id: 'os', item_name: 'Flange', decisao_vendas: 'TROCAR' }
        ],
        triage_parts: [{ service_order_id: 'os', part_name: 'FLANGE DA GEOMETRIA', availability: 'STOCK', is_resolved: true }],
        component_tracking: []
    });
    await flow.routeApproved(client, 'os');
    const tracked = name => client.rows.component_tracking.find(t => t.component_name === name);
    assert.equal(tracked('ATUADOR').current_stage, 'MONTAGEM');
    assert.equal(tracked('CANOTE').current_stage, 'DESMONTAGEM');
    assert.equal(tracked('GEOMETRIA').current_stage, 'COMPRA');
    assert.equal(tracked('FLANGE').current_stage, 'MONTAGEM');
    assert.equal(client.rows.component_tracking.length, 4, 'Flange interna não é anexo');
    const purchase = client.rows.triage_parts.find(p => p.part_name === 'GEOMETRIA VARIÁVEL');
    assert.equal(purchase.availability, 'ORDER');
    assert.equal(purchase.is_resolved, false);
    tracked('CANOTE').current_stage = 'RETIFICA';
    await flow.routeApproved(client, 'os');
    assert.equal(tracked('CANOTE').current_stage, 'RETIFICA', 'Reaprovação não retrocede processamento');
    assert.equal(client.rows.triage_parts.length, 2, 'Não duplica pedidos');
    purchase.availability = 'STOCK'; purchase.is_resolved = true;
    tracked('GEOMETRIA').current_stage = 'MONTAGEM';
    await flow.routeApproved(client, 'os');
    assert.equal(tracked('GEOMETRIA').current_stage, 'MONTAGEM');
    assert.equal(flow.part('CANOTE DA GEOMETRIA').code, 'CANOTE');
    assert.equal(flow.part('FLANGE DA GEOMETRIA').code, 'FLANGE');
    assert.equal(flow.part('Flange', false), undefined, 'Flange interna não pode criar card de anexo');
    console.log('OK: decisões, recebimento, aliases, repetição e preservação do processamento');
})().catch(error => { console.error(error); process.exitCode = 1; });
