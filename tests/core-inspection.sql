-- Exercita as funções reais com o papel autenticado e desfaz todos os dados ao terminar.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='BANCADA' limit 1),true);
set local role authenticated;
do $$
declare v_id uuid; v_first uuid; v_second uuid; v_result jsonb; v_before jsonb; v_after jsonb; v_note text := 'TESTE TRANSACIONAL: conjunto com aplicação incorreta';
begin
  select s.id into v_id from public.service_orders s join public.component_tracking t on t.service_order_id=s.id and t.component_name='CONJUNTO ROTATIVO'
    where t.verdict_vendas='TROCAR CONJUNTO' and s.status='Em Produção' order by s.business_id limit 1;
  if v_id is null then raise exception 'Fixture de O.S. FULL ativa ausente'; end if;
  select to_jsonb(t) into v_before from public.component_tracking t where service_order_id=v_id and component_name='REPAROS';
  -- Simula pedido de compra confirmado apenas dentro da transação de teste.
  update public.triage_parts set availability='PURCHASE_REQUEST',is_resolved=false,resolved_at=null where service_order_id=v_id and part_name in ('EIXO','ROTOR','CCE');
  v_result:=public.receive_new_core(v_id);v_first:=(v_result->>'receipt_id')::uuid;
  if v_first is null or (select count(*) from public.component_tracking where service_order_id=v_id and component_name in ('EIXO','ROTOR','CCE','CONJUNTO ROTATIVO') and current_stage='BANCADA')<>4 then raise exception 'Falha: baixa não encaminhou FULL à Bancada'; end if;
  if not (public.receive_new_core(v_id)->>'alreadyReceived')::boolean then raise exception 'Falha: repetição da baixa'; end if;
  begin
    update public.component_tracking set current_stage='MONTAGEM' where service_order_id=v_id and component_name='CCE';
    raise exception 'FALHOU: guard permitiu atalho';
  exception when others then if sqlerrm not like 'Conjunto novo exige conferência%' then raise;end if;end;
  begin
    perform public.inspect_new_core(v_id,v_first,false,'  ');raise exception 'FALHOU: aceitou motivo vazio';
  exception when others then if sqlerrm not like 'Descreva o resultado%' then raise;end if;end;
  begin
    perform public.inspect_new_core(v_id,gen_random_uuid(),true,'correto');raise exception 'FALHOU: aceitou chegada inválida';
  exception when others then if sqlerrm not like 'O recebimento mudou%' then raise;end if;end;
  -- Reprovação abre reposição e mantém a evidência original de recebimento no histórico.
  v_result:=public.inspect_new_core(v_id,v_first,false,v_note);
  if v_result->>'stage'<>'TRIAGEM' or (select count(*) from public.triage_parts where service_order_id=v_id and part_name in ('EIXO','ROTOR','CCE') and availability='PENDING' and is_resolved=false)<>3 then raise exception 'Falha: reposição não aberta';end if;
  if not (public.inspect_new_core(v_id,v_first,false,v_note)->>'alreadyReviewed')::boolean then raise exception 'Falha: reprovação repetida';end if;
  begin
    perform public.inspect_new_core(v_id,v_first,true,'correto');raise exception 'FALHOU: alterou decisão finalizada';
  exception when others then if sqlerrm not like 'Esta chegada já foi conferida%' then raise;end if;end;
  begin
    perform public.receive_new_core(v_id);raise exception 'FALHOU: recebeu pedido sem confirmar tipo';
  exception when others then if sqlerrm not like 'Confirme um único tipo%' then raise;end if;end;
  update public.triage_parts set availability='STOCK_REQUEST',is_resolved=false where service_order_id=v_id and part_name in ('EIXO','ROTOR','CCE');
  v_result:=public.receive_new_core(v_id);v_second:=(v_result->>'receipt_id')::uuid;
  if v_first=v_second then raise exception 'Falha: chegada nova reutilizou aprovação';end if;
  begin
    perform public.inspect_new_core(v_id,v_first,true,'correto');raise exception 'FALHOU: aprovação antiga liberou reposição';
  exception when others then if sqlerrm not like 'O recebimento mudou%' then raise;end if;end;
  perform public.inspect_new_core(v_id,v_second,true,'TESTE: aplicação e condições corretas');
  if (select count(*) from public.component_tracking where service_order_id=v_id and component_name in ('EIXO','ROTOR','CCE','CONJUNTO ROTATIVO') and current_stage='MONTAGEM')<>4 then raise exception 'Falha: aprovação não liberou montagem';end if;
  if not exists(select 1 from public.component_tracking t cross join lateral jsonb_array_elements(t.tracking_data) e where t.service_order_id=v_id and t.component_name='CONJUNTO ROTATIVO' and e->>'result'='REPROVADO' and e->>'note'=v_note) then raise exception 'Falha: perdeu não conformidade antiga';end if;
  if (select count(*) from public.history_events where service_order_id=v_id and (details like '%'||v_first::text||'%' or details like '%'||v_second::text||'%') and action='NÃO CONFORMIDADE DO CONJUNTO NOVO')<>1 then raise exception 'Falha: duplicou não conformidade';end if;
  begin
    update public.component_tracking set tracking_data='[]' where service_order_id=v_id and component_name='CONJUNTO ROTATIVO';
    raise exception 'FALHOU: apagou evidência da peça';
  exception when others then if sqlerrm not like 'O histórico de conferência mudou%' then raise;end if;end;
  select to_jsonb(t) into v_after from public.component_tracking t where service_order_id=v_id and component_name='REPAROS';
  if v_before is distinct from v_after then raise exception 'Falha: alterou Reparos';end if;
end;
$$;
reset role;
select 'OK: compra/estoque → Bancada, bloqueio de atalho, motivo obrigatório, chegada inválida, reprovação e reposição, repetição, nova conferência, aprovação e evidência permanente; Reparos preservado' as result;
rollback;
