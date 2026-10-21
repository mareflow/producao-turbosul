const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const tables = { component_tracking: [], checklist_analysis_general: [], triage_parts: [], service_orders: [{ id: 'os', status: 'Em Produção' }], history_events: [] };
const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'operator' } } } }) },
    from(table) {
        let op = 'select', payload, filters = [], single = false;
        const q = {
            maybeSingle() { single = true; return q; }, select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
            insert(p) { op = 'insert'; payload = p; return q; },
            update(p) { op = 'update'; payload = p; return q; },
            upsert(p) { op = 'upsert'; payload = p; return q; },
            then(resolve) {
                const found = tables[table].filter(r => filters.every(f => f(r)));
                if (op === 'insert') tables[table].push(payload);
                if (op === 'update') found.forEach(r => Object.assign(r, payload));
                if (op === 'upsert') for (const row of payload) {
                    const existing = tables[table].find(r => r.service_order_id === row.service_order_id && r.component_name === row.component_name);
                    if (existing) Object.assign(existing, row); else tables[table].push({ ...row });
                }
                resolve({ data: single ? found[0] || null : found, error: null });
            }
        }; return q;
    }
};
let sector = 'MONTAGEM';
const context = vm.createContext({ window: {}, document: { addEventListener() {} }, localStorage: { getItem: () => null },
    Rework: { context: () => ({ id: 'os', sector }), client: () => client, ensureFinished: async () => true }, prompt: () => 'Ajuste solicitado' });
