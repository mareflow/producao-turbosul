const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const noop=()=>{},nodes=new Map(),notices=[];
function node(){return {innerHTML:'',innerText:'',textContent:'',value:'',style:{},dataset:{},classList:{add:noop,remove:noop,toggle:noop},querySelector:()=>null,querySelectorAll:()=>[]};}
const tables={service_orders:[{id:'full',status:'Em Produção'}],component_tracking:[],checklist_analysis_general:[],triage_parts:[],history_events:[]};
let next=1,readFailure='',sector='MONTAGEM',selects=[];
const client={auth:{getSession:async()=>({data:{session:{user:{id:'operator'}}}})},from(table){
    let op='select',payload,filters=[],one=false,options={},join=false;
    const q={select(fields=''){join=fields.includes('service_orders');return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},in(k,values){filters.push(row=>values.includes(row[k]));return q;},
        maybeSingle(){one=true;return q;},insert(p){op='insert';payload=p;return q;},update(p){op='update';payload=p;return q;},upsert(p,o){op='upsert';payload=p;options=o;return q;},
        then(resolve,reject){try{
            if(table===readFailure&&op==='select')return Promise.resolve({error:Error('Falha de leitura')}).then(resolve,reject);
            assert.ok(Object.hasOwn(tables,table),table);
            let found=tables[table].filter(row=>filters.every(f=>f(row)));
            if(op==='update')found.forEach(row=>Object.assign(row,structuredClone(payload)));
            if(op==='insert'||op==='upsert')for(const row of Array.isArray(payload)?payload:[payload]){
                if(table==='checklist_analysis_general')assert.equal(Object.hasOwn(row,'resolved_at'),false,'coluna de baixa só existe em triage_parts');
                const key=table==='component_tracking'?'component_name':'part_name';
                const existing=op==='upsert'&&tables[table].find(r=>r.service_order_id===row.service_order_id&&r[key]===row[key]);
                if(existing){if(!options.ignoreDuplicates)Object.assign(existing,structuredClone(row));}
                else tables[table].push({id:next++,...structuredClone(row)});
            }
            if(join)found=found.map(row=>({...row,service_orders:tables.service_orders.find(order=>order.id===row.service_order_id)}));
            return Promise.resolve({data:one?found[0]||null:found,error:null}).then(resolve,reject);
        }catch(error){return Promise.reject(error).then(resolve,reject);}}
    };return q;
}};
const ctx=vm.createContext({window:{},document:{addEventListener:noop,getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll:()=>selects},
    localStorage:{getItem:()=>null},console,alert:message=>notices.push(message),confirm:()=>true,supabaseClient:client,activeOSId:'full',currentOrders:[],
    closeQuickActionModal:noop,validarDivergencias:noop,updateStatusSelectStyle:noop,showToast:message=>notices.push(message),
    Rework:{context:()=>({id:'full',sector,order:ctx.selectedOS}),client:()=>client,ensureFinished:async()=>true,render:()=>'<p>Retrabalho</p>',escape:value=>String(value??'')},
    renderSidebar:noop,specialItemsList:[]});
