const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const noop=()=>{},nodes=new Map(),storage={},calls=[];
let selected={id:'order',status:'Em Produção',tracking:[]},sector='BANCADA',canFinish=true,confirmResult=true,reloads=0,rpcError=null;
const arrival=id=>({action:'RECEBIMENTO_CONJUNTO_NOVO',receipt_id:id,timestamp:'2026-11-12T12:00:00Z'});
const review=(id,result,note='Conjunto correto')=>({action:'CONFERENCIA_CONJUNTO_NOVO',receipt_id:id,result,note,timestamp:'2026-11-12T12:10:00Z'});
const core={component_name:'CONJUNTO ROTATIVO',verdict_vendas:'TROCAR CONJUNTO',current_stage:'BANCADA',tracking_data:[arrival('one')]};
selected.tracking=[core,{component_name:'REPAROS',current_stage:'RETIFICA'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client={rpc:async(name,args)=>{calls.push({name,args});return {error:rpcError};},from(){throw Error('Conferência deve ser transacional no servidor');}};
const ctx=vm.createContext({window:{},document:{addEventListener:noop},localStorage:storage,alert:noop,confirm:()=>confirmResult,
    location:{reload:()=>reloads++},Rework:{escape:esc,context:()=>({id:selected.id,sector,order:selected}),client:()=>client,ensureFinished:async()=>canFinish}});
for(const f of ['js/production-flow.js','js/core-inspection.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const flow=ctx.window.ProductionFlow,ui=ctx.window.CoreInspection;
const error={textContent:''},note={value:'Aplicação incorreta, medida divergente',focus:noop};
const panel={dataset:{order:'order',receipt:'one'},querySelector:key=>key==='[data-core-note]'?note:error};
function extract(file,name){const s=fs.readFileSync(file,'utf8'),start=s.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0);for(const end of s.slice(start).matchAll(/^[ \t]{0,8}\}/gm)){const part=s.slice(start,start+end.index+end[0].length);try{new vm.Script(part);return part;}catch{}}throw Error(name);}
(async()=>{
    assert.equal(flow.coreInspection(selected).approved,false);
    assert.ok(ui.render(selected,'CONJUNTO ROTATIVO').includes('data-core-decision="REJECT"'));
    for(const name of [...flow.fullNames(),'PEÇA INTEIRA'])assert.equal(flow.destinations(name,'BANCADA',selected).length,0,'sem atalho antes de conferir '+name);
    assert.ok(flow.destinations('REPAROS','RETIFICA',selected).includes('MONTAGEM'),'Reparos independente');
    assert.equal(ui.render(selected,'REPAROS'),'');
    ui.drafts.set('one','Conferindo aplicação e medidas');
    assert.ok(ui.render(selected,'CONJUNTO ROTATIVO').includes('Conferindo aplicação e medidas'),'anotação preservada ao renderizar o card');
    assert.equal(flow.render('CONJUNTO ROTATIVO'),'','não mostra encaminhamento genérico antes de conferir');
    note.value=' ';await assert.rejects(ui.decide(panel,false),/Informe o resultado/);assert.equal(calls.length,0);
    note.value='Aplicação incorreta';sector='MONTAGEM';await assert.rejects(ui.decide(panel,false),/Bancada/);sector='BANCADA';
    selected.id='other';await assert.rejects(ui.decide(panel,false),/Selecione novamente/);selected.id='order';
    canFinish=false;assert.equal(await ui.decide(panel,false),false);canFinish=true;
    storage['timer_order_CONJUNTO ROTATIVO_ANALISE']='started';await assert.rejects(ui.decide(panel,false),/cronômetros/);delete storage['timer_order_CONJUNTO ROTATIVO_ANALISE'];
    storage.timer_paused_order_CCE_ANALISE='12';await assert.rejects(ui.decide(panel,false),/cronômetros/);delete storage.timer_paused_order_CCE_ANALISE;
    confirmResult=false;assert.equal(await ui.decide(panel,false),false);assert.equal(calls.length,0);confirmResult=true;
    rpcError=Error('Recebimento mudou');await assert.rejects(ui.decide(panel,false),/Recebimento mudou/);assert.equal(reloads,0);rpcError=null;
    await ui.decide(panel,false);assert.equal(reloads,1);assert.equal(calls.at(-1).name,'inspect_new_core');assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args)),{p_order:'order',p_receipt:'one',p_approved:false,p_note:'Aplicação incorreta'});
    await ui.decide(panel,true);assert.equal(calls.at(-1).args.p_approved,true);
    core.tracking_data.push(review('one','REPROVADO','<script>Erro de aplicação</script>'));
    assert.ok(flow.inspectionBanner(selected,'CONJUNTO ROTATIVO').includes('&lt;script&gt;'));
    assert.ok(!flow.inspectionBanner(selected,'REPAROS'));
    core.tracking_data.push(arrival('two'));assert.equal(flow.coreInspection(selected).approved,false);
    assert.equal(flow.coreInspection(selected).failures.length,1);
    core.tracking_data.push(review('two','APROVADO'));assert.equal(flow.coreInspection(selected).approved,true);
    assert.equal(flow.coreInspection(selected).failures.length,1,'a reposição aprovada mantém evidência anterior');
    assert.ok(flow.inspectionBanner(selected,'PEÇA INTEIRA').includes('Não conformidades do conjunto: 1'));
    assert.ok(flow.destinations('CONJUNTO ROTATIVO','BANCADA',selected).includes('MONTAGEM'));
    // O card real da Bancada contém a conferência e o serviço de análise, sem rota alternativa à aprovação.
    const source=fs.readFileSync('bancada.html','utf8');
    assert.ok(source.includes('js/core-inspection.js'));assert.ok(source.includes('ANÁLISE DO CONJUNTO NOVO'));
    // A tela de Montagem também impede serviço e movimentação enquanto aguarda conferência.
    const assemblyCtx=vm.createContext({ProductionFlow:flow,selectedOS:{...selected,purchase_parts:flow.fullParts.map(part_name=>({part_name,availability:'STOCK',is_resolved:true}))},localStorage:{getItem:()=>null},alert:noop});
    const assembly=fs.readFileSync('montagem.html','utf8');vm.runInContext(assembly.slice(assembly.indexOf('        const CORE_PARTS'),assembly.indexOf('        async function fetchQueue(')),assemblyCtx);
    vm.runInContext(extract('montagem.html','getAssemblyDetailedState'),assemblyCtx);
    core.tracking_data.push(arrival('three'));
    assert.equal(assemblyCtx.blockPendingCore(),true);assert.equal(assemblyCtx.getAssemblyDetailedState(),'CARCACAMENTO_AGUARDANDO');
    const triage=fs.readFileSync('js/triage-requests.js','utf8');
    assert.ok(triage.includes('data-define-request'));assert.ok(triage.includes('Não conformidade:'));
    console.log('OK: conferência por chegada, motivo, cancelamento, erro, cronômetros, bloqueio de rotas e Montagem, histórico permanente e reposição na Triagem');
})().catch(error=>{console.error(error);process.exitCode=1;});
