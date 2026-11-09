const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const noop=()=>{},alerts=[],storage=new Map(),nodes=new Map();
function node(){return {value:'',innerHTML:'',innerText:'',textContent:'',classList:{add:noop,remove:noop,toggle:noop},querySelector:()=>node(),querySelectorAll:()=>[]};}
const document={addEventListener:noop,getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll:()=>[]};
const tables={service_orders:[{id:'os',status:'Em Produção'}],checklist_analysis_general:[],checklist_analysis_caracol:[],component_tracking:[{service_order_id:'os',component_name:'CT',current_stage:'BANCADA',tracking_data:[]}],history_events:[],checklist_desmontagem:[]};
let failInsert=false;
const client={auth:{getSession:async()=>({data:{session:{user:{id:'operator',email:'teste@exemplo.local',user_metadata:{name:'Operador teste'}}}}})},from(table){
    assert.ok(Object.hasOwn(tables,table),table);let filters=[],single=false,bounds,op='select',payload;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},order(){return q;},range(a,b){bounds=[a,b];return q;},single(){single=true;return q;},insert(p){op='insert';payload=p;return q;},upsert(p){op='upsert';payload=p;return q;},then(resolve,reject){
        if(op==='insert'){
            if(failInsert)return Promise.resolve({data:null,error:Error('Sem conexão')}).then(resolve,reject);
            assert.equal(table,'history_events');Object.keys(payload).forEach(k=>assert.ok(['service_order_id','user_id','action','description','details','timestamp'].includes(k),k));
            tables[table].push({id:tables[table].length+1,...structuredClone(payload)});
        }
        if(op==='upsert'){
            assert.equal(table,'checklist_desmontagem');
            for(const row of payload)Object.keys(row).forEach(k=>assert.ok(['service_order_id','item_name','status','observation'].includes(k),k));
            tables[table].push(...structuredClone(payload));
        }
        let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(bounds)rows=rows.slice(bounds[0],bounds[1]+1);
        return Promise.resolve({data:single?rows[0]:structuredClone(rows),error:null}).then(resolve,reject);
    }};return q;
}};
const ctx=vm.createContext({window:{},document,console,selectedOS:{id:'os'},supabaseClient:client,setInterval:noop,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},alert:message=>alerts.push(message),renderComponents:noop});
for(const file of ['js/production-flow.js','js/rework.js','js/caracol-checklist.js','js/caracol-bancada.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const model=ctx.window.CaracolChecklist,ui=ctx.window.CaracolBancada;
function extract(file,name){const source=fs.readFileSync(file,'utf8'),start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);for(const end of source.slice(start).matchAll(/^[ \t]{0,8}\}/gm)){const text=source.slice(start,start+end.index+end[0].length);try{new vm.Script(text);return text;}catch{}}throw Error(name);}
const answered=()=>Array.from(model.items,item_name=>({item_name,status:'PEÇA OK',observation:''}));
const baseline=()=>{tables.checklist_analysis_general=answered().map(row=>({...row,service_order_id:'os'}));};
async function save(rows=answered(),leader={},condemned=false){const state=await model.load(client,'os');return model.save(client,'os',state.entry,state.baselineSignature,rows,condemned,true,leader);}
(async()=>{
    assert.equal(model.items.length,19);
    for(const name of ['CT','Caracol','Carcaça de Turbina','CARCAÇA DE TURBINA (CT)'])assert.ok(model.isCT(name));
    assert.equal(model.isCT('CCO'),false);
    assert.equal(model.isItem('Almofada Vedação Caracol'),false,'item do checklist geral permanece nos outros setores');
    baseline();let state=await model.load(client,'os');assert.equal(state.ready,false);
    await assert.rejects(model.save(client,'os',state.entry,state.baselineSignature,answered(),false,false),/Confirme/);
    await assert.rejects(save(answered().slice(1)),/todos os itens/);
    await assert.rejects(save(answered().map(row=>({...row,status:'NÃO INFORMADO'}))),/Preencha/);
    const original=JSON.stringify(tables.checklist_analysis_general);
    const audit=await save();assert.equal(audit.user_id,'operator');assert.equal(audit.rows.length,19);
    assert.equal((await model.load(client,'os')).ready,true,'validação persiste após reabrir a O.S.');
    assert.equal(JSON.stringify(tables.checklist_analysis_general),original,'Bancada não sobrescreve Análise Técnica');
    const differing=answered();differing[0].status='RECONDICIONAR';
    await assert.rejects(save(differing),/liberação do líder/);
    await assert.rejects(save(differing,{authorized:true,note:''}),/observação/);
    const authorized=await save(differing,{authorized:true,note:'Reavaliada a trinca e definido o reparo'});
    assert.equal(authorized.differences.length,1);assert.ok(authorized.leader_note.includes('trinca'));
    assert.ok(tables.history_events.at(-1).details.includes('Reavaliada a trinca'));
    tables.checklist_analysis_general[0].status='TROCAR';assert.equal((await model.load(client,'os')).ready,false,'mudança da análise invalida conferência antiga');
    await assert.rejects(model.save(client,'os',state.entry,state.baselineSignature,answered(),false,true),/análise.*mudou/);
    baseline();tables.component_tracking[0].tracking_data.push({action:'ROTEAMENTO',from:'SOLDA',to:'BANCADA',timestamp:'2026-11-09T12:00:00Z'});
    assert.equal((await model.load(client,'os')).ready,false,'retorno à Bancada exige nova validação');
    await save();assert.equal((await model.load(client,'os')).ready,true);
    tables.component_tracking[0].current_stage='SOLDA';assert.equal((await model.load(client,'os')).ready,false);
    await assert.rejects(save(),/não está mais na Bancada/);
    tables.component_tracking[0].current_stage='BANCADA';tables.service_orders[0].status='Finalizado';
    assert.equal((await model.load(client,'os')).ready,false);await assert.rejects(save(),/não está mais na Bancada/);tables.service_orders[0].status='Em Produção';
    failInsert=true;await assert.rejects(save(),/Sem conexão/);failInsert=false;
    tables.checklist_analysis_general=[];tables.checklist_analysis_caracol=answered().map(row=>({...row,service_order_id:'os'}));
    assert.equal((await model.load(client,'os')).baseline.length,19,'fonte legada do Caracol também é lida');
    tables.checklist_analysis_caracol=[];tables.checklist_analysis_general=[{service_order_id:'os',item_name:model.condemned,status:'TROCAR'}];
    await save([],{},true);assert.equal((await model.load(client,'os')).ready,true,'condenação integral dispensa os subitens');
    baseline();await save();

    // Funções reais da Bancada: início/retomada e reabertura de tempo salvo não furam a validação.
    for(const name of ['startServiceTimer','resumeServiceTimer','resumeSavedServiceTimer'])vm.runInContext(extract('bancada.html',name),ctx);
    ui.state=await model.load(client,'os');ui.dirty=true;
    for(const name of ['startServiceTimer','resumeServiceTimer','resumeSavedServiceTimer'])await ctx[name]('CT','ANÁLISE',20);
    assert.equal(storage.size,0,'não grava cronômetro antes de validar');
    ui.dirty=false;await ctx.startServiceTimer('CT','ANÁLISE');assert.ok(storage.has('timer_os_CT_ANÁLISE'));storage.clear();
    ui.dirty=true;await ctx.startServiceTimer('CCO','ANÁLISE');assert.ok(storage.has('timer_os_CCO_ANÁLISE'),'outros componentes continuam livres');storage.clear();
    let asked=0;ctx.window.Rework.requestNote=async()=>{asked++;return 'Retrabalho';};
    await ctx.window.Rework.act({dataset:{reworkOrder:'os',reworkSector:'BANCADA',reworkComponent:'CT',reworkEnabled:'true'}},'start');
    assert.equal(asked,0,'retrabalho do CT também exige a conferência antes do início');
    assert.ok(ctx.window.Rework.body('os','BANCADA','CT',true).includes('data-rework-action="start" disabled'),'botão de retrabalho também indica o bloqueio');
    assert.equal(await ui.ensure('CT','outra-os'),false,'painel de outra O.S. não libera o Caracol atual');

    // A gravação real da Desmontagem não compara os itens retirados, nem acusa falta deles como divergência.
    tables.checklist_analysis_general.push({service_order_id:'os',item_name:'TRAVAS CT',status:'PEÇA OK'});
    const disNodes=new Map(),select={dataset:{itemName:'Travas CT'},value:'PEÇA OK'};
    ctx.currentSelection={id:'os'};
    ctx.document.getElementById=id=>{if(!disNodes.has(id))disNodes.set(id,node());return disNodes.get(id);};
    ctx.document.querySelectorAll=selector=>selector==='.status-select-disassembly'?[select]:[];
    ctx.renderChecklistSummary=noop;
    vm.runInContext(extract('desmontagem.html','saveChecklistDisassembly'),ctx);
    assert.equal(await ctx.saveChecklistDisassembly(),true);
    assert.equal(tables.checklist_desmontagem.length,1);assert.equal(ctx.window.currentComparisonList.length,1);
    assert.equal(ctx.window.currentComparisonList[0].itemName,'Travas CT');
    assert.deepEqual(alerts,[]);
    const disassembly=fs.readFileSync('desmontagem.html','utf8');
    assert.ok(!disassembly.includes('data-tab="tab3"'));assert.ok(!disassembly.includes('id="tab3"'));
    assert.ok(fs.readFileSync('analise-tecnica.html','utf8').includes('tab3: CaracolChecklist.items'));
    // Renderiza o formulário novo e os cards reais, sem abrir/gravar uma O.S. de produção.
    ctx.window.Rework.render=()=>'';ctx.window.ProductionFlow.render=()=>'';
    ctx.selectedOS={id:'os',full_tracking:[{component_name:'CT',current_stage:'BANCADA'},{component_name:'CCO',current_stage:'BANCADA'}],components_to_render:['CT','CCO']};ctx.specialItems=[];
    const bench=fs.readFileSync('bancada.html','utf8');
    vm.runInContext(bench.slice(bench.indexOf('        const STRUCTURE ='),bench.indexOf('        // BUSCA FILA DIRETO')),ctx);
    vm.runInContext(extract('bancada.html','renderComponents'),ctx);
    ui.state=await model.load(client,'os');ui.dirty=true;
    ctx.renderComponents();
    const html=ctx.document.getElementById('metrology-grid').innerHTML;
    assert.ok(html.includes('<button disabled type="button" onclick="startServiceTimer(\'CT\''),'início do CT desabilitado no HTML');
    assert.ok(html.includes('<button type="button" onclick="startServiceTimer(\'CCO\''),'CCO continua habilitado');
    ui.draw();
    const panel=ctx.document.getElementById('caracol-bancada-panel').innerHTML;
    assert.equal((panel.match(/data-caracol-row data-index=/g)||[]).length,19);
    assert.ok(panel.includes('3. Checklist do Caracol (Caixa Quente)'));
    assert.ok(!panel.includes('Reparos Gerais (Interno)'));
    console.log('OK: checklist 3 somente Análise/Bancada, 19 itens, legado, condenação, autorização com observação, persistência, reentrada, bloqueio dos três inícios/retrabalho e Desmontagem sem falsa divergência');
})().catch(error=>{console.error(error);process.exitCode=1;});
