-- Correções da revisão de segurança/corretude de 2026-11-14.
-- Não altera migrations anteriores; tudo aqui é aplicado por cima delas.
-- Cada item tem caso correspondente em scripts/rls-test.mjs.

-- ========== 1. clinic_members: ninguém promove a si mesmo ==========
-- A policy members_self_update deixava o membro mudar role, status e clinic_id da
-- própria linha. Em vez dela, uma RPC altera só nome, CRO e tema.

drop policy if exists members_self_update on clinic_members;

create or replace function update_my_profile(p_professional_name text, p_cro text, p_theme text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if length(coalesce(p_professional_name, '')) > 120 or length(coalesce(p_cro, '')) > 40 then
    raise exception 'nome ou CRO longo demais';
  end if;
  update clinic_members
     set professional_name = p_professional_name, cro = p_cro, theme = coalesce(p_theme, theme)
   where user_id = auth.uid() and status = 'active';
end $$;
revoke execute on function update_my_profile(text, text, text) from public, anon;
grant execute on function update_my_profile(text, text, text) to authenticated;

-- A policy members_owner_write continua valendo para o dono. Reforço: nem o dono
-- consegue mover uma linha de equipe para outra clínica nem trocar a quem ela pertence.
create or replace function clinic_members_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.clinic_id <> old.clinic_id then
    raise exception 'não é possível mudar a clínica de um membro';
  end if;
  return new;
end $$;
drop trigger if exists clinic_members_guard on clinic_members;
create trigger clinic_members_guard before update on clinic_members for each row execute function clinic_members_guard();

-- ========== 2. claim_invites ==========
-- Só aceita convite com e-mail confirmado (senão qualquer um se cadastraria com o
-- e-mail de outra pessoa) e não falha quando o usuário já é membro da clínica.

create or replace function claim_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; v_email text; v_confirmed timestamptz; r record;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = auth.uid();
  if v_email is null or v_confirmed is null then return 0; end if;
  for r in select id, clinic_id from clinic_members
            where status = 'invited' and user_id is null and lower(invited_email) = lower(v_email) loop
    if exists (select 1 from clinic_members m where m.clinic_id = r.clinic_id and m.user_id = auth.uid()) then
      delete from clinic_members where id = r.id; -- convite redundante
    else
      update clinic_members set user_id = auth.uid(), status = 'active' where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ========== 5. Modo "consultório dividido" ==========

-- Regra de visibilidade do paciente (a mesma de patients_read), reaproveitada nos filhos.
create or replace function patient_visible(c uuid, d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member(c) and (
    (select practice_mode from clinics where id = c) = 'shared'
    or not has_role(c, array['dentist'])
    or d = auth.uid() or d is null
  )
$$;

-- Roda como o usuário: a RLS de patients vale dentro do exists. Também garante que o
-- paciente pertence à clínica informada (bloqueia referência entre clínicas).
create or replace function can_see_patient(c uuid, p uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from patients where id = p and clinic_id = c)
$$;

drop policy if exists patients_read on patients;
create policy patients_read on patients for select using (patient_visible(clinic_id, dentist_id));
drop policy if exists patients_update on patients;
create policy patients_update on patients for update
  using (can_write(clinic_id) and patient_visible(clinic_id, dentist_id)) with check (can_write(clinic_id));
drop policy if exists patients_delete on patients;
create policy patients_delete on patients for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']));

-- Responsável: dentista sempre grava a si mesmo; dono também (se não informar outro).
-- Depois de criado, só o dono muda o responsável. A clínica do paciente nunca muda.
create or replace function patients_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role (manutenção)
  if tg_op = 'INSERT' then
    if has_role(new.clinic_id, array['dentist']) then new.dentist_id := auth.uid();
    elsif new.dentist_id is null and has_role(new.clinic_id, array['owner']) then new.dentist_id := auth.uid();
    end if;
  else
    if new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica do paciente'; end if;
    if new.dentist_id is distinct from old.dentist_id and not has_role(old.clinic_id, array['owner']) then
      raise exception 'só o dono muda o dentista responsável';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists patients_guard on patients;
create trigger patients_guard before insert or update on patients for each row execute function patients_guard();

-- Tabelas filhas com patient_id: troca as policies genéricas por versões que
-- exigem can_see_patient (visibilidade do modo dividido + paciente da mesma clínica).
do $$
declare t text; expr text;
begin
  foreach t in array array['patient_events','treatment_plans','budgets','installments','treatments','appointments','waitlist_entries','recall_states']
  loop
    expr := case when t = 'appointments' then '(patient_id is null or can_see_patient(clinic_id, patient_id))'
                 else 'can_see_patient(clinic_id, patient_id)' end;
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for select using (is_member(clinic_id) and %s)', t || '_read', t, expr);
    execute format('create policy %I on %I for insert with check (can_write(clinic_id) and %s)', t || '_insert', t, expr);
    -- patient_events é um registro histórico: sem update nem delete.
    if t <> 'patient_events' then
      execute format('create policy %I on %I for update using (can_write(clinic_id) and %s) with check (can_write(clinic_id) and %s)', t || '_update', t, expr, expr);
      -- Dinheiro e orçamento: só o dono apaga.
      if t in ('budgets','installments','treatments') then
        execute format('create policy %I on %I for delete using (can_write(clinic_id) and has_role(clinic_id, array[''owner'']) and %s)', t || '_delete', t, expr);
      else
        execute format('create policy %I on %I for delete using (can_write(clinic_id) and %s)', t || '_delete', t, expr);
      end if;
    end if;
  end loop;
end $$;

-- ========== 7a. Escrita por papel ==========

-- Parcelas: marcar pago/desmarcar é do dono, financeiro e recepção (dentista só lê).
-- Criar parcelas continua possível a quem aprova orçamento (RPC authorize_budget).
drop policy if exists installments_update on installments;
create policy installments_update on installments for update
  using (can_write(clinic_id) and has_role(clinic_id, array['owner','finance','receptionist']) and can_see_patient(clinic_id, patient_id))
  with check (can_write(clinic_id) and has_role(clinic_id, array['owner','finance','receptionist']) and can_see_patient(clinic_id, patient_id));

-- Atendimentos: dentista registra e conclui, mas valor e situação de pagamento
-- só mudam por dono, financeiro e recepção.
create or replace function treatments_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.clinic_id <> old.clinic_id or new.patient_id <> old.patient_id then
    raise exception 'não é possível mudar a clínica ou o paciente do atendimento';
  end if;
  if (new.price_cents is distinct from old.price_cents or new.payment_status is distinct from old.payment_status)
     and not has_role(old.clinic_id, array['owner','finance','receptionist']) then
    raise exception 'só dono, financeiro ou recepção alteram valor e pagamento';
  end if;
  return new;
end $$;
drop trigger if exists treatments_guard on treatments;
create trigger treatments_guard before update on treatments for each row execute function treatments_guard();

-- ========== 7b. Referências entre clínicas ==========
-- Policies já exigem paciente da mesma clínica; aqui, plano/orçamento/item.

drop policy if exists plan_items_read on plan_items;
drop policy if exists plan_items_insert on plan_items;
drop policy if exists plan_items_update on plan_items;
drop policy if exists plan_items_delete on plan_items;
create policy plan_items_read on plan_items for select using (
  is_member(clinic_id) and exists (select 1 from treatment_plans tp where tp.id = plan_items.plan_id and tp.clinic_id = plan_items.clinic_id));
create policy plan_items_insert on plan_items for insert with check (
  can_write(clinic_id) and exists (select 1 from treatment_plans tp where tp.id = plan_items.plan_id and tp.clinic_id = plan_items.clinic_id));
create policy plan_items_update on plan_items for update
  using (can_write(clinic_id) and exists (select 1 from treatment_plans tp where tp.id = plan_items.plan_id and tp.clinic_id = plan_items.clinic_id))
  with check (can_write(clinic_id) and exists (select 1 from treatment_plans tp where tp.id = plan_items.plan_id and tp.clinic_id = plan_items.clinic_id));
create policy plan_items_delete on plan_items for delete using (
  can_write(clinic_id) and exists (select 1 from treatment_plans tp where tp.id = plan_items.plan_id and tp.clinic_id = plan_items.clinic_id));

-- plan_id/budget_id/plan_item_id precisam ser da mesma clínica (e mesmo paciente).
create or replace function enforce_same_clinic_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare r_clinic uuid; r_patient uuid;
begin
  if tg_table_name = 'budgets' then
    select clinic_id, patient_id into r_clinic, r_patient from treatment_plans where id = new.plan_id;
    if r_clinic is distinct from new.clinic_id or r_patient is distinct from new.patient_id then raise exception 'plano de outra clínica ou paciente'; end if;
  elsif tg_table_name = 'installments' then
    select clinic_id, patient_id into r_clinic, r_patient from budgets where id = new.budget_id;
    if r_clinic is distinct from new.clinic_id or r_patient is distinct from new.patient_id then raise exception 'orçamento de outra clínica ou paciente'; end if;
  elsif tg_table_name = 'treatments' then
    if new.budget_id is not null then
      select clinic_id, patient_id into r_clinic, r_patient from budgets where id = new.budget_id;
      if r_clinic is distinct from new.clinic_id or r_patient is distinct from new.patient_id then raise exception 'orçamento de outra clínica ou paciente'; end if;
    end if;
    if new.plan_item_id is not null then
      select clinic_id into r_clinic from plan_items where id = new.plan_item_id;
      if r_clinic is distinct from new.clinic_id then raise exception 'item de plano de outra clínica'; end if;
    end if;
  elsif tg_table_name = 'plan_items' then
    select clinic_id into r_clinic from treatment_plans where id = new.plan_id;
    if r_clinic is distinct from new.clinic_id then raise exception 'plano de outra clínica'; end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['budgets','installments','treatments','plan_items'] loop
    execute format('drop trigger if exists %I on %I', t || '_refs', t);
    execute format('create trigger %I before insert or update on %I for each row execute function enforce_same_clinic_refs()', t || '_refs', t);
  end loop;
end $$;

-- Orçamento: sem RPC, só o essencial pode mudar. Status só muda dentro de
-- authorize_budget/decline_budget (que ligam a variável de transação) e só a partir de 'presented'.
create or replace function budgets_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.clinic_id <> old.clinic_id or new.plan_id <> old.plan_id or new.patient_id <> old.patient_id
     or new.subtotal_cents <> old.subtotal_cents or new.discount_cents <> old.discount_cents or new.total_cents <> old.total_cents then
    raise exception 'orçamento não pode ser alterado';
  end if;
  if new.status is distinct from old.status then
    if coalesce(current_setting('app.budget_rpc', true), '') <> '1' then raise exception 'use as funções de aprovar ou recusar orçamento'; end if;
    if old.status <> 'presented' then raise exception 'orçamento já respondido'; end if;
  end if;
  return new;
end $$;
drop trigger if exists budgets_guard on budgets;
create trigger budgets_guard before update on budgets for each row execute function budgets_guard();

-- Recusar orçamento: só enquanto 'presented'.
create or replace function decline_budget(p_budget uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare b budgets;
begin
  select * into b from budgets where id = p_budget for update;
  if not found then raise exception 'orçamento não encontrado'; end if;
  if not can_write(b.clinic_id) then raise exception 'sem permissão ou acesso vencido'; end if;
  if b.status <> 'presented' then raise exception 'orçamento já respondido'; end if;
  perform set_config('app.budget_rpc', '1', true);
  update budgets set status = 'declined' where id = p_budget;
end $$;
revoke execute on function decline_budget(uuid) from public, anon;
grant execute on function decline_budget(uuid) to authenticated;

-- create_budget: confere que o paciente é da clínica e guarda o desconto já limitado ao subtotal.
create or replace function create_budget(p_clinic uuid, p_patient uuid, p_kind text, p_validity integer,
  p_discount integer, p_methods text[], p_notes text, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_plan uuid; b uuid; subtotal integer; disc integer; it jsonb; pos integer := 0;
begin
  if not can_write(p_clinic) then raise exception 'sem permissão ou acesso vencido'; end if;
  if not can_see_patient(p_clinic, p_patient) then raise exception 'paciente não encontrado nesta clínica'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'orçamento sem itens'; end if;
  insert into treatment_plans (clinic_id, patient_id, dentist_id, kind, validity_days, discount_cents, payment_methods, notes, status)
    values (p_clinic, p_patient, auth.uid(), p_kind, p_validity, greatest(coalesce(p_discount, 0), 0), coalesce(p_methods, '{}'), p_notes, 'budgeted')
    returning id into v_plan;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into plan_items (clinic_id, plan_id, position, tooth_fdi, region, conditions, procedure_id, procedure_name, phase, price_cents, quantity)
    values (p_clinic, v_plan, pos, (it->>'tooth')::smallint, it->>'region',
      coalesce(array(select jsonb_array_elements_text(it->'conditions')), '{}'),
      it->>'procedure_id', it->>'procedure_name', it->>'phase', (it->>'price_cents')::integer, coalesce((it->>'quantity')::smallint, 1));
    pos := pos + 1;
  end loop;
  select coalesce(sum(coalesce(price_cents, 0) * quantity), 0) into subtotal from plan_items where plan_items.plan_id = v_plan;
  disc := least(greatest(coalesce(p_discount, 0), 0), subtotal);
  update treatment_plans set discount_cents = disc where id = v_plan;
  insert into budgets (clinic_id, plan_id, patient_id, subtotal_cents, discount_cents, total_cents)
    values (p_clinic, v_plan, p_patient, subtotal, disc, subtotal - disc)
    returning id into b;
  insert into patient_events (clinic_id, patient_id, kind, label) values
    (p_clinic, p_patient, 'plan_created', 'Plano de tratamento montado'),
    (p_clinic, p_patient, 'budget_presented', 'Orçamento apresentado');
  return b;
end $$;

-- authorize_budget: p_installments nulo vira 1; guarda só os itens realmente do plano.
create or replace function authorize_budget(p_budget uuid, p_item_ids uuid[], p_installments integer,
  p_first_due date, p_method text, p_paid_now boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare b budgets; n integer := greatest(1, least(24, coalesce(p_installments, 1))); chosen_sub integer; all_sub integer;
  total integer; base integer; i integer; chosen_count integer; all_count integer; chosen_ids uuid[];
begin
  select * into b from budgets where id = p_budget for update;
  if not found then raise exception 'orçamento não encontrado'; end if;
  if not can_write(b.clinic_id) then raise exception 'sem permissão ou acesso vencido'; end if;
  if b.status <> 'presented' then raise exception 'orçamento já respondido'; end if;
  select coalesce(sum(coalesce(price_cents,0)*quantity),0), count(*) into all_sub, all_count from plan_items where plan_id = b.plan_id;
  select coalesce(sum(coalesce(price_cents,0)*quantity),0), count(*), array_agg(id) into chosen_sub, chosen_count, chosen_ids
    from plan_items where plan_id = b.plan_id and id = any(coalesce(p_item_ids, '{}'));
  if chosen_count = 0 then raise exception 'escolha pelo menos um item'; end if;
  total := chosen_sub - case when all_sub > 0 then round(b.discount_cents::numeric * chosen_sub / all_sub)::integer else 0 end;

  perform set_config('app.budget_rpc', '1', true);
  update budgets set status = 'authorized', authorized_item_ids = chosen_ids, authorized_at = now() where id = p_budget;
  update treatment_plans set status = 'authorized' where id = b.plan_id;

  insert into treatments (clinic_id, patient_id, dentist_id, budget_id, plan_item_id, procedure_id, procedure_name, price_cents, payment_status, clinical_status)
  select b.clinic_id, b.patient_id, auth.uid(), b.id, pi.id, pi.procedure_id,
    coalesce(pi.procedure_name, 'Procedimento')
      || case when pi.tooth_fdi is not null then ' · dente ' || pi.tooth_fdi
              when pi.region = 'upper' then ' · arcada superior' when pi.region = 'lower' then ' · arcada inferior'
              when pi.region = 'both' then ' · ambas as arcadas' else '' end
      || case when pi.quantity > 1 then ' (×' || pi.quantity || ')' else '' end,
    coalesce(pi.price_cents, 0) * pi.quantity, 'budget', 'in_progress'
  from plan_items pi where pi.plan_id = b.plan_id and pi.id = any(chosen_ids);

  base := total / n;
  for i in 1..n loop
    insert into installments (clinic_id, budget_id, patient_id, number, of_total, due_date, amount_cents, method, paid_at)
    values (b.clinic_id, b.id, b.patient_id, i, n, (p_first_due + make_interval(months => i - 1))::date,
      case when i = n then total - base * (n - 1) else base end, p_method,
      case when coalesce(p_paid_now, false) and i = 1 then current_date else null end);
  end loop;

  insert into patient_events (clinic_id, patient_id, kind, label) values (b.clinic_id, b.patient_id, 'budget_authorized',
    case when chosen_count = all_count then 'Orçamento aprovado' else 'Orçamento aprovado em parte (' || chosen_count || ' de ' || all_count || ' itens)' end
    || case when n > 1 then ' em ' || n || 'x' else '' end);
end $$;
