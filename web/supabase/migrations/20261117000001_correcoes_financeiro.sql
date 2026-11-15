-- Correções financeiras da Onda C (revisão de 2026-11-15). Não altera as migrations anteriores.
-- Idempotente (pode rodar de novo). Não remove dados.
--
--  1. Pagamento de comissão numa transação só (RPC pay_commission): pagamento, itens e saída do caixa
--     entram juntos ou nada entra. Antes eram três gravações soltas pelo navegador.
--  2. Repasse de convênio no caixa (RPC cash_billing_batch): trava o lote, calcula o que falta lançar no
--     servidor e grava a entrada ligada ao lote (cash_movements.billing_batch_id). Clique duplo ou duas
--     sessões não duplicam a entrada. cashed_cents só muda por essa função ou por estorno da entrada.
--  3. Itens de faturamento respeitam o modo "consultório dividido" (can_see_patient), como Vendas e Prótese.
--  4. Status do item e do lote calculados no banco (antes vinham do navegador, que no modo dividido
--     não enxerga todos os itens do lote).

-- ========== 1. Entrada do caixa ligada ao lote de convênio ==========

alter table cash_movements add column if not exists billing_batch_id uuid references billing_batches(id) on delete set null;
create index if not exists cash_movements_batch_idx on cash_movements (billing_batch_id) where billing_batch_id is not null;

-- Mesma função da migration 20261116000006, com billing_batch_id na checagem de clínica e na trava de alteração.
create or replace function cash_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p_clinic uuid;
begin
  if tg_op = 'UPDATE' and new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica'; end if;
  if tg_table_name in ('cash_movements','cash_receipts','commission_rules','commission_payouts') then
    if new.professional_id is not null then
      select clinic_id into p_clinic from professionals where id = new.professional_id;
      if p_clinic is distinct from new.clinic_id then raise exception 'profissional de outra clínica'; end if;
    end if;
  end if;
  if tg_table_name = 'cash_movements' then
    if new.patient_id is not null then
      select clinic_id into p_clinic from patients where id = new.patient_id;
      if p_clinic is distinct from new.clinic_id then raise exception 'paciente de outra clínica'; end if;
    end if;
    if new.payout_id is not null then
      select clinic_id into p_clinic from commission_payouts where id = new.payout_id;
      if p_clinic is distinct from new.clinic_id then raise exception 'pagamento de outra clínica'; end if;
    end if;
    if new.billing_batch_id is not null then
      select clinic_id into p_clinic from billing_batches where id = new.billing_batch_id;
      if p_clinic is distinct from new.clinic_id then raise exception 'lote de outra clínica'; end if;
      -- Entrada de convênio só pela função cash_billing_batch (ela calcula o valor).
      if tg_op = 'INSERT' and auth.uid() is not null and coalesce(current_setting('app.billing_cash', true), '') <> 'on' then
        raise exception 'use "Lançar no caixa" no lote do convênio';
      end if;
    end if;
    if tg_op = 'UPDATE' then
      -- Só o estorno pode mudar, e ele não volta. (billing_batch_id pode virar null só pela exclusão do lote.)
      if (new.kind, new.occurred_on, new.amount_cents, new.method, new.category, new.description, new.patient_id, new.professional_id, new.payout_id)
         is distinct from (old.kind, old.occurred_on, old.amount_cents, old.method, old.category, old.description, old.patient_id, old.professional_id, old.payout_id)
        then raise exception 'lançamento do caixa não pode ser alterado; estorne e lance de novo'; end if;
      if new.billing_batch_id is distinct from old.billing_batch_id and new.billing_batch_id is not null
        then raise exception 'lançamento do caixa não pode mudar de lote'; end if;
      if old.reversed_at is not null and (new.reversed_at is distinct from old.reversed_at or new.reversal_reason is distinct from old.reversal_reason)
        then raise exception 'lançamento já estornado'; end if;
    end if;
  elsif tg_table_name = 'cash_receipts' then
    if new.source_type = 'installment' then
      select clinic_id into p_clinic from installments where id = new.source_id;
    else
      select clinic_id into p_clinic from treatments where id = new.source_id;
    end if;
    if p_clinic is distinct from new.clinic_id then raise exception 'recebimento de outra clínica'; end if;
    if tg_op = 'UPDATE' then
      if (new.source_type, new.source_id) is distinct from (old.source_type, old.source_id) then raise exception 'recebimento não pode mudar de origem'; end if;
      if old.reversed_at is not null and (new.reversed_at is distinct from old.reversed_at or new.reversal_reason is distinct from old.reversal_reason or new.professional_id is distinct from old.professional_id or new.method is distinct from old.method)
        then raise exception 'recebimento já estornado'; end if;
    end if;
  elsif tg_table_name = 'cash_days' then
    if tg_op = 'UPDATE' then
      if new.day <> old.day then raise exception 'não é possível mudar o dia'; end if;
      if old.closed_at is not null then raise exception 'caixa do dia já fechado'; end if;
    end if;
  elsif tg_table_name = 'commission_payout_items' then
    select clinic_id into p_clinic from commission_payouts where id = new.payout_id;
    if p_clinic is distinct from new.clinic_id then raise exception 'pagamento de outra clínica'; end if;
    if new.source_type = 'installment' then
      select clinic_id into p_clinic from installments where id = new.source_id;
    else
      select clinic_id into p_clinic from treatments where id = new.source_id;
    end if;
    if p_clinic is distinct from new.clinic_id then raise exception 'recebimento de outra clínica'; end if;
  end if;
  return new;
