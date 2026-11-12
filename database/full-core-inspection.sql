-- Recebimento e análise do FULL são transações; cada chegada tem sua própria identidade.
create or replace function public.receive_new_core(p_order uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_status text; v_rows jsonb; v_type text; v_receipt uuid := gen_random_uuid();
  v_log jsonb; v_count integer; v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Entre no sistema para dar baixa.'; end if;
  select status into v_status from public.service_orders where id=p_order for update;
  if not found or upper(v_status) in ('FINALIZADO','FINALIZADA','CONCLUIDO','CONCLUÍDO','CONCLUIDA','CONCLUÍDA','ENTREGUE','CANCELADO','CANCELADA','ARQUIVADO','ARQUIVADA') then
    raise exception 'Esta O.S. está encerrada ou não existe.';
  end if;
  if not exists(select 1 from public.checklist_analysis_general where service_order_id=p_order and item_name in ('EIXO','EIXO ROTOR','ROTOR','ROTOR COMPRESSOR','CCE','CARCAÇA CENTRAL') and decisao_vendas='TROCAR CONJUNTO')
    and not exists(select 1 from public.component_tracking where service_order_id=p_order and component_name='CONJUNTO ROTATIVO' and verdict_vendas='TROCAR CONJUNTO') then
    raise exception 'Esta O.S. não possui conjunto FULL novo.';
  end if;
  perform 1 from public.triage_parts where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE') order by id for update;
  select count(*),jsonb_agg(to_jsonb(t) order by part_name),min(availability) into v_count,v_rows,v_type
    from public.triage_parts t where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE');
  if v_count<>3 then raise exception 'Confirme o pedido completo antes de dar baixa.'; end if;
  if not exists(select 1 from public.triage_parts where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE') and (is_resolved is distinct from true or availability<>'STOCK')) then
    return jsonb_build_object('alreadyReceived',true);
  end if;
  if v_type not in ('PURCHASE_REQUEST','STOCK_REQUEST') or exists(select 1 from public.triage_parts where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE') and (availability<>v_type or is_resolved is distinct from false)) then
    raise exception 'Confirme um único tipo de pedido antes de dar baixa.';
  end if;
  v_log := jsonb_build_object('action','RECEBIMENTO_CONJUNTO_NOVO','receipt_id',v_receipt,'timestamp',v_now,'result','PENDENTE','sector','BANCADA','user_id',auth.uid(),'request_type',v_type);
  insert into public.component_tracking(service_order_id,component_name,current_stage,current_sector,status,status_description,verdict_vendas,tracking_data,last_update)
    select p_order,n,'BANCADA','BANCADA','AGUARDANDO CONFERÊNCIA','Conjunto novo recebido; conferir na Bancada antes da Montagem.','TROCAR CONJUNTO',jsonb_build_array(v_log),v_now
    from unnest(array['EIXO','ROTOR','CCE','CONJUNTO ROTATIVO']) n
    on conflict(service_order_id,component_name) do update set current_stage='BANCADA',current_sector='BANCADA',status=excluded.status,
      status_description=excluded.status_description,verdict_vendas=excluded.verdict_vendas,
      tracking_data=coalesce(public.component_tracking.tracking_data,'[]'::jsonb)||excluded.tracking_data,last_update=v_now;
  update public.triage_parts set availability='STOCK',is_resolved=true,resolved_at=v_now where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE');
  update public.checklist_analysis_general set availability='STOCK',is_resolved=true where service_order_id=p_order and item_name in ('EIXO','EIXO ROTOR','ROTOR','ROTOR COMPRESSOR','CCE','CARCAÇA CENTRAL');
  insert into public.history_events(service_order_id,user_id,action,description,details,timestamp)
    values(p_order,auth.uid(),'CONJUNTO NOVO RECEBIDO PARA CONFERÊNCIA','Conjunto FULL recebido e encaminhado à Bancada. A Montagem aguarda aprovação da conferência.',
      (v_log||jsonb_build_object('kind','new_core_receipt','previous_requests',v_rows))::text,v_now);
  return jsonb_build_object('receipt_id',v_receipt,'stage','BANCADA');
end;
$$;

create or replace function public.inspect_new_core(p_order uuid,p_receipt uuid,p_approved boolean,p_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order text; v_core public.component_tracking%rowtype; v_receipt jsonb; v_review jsonb;
  v_result text := case when p_approved then 'APROVADO' else 'REPROVADO' end;
  v_target text := case when p_approved then 'MONTAGEM' else 'TRIAGEM' end;
  v_log jsonb; v_now timestamptz := now(); v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para conferir.'; end if;
  if p_approved is null or length(trim(coalesce(p_note,'')))=0 then raise exception 'Descreva o resultado da conferência; na reprovação, informe a não conformidade.'; end if;
  select status into v_order from public.service_orders where id=p_order for update;
  if not found or upper(v_order) in ('FINALIZADO','FINALIZADA','CONCLUIDO','CONCLUÍDO','CONCLUIDA','CONCLUÍDA','ENTREGUE','CANCELADO','CANCELADA','ARQUIVADO','ARQUIVADA') then raise exception 'Esta O.S. está encerrada ou não existe.'; end if;
  select * into v_core from public.component_tracking where service_order_id=p_order and component_name='CONJUNTO ROTATIVO' for update;
  select e into v_receipt from jsonb_array_elements(coalesce(v_core.tracking_data,'[]')) with ordinality x(e,n)
    where e->>'action'='RECEBIMENTO_CONJUNTO_NOVO' order by n desc limit 1;
  if v_receipt is null or v_receipt->>'receipt_id' is distinct from p_receipt::text then raise exception 'O recebimento mudou. Atualize a Bancada antes de conferir.'; end if;
  select e into v_review from jsonb_array_elements(coalesce(v_core.tracking_data,'[]')) with ordinality x(e,n)
    where e->>'action'='CONFERENCIA_CONJUNTO_NOVO' and e->>'receipt_id'=p_receipt::text order by n desc limit 1;
  if v_review is not null then
    if v_review->>'result'=v_result then return jsonb_build_object('alreadyReviewed',true,'result',v_result); end if;
    raise exception 'Esta chegada já foi conferida. Atualize a fila.';
  end if;
  if v_core.current_stage<>'BANCADA' or (select count(*) from public.component_tracking where service_order_id=p_order and component_name in ('EIXO','ROTOR','CCE') and current_stage='BANCADA')<>3 then
    raise exception 'O conjunto completo deve estar na Bancada.';
  end if;
  if (select count(*) from public.triage_parts where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE') and availability='STOCK' and is_resolved=true)<>3 then raise exception 'Aguarde a baixa física do conjunto completo.'; end if;
  if exists(select 1 from public.component_tracking where service_order_id=p_order and component_name in ('EIXO','ROTOR','CCE','CONJUNTO ROTATIVO') and rework_start_time is not null) then raise exception 'Finalize o retrabalho do conjunto antes da conferência.'; end if;
  v_log:=jsonb_build_object('action','CONFERENCIA_CONJUNTO_NOVO','receipt_id',p_receipt,'result',v_result,'note',trim(p_note),'timestamp',v_now,'sector','BANCADA','user_id',auth.uid());
  select jsonb_agg(to_jsonb(t)) into v_rows from public.triage_parts t where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE');
  update public.component_tracking set current_stage=v_target,current_sector=v_target,
    status=case when p_approved then 'CONJUNTO NOVO APROVADO' else 'NÃO CONFORME - AGUARDANDO REPOSIÇÃO' end,
    status_description=case when p_approved then 'Conferência aprovada na Bancada.' else 'Não conformidade: '||trim(p_note)||'. Reposição pendente na Triagem.' end,
    tracking_data=coalesce(tracking_data,'[]'::jsonb)||jsonb_build_array(v_log),last_update=v_now
    where service_order_id=p_order and component_name in ('EIXO','ROTOR','CCE','CONJUNTO ROTATIVO');
  if not p_approved then
    update public.triage_parts set availability='PENDING',is_resolved=false,resolved_at=null where service_order_id=p_order and part_name in ('EIXO','ROTOR','CCE');
    update public.checklist_analysis_general set availability='PENDING',is_resolved=false where service_order_id=p_order and item_name in ('EIXO','EIXO ROTOR','ROTOR','ROTOR COMPRESSOR','CCE','CARCAÇA CENTRAL');
  end if;
  insert into public.history_events(service_order_id,user_id,action,description,details,timestamp)
    values(p_order,auth.uid(),case when p_approved then 'CONFERÊNCIA DO CONJUNTO NOVO APROVADA' else 'NÃO CONFORMIDADE DO CONJUNTO NOVO' end,
      'Conjunto FULL: '||v_result||'. '||trim(p_note)||case when p_approved then ' Liberado para Montagem.' else ' Nova solicitação de reposição aberta na Triagem; definir compra ou estoque.' end,
      (v_log||jsonb_build_object('kind','new_core_inspection','previous_requests',v_rows,'replacement_requested',not p_approved))::text,v_now);
  return jsonb_build_object('result',v_result,'stage',v_target);
end;
$$;

revoke all on function public.receive_new_core(uuid) from public,anon;
revoke all on function public.inspect_new_core(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.receive_new_core(uuid) to authenticated;
grant execute on function public.inspect_new_core(uuid,uuid,boolean,text) to authenticated;

-- Impede atalhos de movimentação e telas antigas de ignorarem a conferência registrada.
create or replace function public.guard_new_core_inspection()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_receipt jsonb; v_result text;
begin
  if tg_op='UPDATE' and old.component_name in ('EIXO','ROTOR','CCE','CONJUNTO ROTATIVO') then
    if exists(select 1 from jsonb_array_elements(coalesce(old.tracking_data,'[]')) e
      where e->>'action' in ('RECEBIMENTO_CONJUNTO_NOVO','CONFERENCIA_CONJUNTO_NOVO')
      and not coalesce(new.tracking_data,'[]'::jsonb) @> jsonb_build_array(e)) then
      raise exception 'O histórico de conferência mudou. Atualize a peça; os registros de não conformidade devem ser preservados.';
    end if;
  end if;
  if new.component_name not in ('EIXO','ROTOR','CCE','CONJUNTO ROTATIVO') or new.verdict_vendas is distinct from 'TROCAR CONJUNTO' then return new; end if;
  select e into v_receipt from jsonb_array_elements(coalesce(new.tracking_data,'[]')) with ordinality x(e,n)
    where e->>'action'='RECEBIMENTO_CONJUNTO_NOVO' order by n desc limit 1;
  if v_receipt is null then return new; end if;
  select e->>'result' into v_result from jsonb_array_elements(coalesce(new.tracking_data,'[]')) with ordinality x(e,n)
    where e->>'action'='CONFERENCIA_CONJUNTO_NOVO' and e->>'receipt_id'=v_receipt->>'receipt_id' order by n desc limit 1;
  if v_result is distinct from 'APROVADO' and new.current_stage not in ('BANCADA','TRIAGEM','COMPRA','ESTOQUE') then
    raise exception 'Conjunto novo exige conferência aprovada na Bancada antes da Montagem ou de outro setor.';
  end if;
  if v_result is null and new.current_stage<>'BANCADA' then raise exception 'Conclua a conferência do conjunto na Bancada antes de movimentar.'; end if;
  return new;
end;
$$;
revoke all on function public.guard_new_core_inspection() from public,anon,authenticated;
create trigger guard_new_core_inspection before insert or update on public.component_tracking
  for each row execute function public.guard_new_core_inspection();
