const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const tables={service_orders:[],component_tracking:[],triage_parts:[],checklist_analysis_general:[],checklist_qualidade:[],checklist_quality:[],history_events:[]};
const clone=value=>JSON.parse(JSON.stringify(value));let next=1,failures=[],writes=0;
const client={auth:{getSession:async()=>({data:{session:{user:{id:'inspector',user_metadata:{name:'Inspetor de teste'}}}},error:null})},from(table){
    let op='select',payload,filters=[],single=false,offset=0,end=Infinity;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},range(a,b){offset=a;end=b;return q;},
        maybeSingle(){single=true;return q;},single(){single=true;return q;},update(v){op='update';payload=v;return q;},insert(v){op='insert';payload=v;return q;},upsert(v){op='upsert';payload=v;return q;},
        then(resolve){
            if(failures[0]?.table===table&&failures[0].op===op){failures.shift();return resolve({error:new Error('Falha simulada '+table),data:null});}
            let rows=tables[table].filter(r=>filters.every(f=>f(r)));
            if(op!=='select'){
                writes++;
                if(op==='update')rows.forEach(r=>Object.assign(r,clone(payload)));
                else{rows=[];for(const value of Array.isArray(payload)?payload:[payload]){
                    if(table==='checklist_qualidade')assert.ok(!Object.hasOwn(value,'resolved_at'));
                    if(table==='checklist_quality')assert.deepEqual(Object.keys(value).sort(),['check_item','is_ok','service_order_id']);
                    const key=table==='component_tracking'?'component_name':table==='checklist_quality'?'check_item':'item_name';
                    let row=op==='upsert'?tables[table].find(r=>r.service_order_id===value.service_order_id&&r[key]===value[key]):null;
                    if(row)Object.assign(row,clone(value));else{row={id:next++,...clone(value)};tables[table].push(row);}rows.push(row);
                }}
            }
            const data=clone(rows.slice(offset,end===Infinity?undefined:end+1));return resolve({data:single?data[0]||null:data,error:null});
        }};return q;
}};
const ctx=vm.createContext({window:{},document:{addEventListener(){}},localStorage:{},crypto:webcrypto,
    Rework:{context:()=>({id:'os',sector:'QUALIDADE',order:tables.service_orders[0]}),client:()=>client,ensureFinished:async()=>true,validateLeader(divergent,authorized,note){if(divergent&&(!authorized||!String(note||'').trim()))throw Error('Liberação do líder e observação obrigatórias');}}});
