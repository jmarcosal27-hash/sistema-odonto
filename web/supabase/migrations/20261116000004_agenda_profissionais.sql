-- Agenda por profissional: profissionais (dentistas ou cadeiras), bloqueios de horário e campos novos em appointments.
-- Idempotente (pode rodar de novo). Não remove dados. Evita as instruções de apagar políticas ou gatilhos:
-- objetos novos usam "if not exists" e "create or replace".
--
-- Regras:
--  * Profissional: cadastro da clínica. Todo membro lê; só o dono cria, edita e exclui (e só com acesso em vigor).
--    Excluir um profissional NÃO apaga agendamentos: eles ficam sem profissional (professional_id = null).
--    Os bloqueios do profissional excluído saem junto.
--  * Bloqueio: um por dia. Sem profissional = clínica toda. Escreve quem tem can_write.
--  * Agendamento: professional_id da mesma clínica; procedures é uma lista validada (até 20 itens, nome, valor e duração);
--    forced marca encaixe; label é a etiqueta (até 30 caracteres).
--  * Status ampliado: waiting (paciente na recepção) e in_service (em atendimento).

-- ========== 1. Tabelas ==========

create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists professionals_name_uq on professionals (clinic_id, lower(btrim(name)));

create table if not exists time_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  professional_id uuid references professionals(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null default 'Bloqueio' check (char_length(btrim(reason)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists time_blocks_clinic_date_idx on time_blocks (clinic_id, date);
create index if not exists time_blocks_professional_idx on time_blocks (professional_id);

-- ========== 2. Agendamentos: colunas novas e status ampliado ==========

alter table appointments add column if not exists professional_id uuid references professionals(id) on delete set null;
alter table appointments add column if not exists procedures jsonb not null default '[]'::jsonb;
alter table appointments add column if not exists label text;
alter table appointments add column if not exists forced boolean not null default false;
create index if not exists appointments_professional_idx on appointments (professional_id);

-- Lista de procedimentos: até 20 itens, cada um com nome (1 a 120), valor em centavos inteiro >= 0 e duração inteira de 1 a 600.
create or replace function appointment_procedures_ok(p jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(p) is distinct from 'array' then false
    when jsonb_array_length(p) > 20 then false
    else not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) is distinct from 'object'
        or jsonb_typeof(e->'name') is distinct from 'string'
        or char_length(btrim(e->>'name')) not between 1 and 120
        or jsonb_typeof(e->'price_cents') is distinct from 'number'
        or jsonb_typeof(e->'duration_minutes') is distinct from 'number'
        or case when jsonb_typeof(e->'price_cents') = 'number' and jsonb_typeof(e->'duration_minutes') = 'number' then
             (e->>'price_cents')::numeric < 0 or (e->>'price_cents')::numeric <> trunc((e->>'price_cents')::numeric)
             or (e->>'duration_minutes')::numeric not between 1 and 600 or (e->>'duration_minutes')::numeric <> trunc((e->>'duration_minutes')::numeric)
           else true end)
  end
$$;

do $$
declare c record;
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_procedures_ok' and conrelid = 'appointments'::regclass) then
    alter table appointments add constraint appointments_procedures_ok check (appointment_procedures_ok(procedures));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_label_len' and conrelid = 'appointments'::regclass) then
    alter table appointments add constraint appointments_label_len check (label is null or char_length(label) <= 30);
  end if;
  -- Troca só o check de status (o original e, numa nova execução, o desta migration).
  for c in select conname from pg_constraint
    where conrelid = 'appointments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table appointments drop constraint %I', c.conname);
  end loop;
  alter table appointments add constraint appointments_status_check
    check (status in ('to_confirm', 'confirmed', 'waiting', 'in_service', 'done', 'cancelled', 'no_show'));
end $$;

-- ========== 3. Validação entre clínicas ==========

-- Profissional do agendamento e do bloqueio precisa ser da mesma clínica. Definer: lê sem depender da RLS.
create or replace function agenda_professional_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p_clinic uuid;
begin
  if new.professional_id is not null then
    select clinic_id into p_clinic from professionals where id = new.professional_id;
    if p_clinic is distinct from new.clinic_id then raise exception 'profissional de outra clínica'; end if;
  end if;
  if tg_op = 'UPDATE' and new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica'; end if;
  return new;
end $$;
create or replace trigger appointments_professional_guard before insert or update on appointments for each row execute function agenda_professional_guard();
create or replace trigger time_blocks_professional_guard before insert or update on time_blocks for each row execute function agenda_professional_guard();

create or replace function professionals_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica do profissional'; end if;
  return new;
end $$;
create or replace trigger professionals_guard before update on professionals for each row execute function professionals_guard();

-- ========== 4. RLS ==========

alter table professionals enable row level security;
alter table time_blocks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'professionals' and policyname = 'professionals_read') then
    create policy professionals_read on professionals for select using (is_member(clinic_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'professionals' and policyname = 'professionals_insert') then
    create policy professionals_insert on professionals for insert with check (can_write(clinic_id) and has_role(clinic_id, array['owner']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'professionals' and policyname = 'professionals_update') then
    create policy professionals_update on professionals for update
      using (can_write(clinic_id) and has_role(clinic_id, array['owner'])) with check (can_write(clinic_id) and has_role(clinic_id, array['owner']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'professionals' and policyname = 'professionals_delete') then
    create policy professionals_delete on professionals for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_blocks' and policyname = 'time_blocks_read') then
    create policy time_blocks_read on time_blocks for select using (is_member(clinic_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_blocks' and policyname = 'time_blocks_insert') then
    create policy time_blocks_insert on time_blocks for insert with check (can_write(clinic_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_blocks' and policyname = 'time_blocks_update') then
    create policy time_blocks_update on time_blocks for update using (can_write(clinic_id)) with check (can_write(clinic_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_blocks' and policyname = 'time_blocks_delete') then
    create policy time_blocks_delete on time_blocks for delete using (can_write(clinic_id));
  end if;
end $$;