end $$;

-- ========== 2. Status do item e do lote calculados no banco ==========

create or replace function billing_batch_status(p_batch uuid, p_sent_on date) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_sent_on is null then 'draft'
    when count(*) = 0 or bool_and(status = 'pending') then 'sent'
    when bool_and(status = 'paid') then 'paid'
    when bool_and(status = 'glossed') then 'glossed'
    else 'partial' end
  from billing_items where batch_id = p_batch
$$;
revoke execute on function billing_batch_status(uuid, date) from public, anon, authenticated;

-- Lote: status sempre do banco; cashed_cents só pela função de caixa (ou estorno da entrada).
create or replace function billing_batch_derive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.billing_cash', true), '') <> 'on' then
    if tg_op = 'INSERT' then new.cashed_cents := 0;
    elsif new.cashed_cents is distinct from old.cashed_cents then
      raise exception 'o valor lançado no caixa só muda pelo botão "Lançar no caixa"';
    end if;
  end if;
  new.status := billing_batch_status(new.id, new.sent_on);
  return new;
end $$;
create or replace trigger billing_batches_derive before insert or update on billing_batches for each row execute function billing_batch_derive();

-- Item: status a partir de pago/glosa (mesma regra de itemStatus em lib/convenios.ts).
create or replace function billing_item_derive() returns trigger
language plpgsql set search_path = public as $$
begin
  new.status := case
    when new.paid_cents = 0 and new.gloss_cents = 0 then 'pending'
    when new.paid_cents = 0 then 'glossed'
    when new.paid_cents = new.billed_cents and new.gloss_cents = 0 then 'paid'
    else 'partial' end;
  return new;
end $$;
create or replace trigger billing_items_derive before insert or update on billing_items for each row execute function billing_item_derive();

-- Depois de mexer num item, recalcula o lote (enxergando todos os itens, mesmo no modo dividido).
create or replace function billing_item_touch_batch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update billing_batches set status = status where id = coalesce(new.batch_id, old.batch_id);
  if tg_op = 'UPDATE' and new.batch_id is distinct from old.batch_id then
    update billing_batches set status = status where id = old.batch_id;
  end if;
  return null;
end $$;
create or replace trigger billing_items_touch_batch after insert or update or delete on billing_items for each row execute function billing_item_touch_batch();

-- Acerta o status dos lotes que já existem.
update billing_batches set status = status;

-- ========== 3. Lançar repasse de convênio no caixa (uma vez só) ==========

create or replace function cash_billing_batch(p_batch uuid, p_on date default null) returns integer
language plpgsql set search_path = public as $$
declare
  b billing_batches; v_paid integer; v_cashed integer; v_amount integer; v_ins text;
begin
  -- Trava o lote: outra chamada para o mesmo lote espera esta terminar e vê o valor já lançado.
  select * into b from billing_batches where id = p_batch for update;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if not cash_staff_write(b.clinic_id) then
    raise exception 'Só o dono ou o financeiro lançam no caixa (e com o acesso em vigor).' using errcode = '42501';
  end if;
  if b.sent_on is null then raise exception 'Marque o lote como enviado antes de lançar no caixa.'; end if;
  select coalesce(sum(paid_cents), 0) into v_paid from billing_items where batch_id = b.id;
  select coalesce(sum(amount_cents), 0) into v_cashed from cash_movements
    where billing_batch_id = b.id and kind = 'in' and reversed_at is null;
  v_amount := v_paid - v_cashed;
  if v_amount <= 0 then raise exception 'Nada novo a lançar no caixa para este lote.'; end if;
  select name into v_ins from insurers where id = b.insurer_id;

  perform set_config('app.billing_cash', 'on', true);
  insert into cash_movements (clinic_id, kind, occurred_on, amount_cents, method, category, description, billing_batch_id)
  values (b.clinic_id, 'in', coalesce(p_on, current_date), v_amount, 'insurance', 'Convênio',
    left(format('%s — lote %s/%s%s', coalesce(v_ins, 'Convênio'), lpad(b.month::text, 2, '0'), b.year,
      case when b.protocol is not null then ' (protocolo ' || b.protocol || ')' else '' end), 200),
    b.id);
  update billing_batches set cashed_cents = v_paid where id = b.id;
  perform set_config('app.billing_cash', 'off', true);
  return v_amount;
