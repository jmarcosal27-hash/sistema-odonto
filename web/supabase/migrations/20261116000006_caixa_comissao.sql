-- Caixa (livro-caixa) e comissionamento por dentista.
-- Idempotente (pode rodar de novo). Não remove dados. Objetos novos usam "if not exists" e "create or replace".
--
-- Como o caixa lê os recebimentos: NÃO existe tabela de pagamentos. Entrada de paciente = parcela paga
-- (installments.paid_at) ou atendimento avulso recebido (treatments.payment_status = 'received'); despesas pagas
-- (expenses) são saídas. O caixa lê dessas tabelas e nada é lançado duas vezes. Esta migration só guarda o que falta:
--  * cash_movements    lançamentos manuais (entrada/saída) e saídas de comissão paga
--  * cash_receipts     dados extras de um recebimento existente: dentista que executou, forma, estorno
--  * cash_days         abertura e fechamento de caixa por dia
--  * commission_rules  % por dentista (regra padrão procedure_key = '') e override por procedimento
--  * commission_payouts / commission_payout_items  comissões pagas (um recebimento só entra em um pagamento)
--
-- Regras:
--  * Lê e escreve só quem é dono ou financeiro (e só com acesso em vigor para escrever). Dentista com vínculo de
--    usuário (professionals.user_id) lê só as próprias regras e comissões.
--  * Nada é excluído: não há política de exclusão. Estorno = marcar reversed_at + motivo (sem volta).
--  * Dentista, profissional e recebimento precisam ser da mesma clínica (gatilhos).

-- ========== 0. Vínculo opcional profissional -> usuário ==========

alter table professionals add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists professionals_user_idx on professionals (user_id) where user_id is not null;

create or replace function cash_staff(c uuid) returns boolean
language sql stable as $$ select has_role(c, array['owner','finance']) $$;

create or replace function cash_staff_write(c uuid) returns boolean
language sql stable as $$ select can_write(c) and has_role(c, array['owner','finance']) $$;

-- Dentista vê só a própria comissão (profissional com vínculo de usuário).
create or replace function is_my_professional(c uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and exists (select 1 from professionals x where x.id = p and x.clinic_id = c and x.user_id = auth.uid())
$$;

-- ========== 1. Tabelas ==========

create table if not exists commission_payouts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  professional_id uuid references professionals(id) on delete set null,
  professional_name text not null check (char_length(btrim(professional_name)) between 1 and 80),
  period_from date not null,
  period_to date not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on date not null default current_date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (period_to >= period_from)
);
create index if not exists commission_payouts_clinic_idx on commission_payouts (clinic_id, paid_on);
create index if not exists commission_payouts_pro_idx on commission_payouts (professional_id);

create table if not exists commission_payout_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  payout_id uuid not null references commission_payouts(id) on delete cascade,
  source_type text not null check (source_type in ('installment','treatment')),
  source_id uuid not null,
  amount_cents integer not null check (amount_cents >= 0)
);
-- Um recebimento só entra em um pagamento de comissão.
create unique index if not exists commission_payout_items_source_uq on commission_payout_items (clinic_id, source_type, source_id);
create index if not exists commission_payout_items_payout_idx on commission_payout_items (payout_id);

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('in','out')),
  occurred_on date not null default current_date,
  amount_cents integer not null check (amount_cents > 0),
  method text not null default 'cash' check (method in ('pix','credit','debit','cash','transfer','boleto','insurance','other')),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  patient_id uuid references patients(id) on delete set null,
  professional_id uuid references professionals(id) on delete set null,
  payout_id uuid references commission_payouts(id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or char_length(btrim(reversal_reason)) between 3 and 200),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((reversed_at is null) = (reversal_reason is null))
);
create index if not exists cash_movements_clinic_day_idx on cash_movements (clinic_id, occurred_on);
create index if not exists cash_movements_payout_idx on cash_movements (payout_id);

create table if not exists cash_receipts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  source_type text not null check (source_type in ('installment','treatment')),
  source_id uuid not null,
  professional_id uuid references professionals(id) on delete set null,
  method text check (method in ('pix','credit','debit','cash','transfer','boleto','insurance','other')),
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or char_length(btrim(reversal_reason)) between 3 and 200),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((reversed_at is null) = (reversal_reason is null)),
  unique (clinic_id, source_type, source_id)
);
create index if not exists cash_receipts_pro_idx on cash_receipts (professional_id);

create table if not exists cash_days (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  day date not null,
  opening_cents integer not null default 0 check (opening_cents >= 0),
  counted_cents integer check (counted_cents is null or counted_cents >= 0),
  closed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((closed_at is null) = (counted_cents is null)),
  unique (clinic_id, day)
);

