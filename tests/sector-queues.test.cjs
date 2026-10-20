const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function functionSource(file,name){
    const source=fs.readFileSync(file,'utf8'),start=source.indexOf('async function '+name+'(');
    assert.ok(start>=0,name);
    const tails=source.slice(start).matchAll(/^[ \t]{0,8}\}/gm);
    for(const tail of tails){const text=source.slice(start,start+tail.index+tail[0].length);try{new vm.Script(text);return text;}catch{}}
    throw Error('Função não encontrada: '+name);
}
const noop=()=>{};
function node(){return {innerHTML:'',textContent:'',value:'',classList:{add:noop,remove:noop,toggle:noop},appendChild:noop,insertAdjacentHTML:noop,addEventListener:noop,querySelector:()=>node()};}
async function check(page,loader,status,sector){
    const nodes=new Map(),errors=[];
    const order={id:'001',service_order_id:'001',business_id:'O.S-001',status,urgency:'Alta',created_at:'2026-10-20',client:'Teste',model:'Teste',is_blocked:false,maintenance_extras:{}};
    const tracking=['EIXO','ROTOR','CCE','REPAROS','CT','CCO'].map(component_name=>({component_name,service_order_id:'001',current_stage:sector||'MONTAGEM',current_sector:sector||'MONTAGEM',status:'Aguardando',executed_services:[],tracking_data:[]}));
    const tables={service_orders:[order],component_tracking:tracking,checklist_analysis_general:[],triage_parts:[]};
    const client={from(table){let filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,values){filters.push(r=>values.includes(r[k]));return q;},or(){return q;},order(){return q;},limit(){return q;},then(resolve){return Promise.resolve(resolve({data:(tables[table]||[]).filter(r=>filters.every(f=>f(r))),error:null}));}};return q;}};
    const ctx=vm.createContext({window:{},document:{addEventListener:noop,getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll:()=>[]},console:{error:(...args)=>errors.push(args.join(' ')),warn:(...args)=>errors.push(args.join(' '))},
        MASTER_COMPONENTS:tracking.map(t=>({title:t.component_name})),supabaseClient:client,allOrders:[],currentOrders:[],queueData:[],selectedOS:null,currentSelection:null,selecionada:null,
        renderOrderCard:()=>"", renderQueue:noop,renderSidebar:noop,renderizarFila:noop,atualizarContadores:noop,updateSidebarUI:noop,addCardClickListeners:noop,
        filterQueue:noop,updateKPIs:noop,updateCharts:noop,renderConveyorBelt:noop,distributeOrders:noop,
        filaContainer:node(),loadingMessage:node(),filaCountSpan:node(),renderEntryLanes:noop,
        location:{pathname:'/'+page+'.html'},localStorage:{getItem:()=>null},Rework:{},fetch:()=>{throw Error('Não deve depender de webhook para carregar a fila');}});
    vm.runInContext(fs.readFileSync('js/production-flow.js','utf8'),ctx);
    vm.runInContext(fs.readFileSync('js/accessory-flow.js','utf8'),ctx);
    // Apenas regras puras usadas no carregamento da Montagem.
    if(page==='montagem'){
        const s=fs.readFileSync('montagem.html','utf8');vm.runInContext(s.slice(s.indexOf('        const CORE_PARTS'),s.indexOf('        async function fetchQueue(')),ctx);
    }
    vm.runInContext(functionSource(page+'.html',loader),ctx);
    await vm.runInContext(loader+'(true)',ctx);
    assert.deepEqual(errors,[],page+': '+errors.join(';'));
    assert.equal(Math.max(ctx.allOrders.length,ctx.currentOrders.length,ctx.queueData.length),1,page+' deve receber a O.S. correta');
}
(async()=>{
    await check('pre-vendas','loadPendingOrders','Aguardando Entrada');
    await check('analise-tecnica','loadAnalysisOrders','Aguardando Análise Técnica');
    await check('comercial','loadSalesOrders','Aguardando Aprovação Comercial');
    await check('triagem','carregarDados','Aguardando Triagem');
    await check('desmontagem','loadDisassemblyQueue','Em Produção','DESMONTAGEM');
    for(const sector of ['retifica','solda','metrologia','bancada','balanceamento','montagem'])await check(sector,'fetchQueue','Em Produção',sector.toUpperCase());
    await check('qualidade','fetchQueue','Aguardando Controle de Qualidade','QUALIDADE');
    await check('expedicao','fetchQueue','Pronto para Entrega','EXPEDICAO');
    await check('admin','loadAdminDashboard','Aguardando Triagem');
    await check('quadro-producao','loadOrders','Aguardando Triagem');
    console.log('OK: consultas e leitura da O.S. nos 13 setores, administração e quadro de produção');
})().catch(error=>{console.error(error);process.exitCode=1;});