end $$;
revoke execute on function cash_billing_batch(uuid, date) from public, anon;
grant execute on function cash_billing_batch(uuid, date) to authenticated;

-- Estornar a entrada do convênio devolve o valor ao "a lançar" do lote.
create or replace function cash_movement_unbatch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.billing_cash', 'on', true);
  update billing_batches set cashed_cents = (
    select coalesce(sum(amount_cents), 0) from cash_movements where billing_batch_id = new.billing_batch_id and kind = 'in' and reversed_at is null
  ) where id = new.billing_batch_id;
  perform set_config('app.billing_cash', 'off', true);
  return null;
end $$;
create or replace trigger cash_movements_unbatch after update of reversed_at on cash_movements for each row
  when (new.billing_batch_id is not null and old.reversed_at is null and new.reversed_at is not null)
  execute function cash_movement_unbatch();

-- ========== 4. Pagar comissão numa transação ==========

create or replace function pay_commission(
  p_clinic uuid, p_professional uuid, p_period_from date, p_period_to date, p_paid_on date, p_method text, p_items jsonb
) returns uuid language plpgsql set search_path = public as $$
declare
  v_pro professionals; v_total bigint; v_payout uuid;
begin
  if not cash_staff_write(p_clinic) then
    raise exception 'Só o dono ou o financeiro pagam comissão (e com o acesso em vigor).' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 2000 then
    raise exception 'Nada a pagar.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
             where coalesce(x->>'source_type', '') not in ('installment', 'treatment')
                or coalesce(x->>'amount_cents', '') !~ '^\d{1,9}$'
                or coalesce(x->>'source_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Item de comissão inválido.';
  end if;
  select sum((x->>'amount_cents')::bigint) into v_total from jsonb_array_elements(p_items) x;
  if coalesce(v_total, 0) <= 0 then raise exception 'Nada a pagar.'; end if;
  if v_total > 2147483647 then raise exception 'Valor de comissão grande demais.'; end if;
  select * into v_pro from professionals where id = p_professional and clinic_id = p_clinic;
  if not found then raise exception 'Dentista não encontrado.'; end if;

  insert into commission_payouts (clinic_id, professional_id, professional_name, period_from, period_to, amount_cents, paid_on)
  values (p_clinic, v_pro.id, left(v_pro.name, 80), p_period_from, p_period_to, v_total::integer, coalesce(p_paid_on, current_date))
  returning id into v_payout;

  begin
    insert into commission_payout_items (clinic_id, payout_id, source_type, source_id, amount_cents)
    select p_clinic, v_payout, x->>'source_type', (x->>'source_id')::uuid, (x->>'amount_cents')::integer
    from jsonb_array_elements(p_items) x;
  exception when unique_violation then
    raise exception 'Algum recebimento já teve a comissão paga. Atualize a tela.';
  end;

  insert into cash_movements (clinic_id, kind, occurred_on, amount_cents, method, category, description, professional_id, payout_id)
  values (p_clinic, 'out', coalesce(p_paid_on, current_date), v_total::integer, p_method, 'Comissão',
    left(format('Comissão de %s (%s a %s)', v_pro.name, p_period_from, p_period_to), 200), v_pro.id, v_payout);
  return v_payout;
end $$;
revoke execute on function pay_commission(uuid, uuid, date, date, date, text, jsonb) from public, anon;
grant execute on function pay_commission(uuid, uuid, date, date, date, text, jsonb) to authenticated;

-- ========== 5. Itens de faturamento respeitam o modo dividido ==========

drop policy if exists billing_items_read on billing_items;
drop policy if exists billing_items_insert on billing_items;
drop policy if exists billing_items_update on billing_items;
drop policy if exists billing_items_delete on billing_items;
create policy billing_items_read on billing_items for select using (is_member(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy billing_items_insert on billing_items for insert with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy billing_items_update on billing_items for update
  using (can_write(clinic_id) and can_see_patient(clinic_id, patient_id)) with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy billing_items_delete on billing_items for delete
  using (can_write(clinic_id) and has_role(clinic_id, array['owner']) and can_see_patient(clinic_id, patient_id));