for(const file of ['js/production-flow.js','js/accessory-flow.js','js/part-requests.js','js/triage-requests.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const flow=ctx.window.ProductionFlow,requests=ctx.window.PartRequests;
function extract(file,name){const s=fs.readFileSync(file,'utf8'),start=s.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);for(const end of s.slice(start).matchAll(/^[ \t]{0,8}\}/gm)){const part=s.slice(start,start+end.index+end[0].length);try{new vm.Script(part);return part;}catch{}}throw Error(name);}
function track(name){return tables.component_tracking.find(row=>row.component_name===name);}
function order(){return {id:'full',status:tables.service_orders[0].status,full_tracking:tables.component_tracking,triage_parts:tables.checklist_analysis_general,purchase_parts:tables.triage_parts};}
function analysis(name,decision='RECONDICIONAR'){const row={id:next++,service_order_id:'full',item_name:name,decisao_vendas:decision,status:'RECONDICIONAR'};tables.checklist_analysis_general.push(row);return row;}
function choice(name,value='RECONDICIONAR'){return {dataset:{itemName:name},value,classList:{remove:noop},parentElement:{querySelector:()=>null}};}
(async()=>{
    assert.deepEqual(Array.from(flow.fullParts),['EIXO','ROTOR','CCE']);
    assert.deepEqual(Array.from(flow.core),['EIXO','ROTOR','CCE','REPAROS'],'núcleo recondicionado mantém reparos');
    assert.equal(flow.isNew({analysis:[{item_name:'REPAROS',decisao_vendas:'TROCAR CONJUNTO'}]}),false);
    assert.equal(flow.isNew({tracking:[{component_name:'REPAROS',verdict_vendas:'TROCAR CONJUNTO'}]}),false,'veredito legado isolado não cria FULL');
    for(const name of [...flow.fullParts,'REPAROS','CCO','TRAVAS EIXO'])analysis(name);
    ctx.currentOrders=[{id:'full',checklist:tables.checklist_analysis_general}];
    selects=tables.checklist_analysis_general.map(row=>choice(row.item_name));
    vm.runInContext(extract('comercial.html','createDecisionSelect'),ctx);
    for(const name of flow.fullParts)assert.ok(ctx.createDecisionSelect(name,'RECONDICIONAR','').includes('value="TROCAR CONJUNTO"'));
    for(const name of ['REPAROS','CT','CCO','TRAVAS EIXO'])assert.ok(!ctx.createDecisionSelect(name,'RECONDICIONAR','TROCAR CONJUNTO').includes('value="TROCAR CONJUNTO"'),name+' não tem FULL');
    assert.ok(ctx.createDecisionSelect('REPAROS','RECONDICIONAR','TROCAR CONJUNTO').includes('value="RECONDICIONAR" selected'));
    vm.runInContext(extract('comercial.html','executarAcaoLocal'),ctx);
    await ctx.executarAcaoLocal('trocar');
    for(const name of flow.fullParts){assert.equal(selects.find(s=>s.dataset.itemName===name).value,'TROCAR CONJUNTO');assert.equal(tables.checklist_analysis_general.find(r=>r.item_name===name).decisao_vendas,'TROCAR CONJUNTO');}
    for(const name of ['REPAROS','CCO','TRAVAS EIXO'])assert.equal(tables.checklist_analysis_general.find(r=>r.item_name===name).decisao_vendas,'RECONDICIONAR','ação rápida preserva '+name);
    const normalized=flow.commercialDecisions([...flow.fullParts.map(item_name=>({item_name,decisao_vendas:item_name==='CCE'?'TROCAR CONJUNTO':'OK'})),{item_name:'REPAROS',decisao_vendas:'TROCAR CONJUNTO',tech_verdict:'RECONDICIONAR'}]);
    assert.ok(normalized.slice(0,3).every(row=>row.decisao_vendas==='TROCAR CONJUNTO'));
    assert.equal(normalized[3].decisao_vendas,'RECONDICIONAR');

    await flow.ensureRepairs(client,'full');
    assert.equal(track('REPAROS').current_stage,'DESMONTAGEM');
    track('REPAROS').tracking_data=[{service:'Limpeza',duration_seconds:90}];track('REPAROS').executed_services=['Limpeza'];
    track('REPAROS').current_stage='RETIFICA';let before=JSON.stringify(track('REPAROS'));
    await flow.ensureRepairs(client,'full');assert.equal(JSON.stringify(track('REPAROS')),before,'repetição não retrocede serviços');
    readFailure='component_tracking';await assert.rejects(flow.ensureRepairs(client,'full'),/Falha de leitura/);readFailure='';
    tables.service_orders[0].status='Finalizado';await assert.rejects(flow.ensureRepairs(client,'full'),/encerrada/);tables.service_orders[0].status='Em Produção';

    before=JSON.stringify(track('REPAROS'));
    await requests.confirm(client,'full','EIXO','PURCHASE');
    assert.deepEqual(tables.triage_parts.map(row=>row.part_name).sort(),['CCE','EIXO','ROTOR']);
    assert.equal(JSON.stringify(track('REPAROS')),before,'pedido FULL não compra nem move Reparos');
    assert.equal((await requests.context(client,'full','REPAROS')).group,false);
    assert.equal((await requests.list(client)).length,1);
    await requests.receive(client,'full','CONJUNTO ROTATIVO (FULL)');
    assert.equal(flow.received(order()),true,'baixa FULL depende de só três peças');
    assert.equal(JSON.stringify(track('REPAROS')),before,'baixa FULL não altera serviços, setor ou veredito de Reparos');
    assert.equal(flow.tracking(order()).length,2,'FULL e Reparos são unidades diferentes de rastreio');
    assert.deepEqual(Array.from(flow.stations(order())).sort(),['MONTAGEM','RETIFICA']);
    ctx.window.currentTriageRequests=tables.triage_parts;ctx.renderizarPecas(tables.checklist_analysis_general);
    assert.equal(ctx.window.currentTriageParts.length,1);assert.ok(nodes.get('lista-pecas').innerHTML.includes('Eixo, Rotor e CCE'));
    assert.ok(!nodes.get('lista-pecas').innerHTML.includes('data-name="REPAROS"'),'recondicionar Reparos não cria compra');
    await flow.move('CONJUNTO ROTATIVO','SOLDA');
    assert.ok(flow.fullNames().every(name=>track(name).current_stage==='SOLDA'));
    assert.equal(JSON.stringify(track('REPAROS')),before,'retorno do FULL não arrasta Reparos');
    sector='SOLDA';await flow.move('CONJUNTO ROTATIVO','MONTAGEM');
    sector='RETIFICA';await flow.move('REPAROS','DESMONTAGEM');
    assert.ok(flow.fullNames().every(name=>track(name).current_stage==='MONTAGEM'));
    assert.equal(track('REPAROS').tracking_data[0].duration_seconds,90);
    sector='DESMONTAGEM';before=JSON.stringify(tables);
    await assert.rejects(flow.move('REPAROS','BALANCEAMENTO'),/Somente o eixo/);assert.equal(JSON.stringify(tables),before);

    // O card real da Desmontagem oferece serviços e retrabalho de Reparos com o FULL na Montagem.
    ctx.currentSelection={...order(),tracking:flow.tracking(order())};
    ctx.MASTER_COMPONENTS=['EIXO','ROTOR','CCE','REPAROS','CT','CCO'].map(title=>({title,items:['Jateamento']}));
    vm.runInContext(extract('desmontagem.html','renderComponentGrid'),ctx);ctx.renderComponentGrid();
    const card=nodes.get('component-grid').innerHTML;
    assert.ok(card.includes('id="card-comp-REPAROS"'));assert.ok(card.includes("startServiceTimer('REPAROS', 'Jateamento')"));
    assert.ok(card.includes('Retrabalho'));assert.ok(!card.includes('id="card-comp-EIXO"'));

    // Recebimento FULL não libera o carcaçamento com Reparos ainda na produção.
    tables.component_tracking.push(...['CT','CCO'].map(component_name=>({service_order_id:'full',component_name,current_stage:'MONTAGEM'})));
    ctx.selectedOS={...order(),full_tracking:flow.tracking(order())};
    const assembly=fs.readFileSync('montagem.html','utf8');
    vm.runInContext(assembly.slice(assembly.indexOf('        const CORE_PARTS'),assembly.indexOf('        async function fetchQueue(')),ctx);
    vm.runInContext(extract('montagem.html','getAssemblyDetailedState'),ctx);
    assert.equal(ctx.getAssemblyDetailedState(),'CARCACAMENTO_AGUARDANDO');
    sector='MONTAGEM';before=JSON.stringify(tables);
    await assert.rejects(flow.move('Peça Inteira','QUALIDADE'),/Aguarde Reparos/);assert.equal(JSON.stringify(tables),before);
    sector='DESMONTAGEM';await flow.move('REPAROS','MONTAGEM');sector='MONTAGEM';
    ctx.selectedOS={...order(),full_tracking:flow.tracking(order())};assert.equal(ctx.getAssemblyDetailedState(),'CARCACAMENTO_PRONTO');

    // Compra avulsa de Reparos permanece independente mesmo nesta O.S. FULL.
    const fullBefore=JSON.stringify(tables.component_tracking.filter(row=>flow.fullNames().includes(row.component_name)));
    await requests.confirm(client,'full','REPAROS','STOCK');
    assert.equal(JSON.stringify(tables.component_tracking.filter(row=>flow.fullNames().includes(row.component_name))),fullBefore);
    assert.equal((await requests.list(client))[0].name,'REPAROS');
    await requests.receive(client,'full','REPAROS');assert.equal(track('REPAROS').current_stage,'DESMONTAGEM');
    assert.equal(track('REPAROS').tracking_data[0].duration_seconds,90);
    assert.equal(JSON.stringify(tables.component_tracking.filter(row=>flow.fullNames().includes(row.component_name))),fullBefore);
    sector='DESMONTAGEM';await flow.move('REPAROS','MONTAGEM');sector='MONTAGEM';
    await flow.move('Peça Inteira','QUALIDADE');assert.equal(track('REPAROS').current_stage,'QUALIDADE','reparos prontos acompanham a turbina completa');
    assert.equal(tables.service_orders[0].status,'Aguardando Controle de Qualidade');

    // A administração usa a mesma baixa de três peças da Triagem.
    let received;
    const adminCtx=vm.createContext({PartRequests:{receive:async(...args)=>{received=args;}},ProductionFlow:flow,supabaseClient:client,confirm:()=>true,alert:noop,console,loadAdminDashboard:noop,openDeepDiveModal:noop});
    vm.runInContext(extract('admin.html','confirmarChegadaCompra'),adminCtx);
    await adminCtx.confirmarChegadaCompra('full','REPAROS',true);assert.equal(received[2],'REPAROS');
    await adminCtx.confirmarChegadaCompra('full','EIXO',true);assert.equal(received[2],'CONJUNTO ROTATIVO (FULL)');
    console.log('OK: FULL de três peças, Reparos separado no Comercial/compra/baixa/rastreio/produção, serviços preservados, carcaçamento aguarda Reparos e núcleo recondicionado mantém quatro peças');
})().catch(error=>{console.error(error);process.exitCode=1;});