for(const f of ['js/production-flow.js','js/quality-flow.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const flow=ctx.window.QualityFlow;
const names=['Travas CCO','Mancal Radial'],checksNames=['Folga radial','Folga axial'];
const reviewed={tab1:true,tab2:true},audit=[{item_name:names[0],status:'PEÇA OK',observation:''},{item_name:names[1],status:'NÃO INFORMADO',observation:''}],checks=checksNames.map(check_item=>({check_item,is_ok:true}));
function reset(entry='2026-10-21T10:00:00Z'){
    for(const name of Object.keys(tables))tables[name]=[];
    tables.service_orders.push({id:'os',status:'Aguardando Controle de Qualidade',updated_at:entry});
    tables.component_tracking=['PEÇA INTEIRA','EIXO','ROTOR','CCE','REPAROS','CT','CCO'].map(component_name=>({id:next++,service_order_id:'os',component_name,current_stage:'QUALIDADE',current_sector:'QUALIDADE',tracking_data:[{service:'Anterior',duration_seconds:45}],executed_services:['Anterior']}));
    tables.checklist_analysis_general=[{service_order_id:'os',item_name:names[0],status:'PEÇA OK'},{service_order_id:'os',item_name:'CCO',status:'RECONDICIONAR'}];
    failures=[];return flow.cycle(tables.service_orders[0]);
}
async function prepared(cycle){await flow.saveAudit(client,'os',cycle,audit,names,reviewed);await flow.saveFinal(client,'os',cycle,checks,checksNames);}
(async()=>{
    let cycle=reset(),before=writes;
    await assert.rejects(()=>flow.decide(client,'os',cycle,'APPROVED',{reviewed}),/três etapas/);assert.equal(writes,before);
    await assert.rejects(()=>flow.saveAudit(client,'os',cycle,audit,names,{tab1:true,tab2:false}),/duas abas/);
    await assert.rejects(()=>flow.saveAudit(client,'os',cycle,audit.slice(0,1),names,reviewed),/duas abas/);
    const divergent=audit.map(r=>({...r,status:'TROCAR'}));
    await assert.rejects(()=>flow.saveAudit(client,'os',cycle,divergent,names,reviewed),/líder/);
    await assert.rejects(()=>flow.saveAudit(client,'os',cycle,divergent,names,reviewed,{authorized:true,note:' '}),/observação/);
    tables.checklist_qualidade.push({id:next++,service_order_id:'os',item_name:'TRAVAS CCO',status:'PEÇA OK',observation:''});
    await flow.saveAudit(client,'os',cycle,audit,names,reviewed);
    assert.equal(tables.checklist_qualidade.filter(r=>r.item_name.toUpperCase()==='TRAVAS CCO').length,1,'Grafia antiga não gera duplicata');
    assert.equal(flow.auditValid(await flow.load(client,'os')),true,'Baseline de CCO não provoca divergência em abas de anexos/reparos');
    await assert.rejects(()=>flow.saveFinal(client,'os',cycle,[checks[0]],checksNames),/todos os itens/);
    await assert.rejects(()=>flow.saveFinal(client,'os',cycle,[{...checks[0],is_ok:null},checks[1]],checksNames),/todos os itens/);
    await assert.rejects(()=>flow.saveFinal(client,'os',cycle,[{...checks[0],is_ok:false},checks[1]],checksNames),/líder/);
    await flow.saveFinal(client,'os',cycle,checks,checksNames);
    assert.equal(flow.finalValid(await flow.load(client,'os')),true);
    await flow.saveAudit(client,'os',cycle,audit,names,reviewed);
    assert.equal(flow.finalValid(await flow.load(client,'os')),false,'Nova revisão da auditoria invalida liberação final anterior');
    await flow.saveFinal(client,'os',cycle,[{...checks[0],is_ok:false},checks[1]],checksNames,{authorized:true,note:'Divergência tratada e verificada pelo líder'});
    assert.equal(flow.marker(await flow.load(client,'os'),'quality_final').leader.note,'Divergência tratada e verificada pelo líder');
    await flow.saveFinal(client,'os',cycle,checks,checksNames);
    await assert.rejects(()=>flow.decide(client,'os',cycle,'APPROVED',{reviewed:{tab1:true,tab2:false}}),/três etapas/);
    tables.checklist_analysis_general[0].status='TROCAR';
    await assert.rejects(()=>flow.decide(client,'os',cycle,'APPROVED',{reviewed}),/três etapas/);
    tables.checklist_analysis_general[0].status='PEÇA OK';
    tables.checklist_quality[0].is_ok=false;
    await assert.rejects(()=>flow.decide(client,'os',cycle,'APPROVED',{reviewed}),/três etapas/);tables.checklist_quality[0].is_ok=true;
    await assert.rejects(()=>flow.decide(client,'os',cycle,'REJECTED',{destination:'DESMONTAGEM',reason:' '}),/motivo/);
    await assert.rejects(()=>flow.decide(client,'os',cycle,'REJECTED',{destination:'MONTAGEM',reason:'Folga excessiva'}),/Desmontagem/);
    await flow.decide(client,'os',cycle,'REJECTED',{destination:'DESMONTAGEM',reason:'Folga radial excessiva',checks:[{check_item:'Folga radial',is_ok:false}],reviewed});
    assert.equal(tables.service_orders[0].status,'Em Produção');assert.ok(tables.component_tracking.every(t=>t.current_stage==='DESMONTAGEM'));
    assert.ok(tables.component_tracking.every(t=>t.tracking_data[0].duration_seconds===45));
    const eventCount=tables.history_events.length;await flow.decide(client,'os',cycle,'REJECTED',{});assert.equal(tables.history_events.length,eventCount,'Repetição não duplica resultado');
    let metrics=flow.metrics(await flow.results(client));assert.equal(metrics.rejected,1);assert.equal(metrics.rate,100);
    tables.service_orders[0].status='Aguardando Controle de Qualidade';tables.service_orders[0].updated_at='2026-10-21T11:00:00Z';tables.component_tracking.forEach(t=>t.current_stage=t.current_sector='QUALIDADE');
    cycle=flow.cycle(tables.service_orders[0]);assert.equal(flow.finalValid(await flow.load(client,'os')),false,'Retorno exige nova inspeção apesar dos checklists antigos');
    await assert.rejects(()=>flow.decide(client,'os',cycle,'APPROVED',{reviewed}),/três etapas/);
    await prepared(cycle);await flow.decide(client,'os',cycle,'APPROVED',{reviewed});
    assert.equal(tables.service_orders[0].status,'Pronto para Entrega');assert.ok(tables.component_tracking.every(t=>t.current_stage==='EXPEDICAO'));
    metrics=flow.metrics(await flow.results(client));assert.equal(metrics.total,2);assert.equal(metrics.approved,1);assert.equal(metrics.rejected,1);assert.equal(metrics.rate,50);
    assert.equal(flow.metrics([...tables.history_events,...tables.history_events]).total,2,'Repetições da mesma inspeção não inflam a taxa');
    assert.equal(flow.metrics(await flow.results(client),'2030-01-01','2030-01-31').total,0);
    tables.service_orders[0].status='Finalizado';await assert.rejects(()=>flow.decide(client,'os','outra-entrada','REJECTED',{destination:'DESMONTAGEM',reason:'Teste'}),/mudou de etapa/);
    cycle=reset();
    failures=[{table:'service_orders',op:'update'}];
    await assert.rejects(()=>flow.decide(client,'os',cycle,'REJECTED',{reason:'Falha de vedação',destination:'DESMONTAGEM'}),/Falha simulada/);
    assert.equal(flow.metrics(tables.history_events).total,0,'Resultado parcial não entra no indicador');
    await flow.decide(client,'os',cycle,'REJECTED',{});
    assert.equal(flow.metrics(await flow.results(client)).rejected,1);assert.equal(tables.component_tracking[0].tracking_data.length,2,'Retomada não movimenta duas vezes');
    cycle=reset();await prepared(cycle);failures=[{table:'component_tracking',op:'update'}];
    await assert.rejects(()=>flow.decide(client,'os',cycle,'APPROVED',{reviewed}),/Falha simulada/);
    assert.equal(tables.service_orders[0].status,'Pronto para Entrega');assert.equal(flow.metrics(tables.history_events).total,0);
    await flow.decide(client,'os',cycle,'APPROVED',{});assert.ok(tables.component_tracking.every(t=>t.current_stage==='EXPEDICAO'));
    assert.equal(flow.metrics(await flow.results(client)).approved,1);
    cycle=reset();failures=[{table:'history_events',op:'update'},{table:'history_events',op:'update'}];
    await assert.rejects(()=>flow.decide(client,'os',cycle,'REJECTED',{reason:'Rosca danificada',destination:'DESMONTAGEM'}),/Falha simulada/);
    assert.equal(flow.metrics(tables.history_events).total,0);
    assert.equal(flow.metrics(await flow.results(client)).rejected,1,'Indicadores recuperam resultado aplicado sem duplicar a reprovação');
    console.log('OK: três etapas obrigatórias, divergência com líder/observação, reprovação para Desmontagem, reinspeção, métricas, tela antiga e recuperação de falhas parciais');
})().catch(error=>{console.error(error);process.exitCode=1;});
