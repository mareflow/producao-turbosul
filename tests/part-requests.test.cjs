const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const tables={service_orders:[{id:'os',status:'Aguardando Triagem',business_id:'O.S-001'}],triage_parts:[],checklist_analysis_general:[],component_tracking:[],history_events:[]};
let next=1,writes=0;
const client={from(table){let operation='select',payload,filters=[],single=false,join=false;const q={
    select(fields=''){join=fields.includes('service_orders');return q;},maybeSingle(){single=true;return q;},
    eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,values){filters.push(r=>values.includes(r[k]));return q;},
    update(data){operation='update';payload=data;return q;},insert(data){operation='insert';payload=data;return q;},upsert(data){operation='upsert';payload=data;return q;},
    then(resolve){try{
        const payloadRows=payload ? (Array.isArray(payload)?payload:[payload]) : [];
        if(table==='checklist_analysis_general'&&payloadRows.some(row=>Object.hasOwn(row,'resolved_at')))
            return resolve({error:{message:"Could not find the 'resolved_at' column of 'checklist_analysis_general' in the schema cache"}});
        let found=tables[table].filter(row=>filters.every(f=>f(row)));
        if(operation==='update'){writes++;found.forEach(r=>Object.assign(r,payload));}
        if(operation==='insert'||operation==='upsert'){
            const rows=Array.isArray(payload)?payload:[payload];
            if(operation==='insert'&&table==='triage_parts'&&rows.some(row=>tables[table].some(t=>t.service_order_id===row.service_order_id&&t.part_name===row.part_name)))return resolve({error:{message:'duplicate request'}});
            writes++;for(const row of rows){const existing=operation==='upsert'?tables[table].find(t=>t.service_order_id===row.service_order_id&&t.component_name===row.component_name):null;if(existing)Object.assign(existing,row);else tables[table].push({id:next++,...row});}
        }
        if(join)found=found.map(r=>({...r,service_orders:tables.service_orders.find(o=>o.id===r.service_order_id)}));
        return resolve({data:single?found[0]||null:found,error:null});
    }catch(error){return resolve({error});}}
};return q;}};
const element=()=>({value:'02',innerHTML:'',textContent:'',disabled:false,classList:{add(){},remove(){}},querySelectorAll:()=>[]});
const ctx=vm.createContext({window:{},document:{addEventListener(){},getElementById:()=>element()},localStorage:{},location:{reload(){}},console,alert(message){throw new Error(message);},confirm:()=>false,supabaseClient:client,selecionada:{id:'os'},allOrders:[]});
for(const file of ['js/production-flow.js','js/part-requests.js','js/triage-requests.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
ctx.confirmarTipoPedido=async()=>false;
const requests=ctx.window.PartRequests;
(async()=>{
    const legacy={id:next++,service_order_id:'os',part_name:'GEOMETRIA VARIÁVEL',availability:'ORDER',is_resolved:false};tables.triage_parts.push(legacy);
    const geometry={id:next++,service_order_id:'os',item_name:'GEOMETRIA VARIÁVEL',availability:'PENDING',is_resolved:false};tables.checklist_analysis_general.push(geometry);
    tables.component_tracking.push({service_order_id:'os',component_name:'GEOMETRIA',current_stage:'COMPRA',tracking_data:[{service:'Serviço anterior',duration_seconds:30}]});
    assert.equal((await requests.list(client)).length,0,'Pedidos antigos automáticos precisam de confirmação');
    const before=writes;await vm.runInContext("sincronizarPeca({},'GEOMETRIA VARIÁVEL','ORDER')",ctx);assert.equal(writes,before,'Cancelar não grava nem seleciona nada');
    await requests.confirm(client,'os','GEOMETRIA','STOCK');
    assert.equal(legacy.availability,'STOCK_REQUEST');assert.equal(legacy.is_resolved,false);
    assert.equal(geometry.availability,'STOCK_REQUEST');assert.equal(geometry.is_resolved,false);assert.equal(legacy.resolved_at,null);
    assert.equal(tables.component_tracking[0].current_stage,'ESTOQUE');
    assert.equal((await requests.list(client))[0].type,'STOCK');
    await assert.rejects(()=>requests.confirm(client,'os','GEOMETRIA','PURCHASE'),/não pode ser alterado/);
    const historyCount=tables.history_events.length;await requests.confirm(client,'os','GEOMETRIA','STOCK');assert.equal(tables.history_events.length,historyCount,'Repetição não duplica pedido');
    await vm.runInContext("salvarTriagem('Aguardando Desmontagem OS')",ctx);
    assert.equal(legacy.is_resolved,false,'Liberar triagem não dá baixa em retirada do estoque');
    assert.equal(tables.component_tracking[0].current_stage,'ESTOQUE');
    await requests.receive(client,'os','GEOMETRIA');
    assert.equal(legacy.is_resolved,true);assert.equal(tables.component_tracking[0].current_stage,'MONTAGEM');
    assert.equal(geometry.availability,'STOCK');assert.equal(geometry.is_resolved,true);assert.ok(legacy.resolved_at);assert.equal(Object.hasOwn(geometry,'resolved_at'),false);
    assert.equal(tables.component_tracking[0].tracking_data[0].duration_seconds,30,'Não sobrescreve serviços anteriores');
    tables.component_tracking[0].current_stage='RETIFICA';await requests.receive(client,'os','GEOMETRIA');assert.equal(tables.component_tracking[0].current_stage,'RETIFICA','Baixa repetida não retrocede peça em produção');
    await requests.confirm(client,'os','ATUADOR','PURCHASE');
    const actuator=tables.triage_parts.find(r=>r.part_name==='ATUADOR');assert.equal(actuator.is_resolved,false);assert.equal(actuator.availability,'PURCHASE_REQUEST');
    assert.equal((await requests.list(client))[0].type,'PURCHASE');
    await requests.receive(client,'os','ATUADOR');assert.equal(actuator.is_resolved,true);
    await requests.confirm(client,'os','EIXO','PURCHASE');assert.equal(tables.triage_parts.filter(r=>r.part_name==='ROTOR').length,0,'Eixo avulso não vira conjunto');
    await requests.receive(client,'os','EIXO');assert.equal(tables.component_tracking.find(r=>r.component_name==='EIXO').current_stage,'BALANCEAMENTO');
    tables.service_orders.push({id:'full',status:'Aguardando Triagem'});
    for(const item_name of ['EIXO','ROTOR','CCE','REPAROS'])tables.checklist_analysis_general.push({id:next++,service_order_id:'full',item_name,decisao_vendas:'TROCAR CONJUNTO'});
    await requests.confirm(client,'full','EIXO','STOCK');
    assert.equal(tables.triage_parts.filter(r=>r.service_order_id==='full'&&!r.is_resolved).length,4);
    assert.equal((await requests.list(client)).filter(r=>r.os_id==='full').length,1,'Pedido único para conjunto full');
    assert.ok(tables.component_tracking.filter(r=>r.service_order_id==='full').every(r=>r.current_stage==='ESTOQUE'));
    await requests.receive(client,'full','CONJUNTO ROTATIVO (FULL)');
    assert.ok(tables.component_tracking.filter(r=>r.service_order_id==='full').every(r=>r.current_stage==='MONTAGEM'));
    assert.equal((await requests.list(client)).length,0);
    tables.service_orders.push({id:'partial',status:'Aguardando Triagem'});
    const partialReceipt={id:next++,service_order_id:'partial',part_name:'GEOMETRIA VARIÁVEL',availability:'STOCK_REQUEST',is_resolved:false,resolved_at:null};
    const partialAnalysis={id:next++,service_order_id:'partial',item_name:'GEOMETRIA VARIÁVEL',availability:'PENDING',is_resolved:false};
    tables.triage_parts.push(partialReceipt);tables.checklist_analysis_general.push(partialAnalysis);
    await requests.confirm(client,'partial','GEOMETRIA','STOCK');
    assert.equal(partialAnalysis.availability,'STOCK_REQUEST','Repetir confirmação recupera checklist após falha parcial');
    assert.equal(partialReceipt.is_resolved,false,'Recuperação não registra baixa física');
    assert.equal(tables.triage_parts.filter(r=>r.service_order_id==='partial').length,1,'Recuperação preserva o pedido original');
    assert.equal(tables.history_events.filter(r=>r.service_order_id==='partial').length,1);
    await requests.confirm(client,'partial','GEOMETRIA','STOCK');
    assert.equal(tables.history_events.filter(r=>r.service_order_id==='partial').length,1,'Recuperação não duplica histórico');
    await assert.rejects(()=>requests.receive(client,'os','CANOTE'),/Confirme o pedido/);
    tables.service_orders[0].status='Finalizado';await assert.rejects(()=>requests.confirm(client,'os','CCO','PURCHASE'),/encerrada/);
    console.log('OK: cancelamento, confirmação imutável, compra e estoque pendentes, baixa física, conjunto/avulso e preservação dos serviços');
})().catch(error=>{console.error(error);process.exitCode=1;});
