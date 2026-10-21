let qualityState=null,qualityBusy=false,qualityLoadToken=0,qualityMetricsTime=0;
const qualityEl=id=>document.getElementById(id);
const qualityEscape=value=>Rework.escape(value);
function qualityNotify(message){qualityEl('quality-feedback').textContent=message;qualityEl('quality-feedback').classList.remove('hidden');}
function qualityReviewed(){return qualityState?.reviewed.tab1&&qualityState?.reviewed.tab2;}
function qualityCanApprove(){return !!qualityState&&(qualityState.pending?qualityState.pending.outcome==='APPROVED':(qualityReviewed()&&qualityState.auditSaved&&qualityState.finalSaved&&qualityState.finalReviewed));}
function qualityButtons(){
    const ready=!!qualityState&&!qualityBusy;
    qualityEl('main-workspace').classList.toggle('pointer-events-none',qualityBusy||!!qualityState?.pending);
    qualityEl('btn-salvar-auditoria').disabled=!ready||!qualityReviewed();
    qualityEl('btn-salvar-checklist').disabled=!ready||!qualityState.auditSaved||!qualityReviewed()||!qualityState.finalReviewed||qualityReadChecks().some(r=>typeof r.is_ok!=='boolean');
    qualityEl('btn-finalize-quality').disabled=!ready||!qualityCanApprove()||qualityState.pending?.outcome==='REJECTED';
    qualityEl('btn-reject-quality').disabled=!ready||qualityState.pending?.outcome==='APPROVED';
    qualityEl('btn-finalize-quality').textContent=qualityState?.pending?.outcome==='APPROVED'?'Concluir gravação da aprovação':'Aprovar e Notificar Expedição';
    qualityEl('btn-reject-quality').textContent=qualityState?.pending?.outcome==='REJECTED'?'Concluir gravação da reprovação':'Reprovar e devolver à Desmontagem';
    qualityEl('quality-reject-reason').disabled=qualityBusy||!!qualityState?.pending;
    if(qualityState?.pending?.outcome==='REJECTED')qualityEl('quality-reject-reason').value=qualityState.pending.reason;
    for(const id of ['btn-salvar-auditoria','btn-salvar-checklist','btn-finalize-quality','btn-reject-quality'])qualityEl(id).classList.toggle('opacity-50',qualityEl(id).disabled);
    qualityEl('quality-progress').textContent=!qualityState?'Carregando inspeção...':qualityState.pending?'Existe uma decisão aguardando conclusão da gravação. Retome o mesmo resultado.':
        `1. Anexos: ${qualityState.reviewed.tab1?'conferido':'pendente'} • 2. Geral: ${qualityState.reviewed.tab2?'conferido':'pendente'} • 3. Inspeção: ${qualityState.finalSaved&&qualityState.finalReviewed?'salva':'pendente'}`;
}
async function qualityRun(callback){
    if(qualityBusy)return;
    qualityBusy=true;qualityEl('main-workspace').classList.add('pointer-events-none');qualityButtons();
    try{return await callback();}catch(error){
        console.error(error);qualityNotify(error.message || 'Não foi possível salvar. Tente novamente.');
        if(qualityState)try{
            const ctx=await QualityFlow.load(supabaseClient,qualityState.id);
            qualityState.pending=[...ctx.events].reverse().map(e=>QualityFlow.parse(e)).find(d=>d?.kind==='quality_result'&&d.cycle===qualityState.cycle&&d.state==='pending');
        }catch(readError){console.error(readError);}
    }
    finally{qualityBusy=false;qualityEl('main-workspace').classList.remove('pointer-events-none');qualityButtons();}
}
async function selectOS(id){
    if(qualityBusy)return;
    const order=queueData.find(o=>QualityFlow.id(o)===id);if(!order)return;
    const token=++qualityLoadToken;selectedOS=order;qualityState=null;
    document.querySelectorAll('#os-list > div').forEach(c=>c.classList.remove('os-card-selected'));
    qualityEl(`os-card-${id}`)?.classList.add('os-card-selected');
    qualityEl('welcome-screen').classList.add('hidden');qualityEl('main-workspace').classList.remove('hidden');
    qualityEl('footer-actions').classList.remove('hidden');qualityEl('footer-actions').classList.add('flex');
    qualityEl('display-os').innerText=order.business_id;qualityEl('display-desc').innerText=`${order.client} | ${order.model}`;
    qualityEl('serial-number').innerText=order.serial_number || 'N/A';qualityEl('display-urgency').innerText=order.urgency || 'Normal';
    qualityEl('quality-destination').textContent=order.destino || 'RETIRADA BALCÃO';
    qualityEl('tab4').classList.remove('opacity-40','pointer-events-none','grayscale');
    document.querySelectorAll('.tab-content').forEach(e=>e.classList.add('hidden'));qualityEl('tab1').classList.remove('hidden');
    document.querySelectorAll('.tab-button').forEach(e=>e.classList.toggle('tab-active',e.id==='quality-tab-tab1'));
    qualityEl('tab1').textContent='Carregando auditoria...';qualityEl('tab2').innerHTML='';qualityEl('quality-grid').innerHTML='';qualityButtons();
    try{
        const ctx=await QualityFlow.load(supabaseClient,id);if(token!==qualityLoadToken)return;
        QualityFlow.assertCurrent(ctx,QualityFlow.cycle(order));
        qualityState={id,cycle:ctx.cycle,context:ctx,reviewed:{tab1:false,tab2:false},auditSaved:QualityFlow.auditValid(ctx),finalSaved:QualityFlow.finalValid(ctx),finalReviewed:false};
        qualityState.pending=[...ctx.events].reverse().map(e=>QualityFlow.parse(e)).find(d=>d?.kind==='quality_result'&&d.cycle===ctx.cycle&&d.state==='pending');
        isAuditSaved=qualityState.auditSaved;
        renderAuditTabs(isAuditSaved?ctx.audit:[]);renderQualityGrid(qualityState.finalSaved?ctx.checks:[]);
        let panel=qualityEl('rework-quality');if(!panel){panel=document.createElement('div');panel.id='rework-quality';qualityEl('quality-grid').before(panel);}
        panel.innerHTML=renderQualityRework();
        switchTab(qualityEl('quality-tab-tab1'),'tab1');
    }catch(error){qualityNotify(error.message);qualityEl('main-workspace').classList.add('hidden');qualityEl('footer-actions').classList.add('hidden');}
    qualityButtons();
}
function renderAuditTabs(saved=[]){
    for(const tab of ['tab1','tab2']){
        qualityEl(tab).innerHTML=AUDIT_ITEMS[tab].map(item=>{
            const row=saved.find(r=>ProductionFlow.normalize(r.item_name)===ProductionFlow.normalize(item));
            return `<div class="grid grid-cols-12 gap-3 items-center border-b border-slate-100 p-2"><span class="col-span-5 text-xs font-bold">${qualityEscape(item)}</span>
                <select data-item="${qualityEscape(item)}" data-audit-tab="${tab}" aria-label="Auditoria ${qualityEscape(item)}" class="select-audit-final col-span-3 border rounded p-2 text-xs" onchange="qualityAuditChanged(this)">
                ${['NÃO INFORMADO','PEÇA OK','RECONDICIONAR','TROCAR'].map(status=>`<option ${row?.status===status?'selected':''}>${status}</option>`).join('')}</select>
                <input data-audit-observation="${qualityEscape(item)}" value="${qualityEscape(row?.observation || '')}" aria-label="Observação ${qualityEscape(item)}" class="col-span-4 bg-slate-50 border rounded p-2 text-xs" placeholder="Observação" oninput="qualityAuditChanged(this.previousElementSibling)"></div>`;
        }).join('')+`<label class="flex items-center gap-3 mt-5 p-4 bg-blue-50 rounded-xl text-sm font-bold"><input id="review-${tab}" type="checkbox" onchange="qualityReviewAudit('${tab}',this.checked)">Conferi todos os itens da ${tab==='tab1'?'auditoria de anexos':'auditoria geral'}, incluindo os não informados.</label>`+
        (tab==='tab1'?'<button type="button" class="mt-3 bg-blue-600 text-white rounded-lg px-5 py-3 text-xs font-bold" onclick="switchTab(qualityEl(\'quality-tab-tab2\'),\'tab2\')">Continuar para 2. Auditoria Geral</button>':'');
    }
}
function renderQualityGrid(saved=[]){
    qualityEl('quality-grid').innerHTML=QUALITY_CHECKS.map(item=>{
        const row=saved.find(r=>r.check_item===item),value=row?String(row.is_ok):'';
        return `<label class="p-4 border rounded-xl bg-white text-xs font-bold">${qualityEscape(item)}<select data-check="${qualityEscape(item)}" class="check-qualidade block w-full mt-3 border rounded-lg p-2" onchange="qualityFinalChanged()" aria-label="${qualityEscape(item)}">
            <option value="" ${value===''?'selected':''}>Pendente — selecione</option><option value="true" ${value==='true'?'selected':''}>Conforme</option><option value="false" ${value==='false'?'selected':''}>Não conforme</option></select></label>`;
    }).join('');
    qualityEl('review-final').checked=false;
}
function qualityReadAudit(){return [...document.querySelectorAll('.select-audit-final')].map(el=>({item_name:el.dataset.item,status:el.value,observation:el.nextElementSibling.value.trim()}));}
function qualityReadChecks(){return [...document.querySelectorAll('.check-qualidade')].map(el=>({check_item:el.dataset.check,is_ok:el.value===''?null:el.value==='true'}));}
function qualityAuditChanged(el){
    if(!qualityState)return;
    qualityState.auditSaved=false;isAuditSaved=false;qualityState.finalSaved=false;
    qualityState.reviewed[el.dataset.auditTab]=false;qualityEl('review-'+el.dataset.auditTab).checked=false;qualityButtons();
}
function qualityReviewAudit(tab,checked){if(!qualityState)return;qualityState.reviewed[tab]=checked;qualityButtons();}
function qualityFinalChanged(){if(!qualityState)return;qualityState.finalSaved=false;qualityState.finalReviewed=false;qualityEl('review-final').checked=false;qualityButtons();}
function qualityInspectionReviewed(checked){if(!qualityState)return;qualityState.finalReviewed=checked;qualityButtons();}
function validateQualityClearance(){qualityButtons();}
function switchTab(btn,tab){
    if(tab==='tab4'&&(!qualityState?.auditSaved||!qualityReviewed())){qualityNotify('Confira e salve as auditorias de anexos e geral antes da inspeção final.');return;}
    document.querySelectorAll('.tab-button').forEach(el=>{el.classList.toggle('tab-active',el===btn);el.setAttribute('aria-selected',el===btn?'true':'false');});
    document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('hidden',el.id!==tab));
    qualityEl('audit-actions').classList.toggle('hidden',tab==='tab4');qualityButtons();
}
async function qualityAuthorize(items,callback){
    if(!items.length)return qualityRun(()=>callback({}));
    qualityEl('modal-supervisor-list').innerHTML=items.map(item=>`<p class="p-2 border rounded mb-2 text-xs">${qualityEscape(item)}</p>`).join('');
    qualityEl('input-supervisor-observation').value='';qualityEl('input-supervisor-password').value='';qualityEl('modal-supervisor').style.display='flex';
    qualityEl('btn-confirm-supervisor').onclick=async()=>{
        const note=qualityEl('input-supervisor-observation').value.trim(),password=qualityEl('input-supervisor-password').value;
        if(!note){qualityNotify('Informe o que foi feito para tratar a divergência.');return;}
        if(password!=='TURBOSUL2026'){qualityNotify('Senha do líder incorreta.');return;}
        closeSupervisorModal(true);await qualityRun(()=>callback({authorized:true,name:'Supervisor Qualidade',note}));
    };
}
async function saveAuditChecklist(){
    if(!qualityState||!qualityReviewed()||qualityBusy){qualityNotify('Confirme a revisão das duas auditorias.');return;}
    const state=qualityState,rows=qualityReadAudit();
    await qualityAuthorize(QualityFlow.divergences(rows,state.context.baseline),async leader=>{
        if(state!==qualityState)throw new Error('A O.S. selecionada mudou. Reabra a inspeção.');
        await QualityFlow.saveAudit(supabaseClient,state.id,state.cycle,rows,Object.values(AUDIT_ITEMS).flat(),state.reviewed,leader);
        if(state!==qualityState)return;
        state.context=await QualityFlow.load(supabaseClient,state.id);state.auditSaved=true;isAuditSaved=true;state.finalSaved=false;
        switchTab(qualityEl('quality-tab-tab4'),'tab4');qualityNotify('Auditorias salvas. Preencha todos os testes da inspeção final.');
    });
}
async function saveQualityChecklist(){
    if(!qualityState||!qualityReviewed()||!qualityState.auditSaved||!qualityState.finalReviewed||qualityBusy)return;
    const state=qualityState,checks=qualityReadChecks();
    if(checks.some(r=>typeof r.is_ok!=='boolean')){qualityNotify('Preencha todos os testes da inspeção final.');return;}
    await qualityAuthorize(checks.filter(r=>!r.is_ok).map(r=>r.check_item+' — Não conforme'),async leader=>{
        if(state!==qualityState)throw new Error('A O.S. selecionada mudou. Reabra a inspeção.');
        await QualityFlow.saveFinal(supabaseClient,state.id,state.cycle,checks,QUALITY_CHECKS,leader);
        if(state===qualityState){state.finalSaved=true;state.context=await QualityFlow.load(supabaseClient,state.id);qualityNotify('Inspeção final salva. Resultado pronto para registro.');}
    });
}
function handleApproveQuality(){
    if(!qualityCanApprove()){qualityNotify('Confira e salve as três etapas antes de aprovar.');return;}
    qualityEl('quality-modal').classList.remove('hidden');qualityEl('quality-modal-card').classList.remove('scale-95','opacity-0');
    qualityEl('quality-modal-confirm-btn').onclick=async()=>{closeQualityModal();await executeQualityApproval();};
}
async function executeQualityApproval(){
    const state=qualityState;
    if(!qualityCanApprove()||!await qualityReworkReady()||state!==qualityState)return;
    await qualityRun(async()=>{
        const result=await QualityFlow.decide(supabaseClient,state.id,state.cycle,'APPROVED',{reviewed:state.reviewed,checks:qualityReadChecks()});
        if(!result.alreadyCompleted){
            try{
                const session=await supabaseClient.auth.getSession();
                await fetch(API_ACTION,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({os_id:state.id,action:'QUALITY_APPROVED',inspector_id:session.data?.session?.user?.id || null,serial_number:qualityEl('serial-number').innerText,timestamp:new Date().toISOString()})});
            }catch(error){console.warn('Aprovação salva; notificação adicional indisponível.',error);}
        }
        qualityNotify('Turbina aprovada e enviada à Expedição.');location.reload();
    });
}
function openQualityRejection(){
    if(!qualityState||qualityBusy)return;
    const pending=qualityState.pending;
    qualityEl('quality-reject-reason').value=pending?.outcome==='REJECTED'?pending.reason:'';
    qualityEl('quality-reject-reason').disabled=!!pending;qualityEl('quality-reject-modal').classList.remove('hidden');
}
async function executeQualityRejection(){
    if(!qualityState||qualityBusy)return;
    const reason=qualityEl('quality-reject-reason').value.trim();if(!reason){qualityNotify('Informe o motivo da reprovação.');return;}
    const state=qualityState;
    if(!await qualityReworkReady()||state!==qualityState)return;
    await qualityRun(async()=>{
        await QualityFlow.decide(supabaseClient,state.id,state.cycle,'REJECTED',{reason,destination:'DESMONTAGEM',checks:qualityReadChecks(),audit:qualityReadAudit(),reviewed:state.reviewed});
        qualityEl('quality-reject-modal').classList.add('hidden');qualityNotify('Reprovação registrada. Turbo devolvido à Desmontagem.');location.reload();
    });
}
function closeQualityModal(){qualityEl('quality-modal').classList.add('hidden');}
function closeSupervisorModal(){qualityEl('modal-supervisor').style.display='none';qualityButtons();}
function updateTime(){qualityEl('current-time').innerText=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
async function loadQualityMetrics(force=false){
    if(!force&&Date.now()-qualityMetricsTime<30000)return;
    qualityMetricsTime=Date.now();
    try{
        const events=await QualityFlow.results(supabaseClient),summary=QualityFlow.metrics(events,qualityEl('quality-date-start').value,qualityEl('quality-date-end').value);
        qualityEl('quality-total').textContent=summary.total;qualityEl('quality-approved').textContent=summary.approved;qualityEl('quality-rejected').textContent=summary.rejected;
        qualityEl('quality-rate').textContent=summary.rate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
        const ids=[...new Set(summary.rows.filter(r=>r.outcome==='REJECTED').map(r=>r.service_order_id))];
        const orders=ids.length?await QualityFlow.checked(supabaseClient.from('service_orders').select('id,business_id').in('id',ids)):[];
        const names=new Map(orders.map(o=>[o.id,o.business_id]));
        qualityEl('quality-results-list').innerHTML=summary.rows.filter(r=>r.outcome==='REJECTED').sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,20).map(event=>
            `<p class="p-3 border-b text-xs"><strong>${qualityEscape(names.get(event.service_order_id)||'O.S.')}</strong> • ${qualityEscape(new Date(event.timestamp).toLocaleString('pt-BR'))} • ${qualityEscape(event.result?.inspector||'Inspetor')}<br>${qualityEscape(event.result?.reason || event.description)} • Destino: ${qualityEscape(event.result?.destination || 'Desmontagem')}</p>`).join('') || '<p class="text-xs text-slate-500 p-3">Nenhuma reprovação no período.</p>';
    }catch(error){qualityMetricsTime=0;qualityEl('quality-results-list').textContent='Não foi possível atualizar os indicadores. Tente novamente.';console.error(error);}
}
document.addEventListener('DOMContentLoaded',()=>loadQualityMetrics());
