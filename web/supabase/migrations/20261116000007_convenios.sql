-- Convênios e faturamento: convênios da clínica, tabela de repasse por procedimento, lotes de faturamento e itens do lote.
-- Também liga o paciente a um convênio (insurer_id, carteirinha e validade em patients).
-- Idempotente (pode rodar de novo). Não remove dados e não usa instruções de apagar linhas, políticas ou gatilhos:
-- objetos novos usam "if not exists" e "create or replace".
--
-- Regras:
--  * Todo membro da clínica lê. Escreve quem tem can_write (acesso em vigor). Só o dono apaga.
--  * Tudo é validado contra mistura entre clínicas (convênio, lote, paciente e atendimento precisam ser da mesma clínica).
--  * Valores em centavos, inteiros. Pago + glosa nunca passa do faturado.
--  * Um atendimento (treatment) entra em no máximo um lote: índice único em billing_items.treatment_id.
--  * Excluir um lote leva os itens junto (os atendimentos voltam a poder ser faturados).

-- ========== 1. Tabelas ==========

create table if not exists insurers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  type text not null default 'odonto' check (type in ('odonto', 'saude_odonto', 'autogestao')),
  ans_code text check (ans_code is null or char_length(ans_code) <= 20),
  active boolean not null default true,
  payment_days integer not null default 30 check (payment_days between 0 and 365),
  closing_day integer not null default 30 check (closing_day between 1 and 31),
  default_gloss_percent numeric(5,2) not null default 0 check (default_gloss_percent between 0 and 100),
  contact text check (contact is null or char_length(contact) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  suggested boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists insurers_name_uq on insurers (clinic_id, lower(btrim(name)));

create table if not exists insurer_prices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  insurer_id uuid not null references insurers(id) on delete cascade,
  procedure_key text not null check (char_length(btrim(procedure_key)) between 1 and 120),
  procedure_name text not null check (char_length(btrim(procedure_name)) between 1 and 120),
  price_cents integer not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  unique (insurer_id, procedure_key)
);
create index if not exists insurer_prices_clinic_idx on insurer_prices (clinic_id);

create table if not exists billing_batches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  insurer_id uuid not null references insurers(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'partial', 'glossed')),
  protocol text check (protocol is null or char_length(protocol) <= 60),
  sent_on date,
  expected_on date,
  cashed_cents integer not null default 0 check (cashed_cents >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists billing_batches_clinic_idx on billing_batches (clinic_id, year, month);
create index if not exists billing_batches_insurer_idx on billing_batches (insurer_id);

create table if not exists billing_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  batch_id uuid not null references billing_batches(id) on delete cascade,
  treatment_id uuid references treatments(id) on delete set null,
  patient_id uuid not null references patients(id) on delete restrict,
  card_number text check (card_number is null or char_length(card_number) <= 40),
  procedure_name text not null check (char_length(btrim(procedure_name)) between 1 and 120),
  professional_name text check (professional_name is null or char_length(professional_name) <= 80),
  performed_on date not null,
  billed_cents integer not null check (billed_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  gloss_cents integer not null default 0 check (gloss_cents >= 0),
  gloss_reason text check (gloss_reason is null or char_length(gloss_reason) <= 300),
  status text not null default 'pending' check (status in ('pending', 'paid', 'partial', 'glossed')),
  created_at timestamptz not null default now(),
  check (paid_cents + gloss_cents <= billed_cents)
);
create index if not exists billing_items_batch_idx on billing_items (batch_id);
create index if not exists billing_items_clinic_idx on billing_items (clinic_id);
create unique index if not exists billing_items_treatment_uq on billing_items (treatment_id) where treatment_id is not null;

-- ========== 2. Paciente conveniado ==========

alter table patients add column if not exists insurer_id uuid references insurers(id) on delete set null;
alter table patients add column if not exists insurance_card text check (insurance_card is null or char_length(insurance_card) <= 40);
alter table patients add column if not exists insurance_valid_until date;
create index if not exists patients_insurer_idx on patients (insurer_id);

-- ========== 3. Integridade entre clínicas ==========

create or replace function insurance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if tg_op = 'UPDATE' and new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica'; end if;
  if tg_table_name = 'insurer_prices' or tg_table_name = 'billing_batches' then
    select clinic_id into c from insurers where id = new.insurer_id;
    if c is distinct from new.clinic_id then raise exception 'convênio de outra clínica'; end if;
  elsif tg_table_name = 'billing_items' then
    select clinic_id into c from billing_batches where id = new.batch_id;
    if c is distinct from new.clinic_id then raise exception 'lote de outra clínica'; end if;
    select clinic_id into c from patients where id = new.patient_id;
    if c is distinct from new.clinic_id then raise exception 'paciente de outra clínica'; end if;
    if new.treatment_id is not null then
      select clinic_id into c from treatments where id = new.treatment_id;
      if c is distinct from new.clinic_id then raise exception 'atendimento de outra clínica'; end if;
    end if;
    if tg_op = 'UPDATE' and (new.batch_id <> old.batch_id or new.patient_id <> old.patient_id) then raise exception 'lote e paciente do item não mudam'; end if;
  end if;
  return new;
end $$;
create or replace trigger insurer_prices_guard before insert or update on insurer_prices for each row execute function insurance_guard();
create or replace trigger billing_batches_guard before insert or update on billing_batches for each row execute function insurance_guard();
create or replace trigger billing_items_guard before insert or update on billing_items for each row execute function insurance_guard();

create or replace function insurers_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica do convênio'; end if;
  return new;
end $$;
create or replace trigger insurers_guard before update on insurers for each row execute function insurers_guard();

-- Convênio do paciente precisa ser da mesma clínica.
create or replace function patient_insurer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if new.insurer_id is not null then
    select clinic_id into c from insurers where id = new.insurer_id;
    if c is distinct from new.clinic_id then raise exception 'convênio de outra clínica'; end if;
  end if;
  return new;
end $$;
create or replace trigger patients_insurer_guard before insert or update of insurer_id on patients for each row execute function patient_insurer_guard();

-- ========== 4. RLS ==========

alter table insurers enable row level security;
alter table insurer_prices enable row level security;
alter table billing_batches enable row level security;
alter table billing_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['insurers', 'insurer_prices', 'billing_batches', 'billing_items'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on %I for select using (is_member(clinic_id))', t || '_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_insert') then
      execute format('create policy %I on %I for insert with check (can_write(clinic_id))', t || '_insert', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_update') then
      execute format('create policy %I on %I for update using (can_write(clinic_id)) with check (can_write(clinic_id))', t || '_update', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_delete') then
      execute format('create policy %I on %I for delete using (can_write(clinic_id) and has_role(clinic_id, array[''owner'']))', t || '_delete', t);
    end if;
  end loop;
end $$;