create table if not exists commission_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  -- '' = regra padrão do dentista; senão, nome do procedimento (override).
  procedure_key text not null default '' check (char_length(procedure_key) <= 120),
  percent numeric(5,2) not null check (percent between 0 and 100),
  -- % do valor recebido descontado antes de calcular (custo de laboratório/material).
  lab_cost_percent numeric(5,2) not null default 0 check (lab_cost_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique (clinic_id, professional_id, procedure_key)
);

-- ========== 2. Integridade ==========

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
    if tg_op = 'UPDATE' then
      -- Só o estorno pode mudar, e ele não volta.
      if (new.kind, new.occurred_on, new.amount_cents, new.method, new.category, new.description, new.patient_id, new.professional_id, new.payout_id)
         is distinct from (old.kind, old.occurred_on, old.amount_cents, old.method, old.category, old.description, old.patient_id, old.professional_id, old.payout_id)
        then raise exception 'lançamento do caixa não pode ser alterado; estorne e lance de novo'; end if;
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

create or replace trigger cash_movements_guard before insert or update on cash_movements for each row execute function cash_guard();
create or replace trigger cash_receipts_guard before insert or update on cash_receipts for each row execute function cash_guard();
create or replace trigger cash_days_guard before insert or update on cash_days for each row execute function cash_guard();
create or replace trigger commission_rules_guard before insert or update on commission_rules for each row execute function cash_guard();
create or replace trigger commission_payouts_guard before insert or update on commission_payouts for each row execute function cash_guard();
create or replace trigger commission_payout_items_guard before insert or update on commission_payout_items for each row execute function cash_guard();

-- Pagamento de comissão não muda depois de criado (sem política de update, mas protege também o service role).
create or replace function commission_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'pagamento de comissão não pode ser alterado';
end $$;
create or replace trigger commission_payouts_immutable before update on commission_payouts for each row
  when (new.professional_id is not null) execute function commission_immutable();
create or replace trigger commission_payout_items_immutable before update on commission_payout_items for each row execute function commission_immutable();

-- ========== 3. RLS ==========
-- Sem política de delete em nenhuma tabela de caixa/pagamento: nada é apagado (só regras podem ser excluídas).

alter table cash_movements enable row level security;
alter table cash_receipts enable row level security;
alter table cash_days enable row level security;
alter table commission_rules enable row level security;
alter table commission_payouts enable row level security;
alter table commission_payout_items enable row level security;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('cash_movements',  'read',   'select', 'cash_staff(clinic_id)', null),
    ('cash_movements',  'insert', 'insert', null, 'cash_staff_write(clinic_id)'),
    ('cash_movements',  'update', 'update', 'cash_staff_write(clinic_id)', 'cash_staff_write(clinic_id)'),
    ('cash_receipts',   'read',   'select', 'cash_staff(clinic_id)', null),
    ('cash_receipts',   'insert', 'insert', null, 'cash_staff_write(clinic_id)'),
    ('cash_receipts',   'update', 'update', 'cash_staff_write(clinic_id)', 'cash_staff_write(clinic_id)'),
    ('cash_days',       'read',   'select', 'cash_staff(clinic_id)', null),
    ('cash_days',       'insert', 'insert', null, 'cash_staff_write(clinic_id)'),
    ('cash_days',       'update', 'update', 'cash_staff_write(clinic_id)', 'cash_staff_write(clinic_id)'),
    ('commission_rules','read',   'select', 'cash_staff(clinic_id) or is_my_professional(clinic_id, professional_id)', null),
    ('commission_rules','insert', 'insert', null, 'cash_staff_write(clinic_id)'),
    ('commission_rules','update', 'update', 'cash_staff_write(clinic_id)', 'cash_staff_write(clinic_id)'),
    ('commission_rules','delete', 'delete', 'cash_staff_write(clinic_id)', null),
    ('commission_payouts','read', 'select', 'cash_staff(clinic_id) or is_my_professional(clinic_id, professional_id)', null),
    ('commission_payouts','insert','insert', null, 'cash_staff_write(clinic_id)'),
    ('commission_payout_items','read','select', 'cash_staff(clinic_id) or exists (select 1 from commission_payouts p where p.id = payout_id and is_my_professional(p.clinic_id, p.professional_id))', null),
    ('commission_payout_items','insert','insert', null, 'cash_staff_write(clinic_id)')
  ) as t(tbl, suffix, cmd, using_expr, check_expr)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.tbl || '_' || r.suffix) then
      execute format('create policy %I on %I for %s%s%s', r.tbl || '_' || r.suffix, r.tbl, r.cmd,
        case when r.using_expr is not null then ' using (' || r.using_expr || ')' else '' end,
        case when r.check_expr is not null then ' with check (' || r.check_expr || ')' else '' end);
    end if;
  end loop;
end $$;