vm.runInContext(fs.readFileSync('js/production-flow.js', 'utf8'), context);
const flow = context.window.ProductionFlow;
const core = ['EIXO', 'ROTOR', 'CCE', 'REPAROS'];
function order() { return { triage_parts: tables.checklist_analysis_general, purchase_parts: tables.triage_parts, full_tracking: tables.component_tracking }; }
(async () => {
    tables.checklist_analysis_general = core.map(item_name => ({ service_order_id: 'os', item_name, decisao_vendas: 'TROCAR CONJUNTO' }));
    tables.triage_parts = core.map(part_name => ({ service_order_id: 'os', part_name, availability: 'STOCK', is_resolved: true }));
    tables.component_tracking = core.map(component_name => ({ service_order_id: 'os', component_name, current_stage: component_name === 'EIXO' ? 'BALANCEAMENTO' : 'MONTAGEM', tracking_data: [] }));
    assert.equal(flow.tracking(order()).length, 1);
    assert.equal(flow.tracking(order())[0].current_stage, 'MONTAGEM', 'Conjunto recebido não exibe eixo isolado');
    await flow.move('Conjunto Novo', 'RETIFICA', { note: 'Correção no conjunto' });
    assert.equal(tables.component_tracking.length, 5);
    assert.ok(tables.component_tracking.every(t => t.current_stage === 'RETIFICA' && t.current_sector === 'RETIFICA'));
    sector = 'RETIFICA'; await flow.move('CONJUNTO ROTATIVO', 'MONTAGEM', { note: 'Correção concluída' });
    assert.ok(tables.component_tracking.every(t => t.current_stage === 'MONTAGEM'));
    assert.equal(tables.component_tracking[0].tracking_data.length, 2, 'Histórico de ida e volta preservado');
    sector = 'MONTAGEM';
    tables.triage_parts[0].availability = 'ORDER';
    await assert.rejects(() => flow.move('CONJUNTO ROTATIVO', 'SOLDA', { note: 'Teste' }), /recebimento/);
    tables.triage_parts[0].availability = 'STOCK';
    tables.component_tracking.push({ service_order_id: 'os', component_name: 'CT', current_stage: 'MONTAGEM', tracking_data: [] },
        { service_order_id: 'os', component_name: 'CCO', current_stage: 'MONTAGEM', tracking_data: [] });
    // Um anexo aguardando compra não participa nem bloqueia o carcaçamento.
    tables.checklist_analysis_general.push({ service_order_id: 'os', item_name: 'CANOTE DA GEOMETRIA', decisao_vendas: 'TROCAR' });
    tables.triage_parts.push({ service_order_id: 'os', part_name: 'CANOTE DA GEOMETRIA', availability: 'ORDER', is_resolved: false });
    tables.component_tracking.push({ service_order_id: 'os', component_name: 'CANOTE', current_stage: 'COMPRA' });
    const source = [...fs.readFileSync('montagem.html', 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m => m[2].includes('getAssemblyDetailedState')).at(2);
    vm.runInContext(source.slice(source.indexOf('        const CORE_PARTS'), source.indexOf('        async function fetchQueue(')), context);
    vm.runInContext(source.slice(source.indexOf('        function getAssemblyDetailedState()'), source.indexOf('        function getEtapaMontagemAtual()')), context);
    context.selectedOS = { ...order(), full_tracking: flow.tracking(order()) };
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'CARCACAMENTO_PRONTO');
    sector = 'MONTAGEM'; await flow.move('Peça Inteira', 'QUALIDADE', { note: 'Carcaçamento concluído' });
    assert.equal(tables.service_orders[0].status, 'Aguardando Controle de Qualidade');
    assert.equal(tables.component_tracking.find(t => t.component_name === 'CANOTE').current_stage, 'COMPRA');
    sector = 'QUALIDADE'; await flow.move('CT', 'SOLDA', { note: 'Corrigir carcaça' });
    assert.equal(tables.component_tracking.find(t => t.component_name === 'PEÇA INTEIRA').current_stage, 'REABERTA');
    assert.equal(tables.service_orders[0].status, 'Em Produção');
    const oldLog = { service: 'Carcaçamento Completo', end_time: '2026-01-01T12:00:00Z' };
    assert.equal(flow.serviceDone([oldLog, { action: 'ROTEAMENTO', from: 'MONTAGEM', to: 'SOLDA', timestamp: '2026-01-01T13:00:00Z' }], 'Carcaçamento Completo'), false);
    assert.equal(flow.serviceDone([oldLog], 'Carcaçamento Completo'), true);
    assert.equal(flow.component('SERVIÇO ESPECIAL À MEDIDA'), 'SERVIÇO ESPECIAL À MEDIDA');
    // Fluxo normal: eixo balanceado → núcleo montado → balanceamento do conjunto → carcaçamento.
    tables.checklist_analysis_general = [];
    tables.triage_parts = [];
    tables.component_tracking = ['EIXO', 'ROTOR', 'CCE', 'REPAROS', 'CT', 'CCO'].map(component_name => ({ service_order_id: 'os', component_name, current_stage: 'MONTAGEM', tracking_data: [] }));
    context.selectedOS = { ...order(), full_tracking: flow.tracking(order()) };
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'NUCLEO_AGUARDANDO');
    tables.component_tracking[0].status = 'BALANCEADO';
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'NUCLEO_PRONTO');
    tables.component_tracking[0].tracking_data.push({ service: 'Montagem de Núcleo', end_time: new Date().toISOString() });
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'NUCLEO_CONCLUIDO');
    sector = 'MONTAGEM'; await flow.move('CONJUNTO ROTATIVO', 'BALANCEAMENTO');
    context.selectedOS = { ...order(), full_tracking: flow.tracking(order()) };
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'NUCLEO_EM_BALANCEAMENTO');
    assert.ok(tables.component_tracking.filter(t=>[...core,'CONJUNTO ROTATIVO'].includes(t.component_name)).every(t=>t.current_stage==='BALANCEAMENTO'));
    sector='BALANCEAMENTO';await flow.move('CONJUNTO ROTATIVO','MONTAGEM');
    context.selectedOS = { ...order(), full_tracking: flow.tracking(order()) };
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'NUCLEO_CONCLUIDO','Retorno sem serviço não libera carcaçamento');
    sector='MONTAGEM';await flow.move('CONJUNTO ROTATIVO','BALANCEAMENTO');
    const mountedCore=tables.component_tracking.find(t=>t.component_name==='CONJUNTO ROTATIVO');
    mountedCore.tracking_data.push({service:'CONJUNTO ROTATIVO',sector:'BALANCEAMENTO',duration_seconds:60,end_time:new Date(Date.now()+1000).toISOString()});
    mountedCore.status='Finalizado';
    sector='BALANCEAMENTO';await flow.move('CONJUNTO ROTATIVO','MONTAGEM');
    context.selectedOS = { ...order(), full_tracking: flow.tracking(order()) };
    assert.equal(vm.runInContext('getAssemblyDetailedState()', context), 'CARCACAMENTO_PRONTO');
    assert.equal(mountedCore.status,'BALANCEADO');
    sector='MONTAGEM';
    tables.component_tracking.find(t=>t.component_name==='CT').tracking_data.push({service:'Carcaçamento Completo',end_time:new Date().toISOString(),duration_seconds:50});
    await flow.move('PEÇA INTEIRA', 'BALANCEAMENTO', { note: 'Teste final opcional' });
    assert.equal(tables.service_orders[0].status, 'Aguardando Balanceamento');
    // Mesma localização para todas as telas, mesmo com rastreio residual em outro setor.
    const phases = {'Aguardando Entrada':'PRE_VENDAS','Aguardando Análise Técnica':'ANALISE_TECNICA','Em Análise Técnica':'ANALISE_TECNICA','Aguardando Aprovação Comercial':'VENDAS','Aguardando Triagem':'TRIAGEM','Standby':'TRIAGEM','Standby / Aguardando Casco':'ANALISE_TECNICA','Aguardando Desmontagem OS':'PRODUCAO','Em Produção':'PRODUCAO','Aguardando Controle de Qualidade':'QUALIDADE','Pronto para Entrega':'EXPEDICAO','Standby - Aguardando Nota Fiscal':'EXPEDICAO','Finalizado':'ENCERRADA'};
    for(const [status,phase] of Object.entries(phases)) {
        const sample = {status,tracking:[{component_name:'ATUADOR',current_stage:'MONTAGEM'}]};
        assert.equal(flow.phase(sample),phase,status);
        if(!['PRODUCAO','ENCERRADA'].includes(phase)) assert.equal(Array.from(flow.stations(sample)).join(),phase);
    }
    assert.equal(flow.sort([{id:1,urgency:'Normal'},{id:2,urgency:'Alta'}])[0].id,2);
    const commercial=fs.readFileSync('comercial.html','utf8');
    assert.ok(!commercial.includes("newStatus = 'Concluída'"), 'Troca de conjunto também precisa de triagem');
    // Encerramento prevalece sobre rastreio antigo em todos os painéis.
    for (const status of ['Finalizado', 'Finalizada', 'Concluído', 'Concluída', 'Entregue', 'Cancelada', 'Arquivado']) {
        assert.equal(flow.isClosed({status}), true);
        assert.equal(flow.isProductionActive({status}), false);
    }
    const admin = fs.readFileSync('admin.html', 'utf8');
    vm.runInContext(admin.slice(admin.indexOf('        function normalizeSectorKey('), admin.indexOf('        function getOSPiecesAtStation(')), context);
    const stale = { status: 'Finalizado', tracking: [{component_name: 'CT',current_stage:'QUALIDADE'}] };
    context.stale = stale;
    assert.equal(vm.runInContext('getOSActiveStations(stale).length', context), 0);
    context.stale.status = 'Pronto para Entrega';
    assert.equal(vm.runInContext('getOSActiveStations(stale).join()', context), 'EXPEDICAO');
    context.stale.status = 'Aguardando Controle de Qualidade';
    assert.equal(vm.runInContext('getOSActiveStations(stale).join()', context), 'QUALIDADE');
    const kpis = {};
    context.document.getElementById = id => kpis[id] ||= {};
    context.allOrders = [{status:'Finalizado',tracking:stale.tracking},{status:'Em Produção',tracking:[{current_stage:'SOLDA'}]}, {status:'Pronto para Entrega',tracking:stale.tracking}, {status:'Aguardando Controle de Qualidade',tracking:stale.tracking}];
    vm.runInContext(admin.slice(admin.indexOf('        function updateKPIs()'), admin.indexOf('        function updateCharts()')),context);
    vm.runInContext('updateKPIs()',context);
    assert.equal(kpis['kpi-total-active'].innerText,3);
    assert.equal(kpis['kpi-production'].innerText,1);
    assert.equal(kpis['kpi-final-stages'].innerText,2);
    tables.service_orders[0].status = 'Aguardando Controle de Qualidade';
    await assert.rejects(() => flow.transitionOrder(client,'os','Finalizado',{},['Pronto para Entrega']), /etapa/);
    const logs = JSON.stringify(tables.component_tracking.map(t => t.tracking_data));
    await flow.transitionOrder(client, 'os', 'Pronto para Entrega', {}, ['Aguardando Controle de Qualidade']);
    assert.ok(tables.component_tracking.every(t => t.current_stage === 'EXPEDICAO' && t.current_sector === 'EXPEDICAO'));
    await flow.transitionOrder(client, 'os', 'Standby - Aguardando Nota Fiscal', {}, ['Pronto para Entrega']);
    assert.ok(tables.component_tracking.every(t => t.current_stage === 'EXPEDICAO'));
    await flow.transitionOrder(client, 'os', 'Finalizado', {nota_fiscal:'123',data_finalizacao:'2026-10-20'}, ['Standby - Aguardando Nota Fiscal']);
    assert.ok(tables.component_tracking.every(t => t.current_stage === 'FINALIZADO' && t.current_sector === 'FINALIZADO'));
    assert.equal(JSON.stringify(tables.component_tracking.map(t => t.tracking_data)), logs, 'Tempos e histórico preservados no fechamento');
    await assert.rejects(() => flow.move('CT', 'SOLDA', {note:'Tela antiga'}), /encerrada/);
    await assert.rejects(() => flow.transitionOrder(client,'os','Pronto para Entrega',{},['Aguardando Controle de Qualidade']), /etapa/);
    context.prompt = () => {throw new Error('Encaminhamento não deve pedir motivo');};
    tables.checklist_analysis_general=[];tables.triage_parts=[];
    let routes=0,blocked=0;
    for(const name of ['CCO','PEÇA ESPECIAL','PEÇA INTEIRA','EIXO'])for(const from of flow.sectors)for(const to of flow.sectors){
        if(from===to)continue;
        sector=from;tables.service_orders[0].status='Em Produção';
        tables.component_tracking=[{service_order_id:'os',component_name:name,current_stage:from,current_sector:from,tracking_data:[{service:'Anterior',duration_seconds:45}],executed_services:['Anterior']}];
        if(to==='BALANCEAMENTO'&&name!=='EIXO'){
            assert.ok(!flow.destinations(name).includes(to));
            const before=JSON.stringify(tables);
            await assert.rejects(()=>flow.move(name,to),/Somente o eixo/);
            assert.equal(JSON.stringify(tables),before,'Rota proibida não grava dados');
            blocked++;continue;
        }
        assert.ok(flow.destinations(name,from,{full_tracking:tables.component_tracking}).includes(to),from+' oferece '+to);
        assert.equal(await flow.move(name,to),true,from+' → '+to+' sem motivo');
        const moved=tables.component_tracking.find(t=>t.component_name===name);
        assert.equal(moved.current_stage,to);assert.equal(moved.current_sector,to);
        if(name==='EIXO'&&from==='BALANCEAMENTO'&&to==='MONTAGEM')assert.equal(moved.status,'Aguardando','Retorno sem balancear não aprova o eixo');
        assert.equal(moved.tracking_data[0].duration_seconds,45);
        assert.equal(moved.tracking_data.at(-1).reason,undefined);
        assert.ok(tables.history_events.at(-1).description.includes(from+' → '+to));
        routes++;
    }
    assert.equal(routes,150);assert.equal(blocked,18);
    for(const from of ['DESMONTAGEM','RETIFICA','SOLDA','METROLOGIA','BANCADA']){
        sector=from;tables.service_orders[0].status='Em Produção';
        tables.component_tracking=[{service_order_id:'os',component_name:'CONJUNTO ROTATIVO',current_stage:from,status:'MONTADO'}];
        assert.ok(!flow.destinations('CONJUNTO ROTATIVO',from,{full_tracking:tables.component_tracking}).includes('BALANCEAMENTO'));
        await assert.rejects(()=>flow.move('CONJUNTO ROTATIVO','BALANCEAMENTO'),/Somente o eixo/);
    }
    sector='MONTAGEM';
    tables.component_tracking=[];
    assert.ok(!flow.destinations('EIXO','MONTAGEM',{full_tracking:[]}).includes('BALANCEAMENTO'));
    await assert.rejects(()=>flow.move('EIXO','BALANCEAMENTO'),/não possui eixo/);
    tables.component_tracking=[{service_order_id:'os',component_name:'CONJUNTO ROTATIVO',current_stage:'MONTAGEM',status:'Aguardando'}];
    await assert.rejects(()=>flow.move('CONJUNTO ROTATIVO','BALANCEAMENTO'),/Somente o eixo/);
    tables.component_tracking[0].status='MONTADO';
    await assert.rejects(()=>flow.move('CONJUNTO ROTATIVO','BALANCEAMENTO'),/Eixo, rotor, CCE e reparos/);
    for(const name of ['CT','ROTOR','CCE','REPAROS','ATUADOR','CANOTE','GEOMETRIA'])for(const from of flow.sectors.filter(s=>s!=='BALANCEAMENTO')){
        sector=from;tables.component_tracking=[{component_name:name,current_stage:from,service_order_id:'os'},{component_name:'EIXO',current_stage:from,service_order_id:'os'}];
        const before=JSON.stringify(tables);
        await assert.rejects(()=>flow.move(name,'BALANCEAMENTO'),/Somente o eixo/);
        assert.equal(JSON.stringify(tables),before);
    }
    context.Rework.escape=value=>String(value);
    for(const from of flow.sectors){
        sector=from;
        const html=flow.render('CCO');
        assert.equal((html.match(/data-routing-target=/g)||[]).length,from==='BALANCEAMENTO'?6:5,from+' não oferece Balanceamento para CCO');
        assert.ok(!html.includes('<select'),'Encaminhamento usa botões');
        for(const to of flow.destinations('CCO'))assert.ok(html.includes('data-routing-target="'+to+'"'));
    }
    const balancing=fs.readFileSync('balanceamento.html','utf8');
    vm.runInContext(balancing.slice(balancing.indexOf('        function getActiveBalancingComponent()'),balancing.indexOf('        function processarTipoBalanceamento()')),context);
    context.selectedOS={full_tracking:[{component_name:'EIXO',current_stage:'MONTAGEM'},{component_name:'CCO',current_stage:'BALANCEAMENTO'},{component_name:'PEÇA ESPECIAL',current_stage:'BALANCEAMENTO'}]};
    kpis['balancing-component-select']={value:''};
    assert.equal(vm.runInContext('getActiveBalancingComponent().name',context),'CCO','Recebe CCO sem usar o eixo de outro setor');
    kpis['balancing-component-select'].value='PEÇA ESPECIAL';
    assert.equal(vm.runInContext('getActiveBalancingComponent().name',context),'PEÇA ESPECIAL','Permite selecionar cada peça recebida');
    context.selectedOS.full_tracking=[];
    assert.equal(vm.runInContext('getActiveBalancingComponent().raw',context),null,'Não cria peça inteira quando o setor fica vazio');
    console.log('OK: produção, retornos, compra, Qualidade → Expedição → Finalizado, standby, indicadores e proteção contra tela antiga');
    console.log('OK: 150 rotas sem motivo e 18 bloqueios; somente eixo direto, conjunto montado pela Montagem e retorno balanceado antes do carcaçamento');
})().catch(error => { console.error(error); process.exitCode = 1; });
