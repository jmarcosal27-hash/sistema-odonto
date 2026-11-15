-- Controle de prótese: serviços enviados a laboratórios, em kanban de 5 etapas, com histórico e comentários.
-- Idempotente (pode rodar de novo). Não altera nenhuma tabela ou função existente; só cria tabelas, funções e gatilhos novos.
--
-- Regras:
--  * Etapas fixas (pre_lab, sent, lab, scheduled, done). Atrasado = em sent ou lab com due_on anterior a hoje (calculado na tela).
--  * Serviço: de um paciente visível ao usuário (can_see_patient). Escreve quem tem can_write (acesso vencido = só leitura).
--    Só o dono exclui. O paciente do serviço não muda depois de criado.
--  * Laboratório: cadastro da clínica; qualquer um que escreve cria e edita, só o dono exclui. Excluir solta os serviços (laboratory_id = null).
--  * Histórico (criação, mudança de etapa, marcação de retorno) é gravado por gatilho; comentário é a única linha que o usuário insere.
--    Eventos não são editados nem apagados.

-- ========== 1. Tabelas ==========

create table if not exists laboratories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone text check (phone is null or char_length(phone) <= 30),
  notes text check (notes is null or char_length(notes) <= 255),
  created_at timestamptz not null default now()
);
create unique index if not exists laboratories_name_uq on laboratories (clinic_id, lower(btrim(name)));

create table if not exists prosthesis_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  laboratory_id uuid references laboratories(id) on delete set null,
  stage text not null default 'pre_lab' check (stage in ('pre_lab', 'sent', 'lab', 'scheduled', 'done')),
  professional_name text not null check (char_length(btrim(professional_name)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 255),
  kind text not null default 'other' check (kind in ('crown', 'total', 'ppr', 'veneer', 'protocol', 'splint', 'other')),
  teeth text check (teeth is null or char_length(teeth) <= 60),
  shade text check (shade is null or char_length(shade) <= 40),
  sent_on date,
  due_on date,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  label text check (label is null or char_length(label) <= 30),
  is_return boolean not null default false,
  return_reason text check (return_reason is null or char_length(return_reason) <= 255),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  check (not is_return or char_length(btrim(coalesce(return_reason, ''))) >= 1),
  check (sent_on is null or due_on is null or due_on >= sent_on)
);
create index if not exists prosthesis_jobs_clinic_stage_idx on prosthesis_jobs (clinic_id, stage);
create index if not exists prosthesis_jobs_patient_idx on prosthesis_jobs (patient_id);
create index if not exists prosthesis_jobs_lab_idx on prosthesis_jobs (laboratory_id);

create table if not exists prosthesis_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  job_id uuid not null references prosthesis_jobs(id) on delete cascade,
  kind text not null check (kind in ('comment', 'stage', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 255),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text check (author_name is null or char_length(author_name) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists prosthesis_events_job_idx on prosthesis_events (job_id, created_at);
create index if not exists prosthesis_events_clinic_idx on prosthesis_events (clinic_id);

-- ========== 2. Serviço: validação e histórico ==========

-- Laboratório da mesma clínica. Definer: lê sem depender da RLS.
create or replace function prosthesis_jobs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare l_clinic uuid;
begin
  if new.laboratory_id is not null then
    select clinic_id into l_clinic from laboratories where id = new.laboratory_id;
    if l_clinic is distinct from new.clinic_id then raise exception 'laboratório de outra clínica'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.clinic_id <> old.clinic_id or new.patient_id <> old.patient_id then
      raise exception 'não é possível mudar clínica ou paciente do serviço';
    end if;
    new.updated_at := now();
    if new.stage <> old.stage then new.stage_changed_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists prosthesis_jobs_guard on prosthesis_jobs;
create trigger prosthesis_jobs_guard before insert or update on prosthesis_jobs for each row execute function prosthesis_jobs_guard();

-- Histórico gravado no servidor: o usuário não escreve nem apaga linhas de criação, de etapa ou de retorno.
create or replace function prosthesis_jobs_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
  names text[] := array['Pré-laboratório', 'Envio', 'Laboratório', 'Agenda', 'Realizado'];
  keys text[] := array['pre_lab', 'sent', 'lab', 'scheduled', 'done'];
begin
  select professional_name into v_name from clinic_members
    where clinic_id = new.clinic_id and user_id = auth.uid() and status = 'active' limit 1;
  if tg_op = 'INSERT' then
    insert into prosthesis_events (clinic_id, job_id, kind, body, author_id, author_name)
      values (new.clinic_id, new.id, 'system', 'Criou este serviço', auth.uid(), v_name);
  else
    if new.stage <> old.stage then
      insert into prosthesis_events (clinic_id, job_id, kind, body, author_id, author_name)
        values (new.clinic_id, new.id, 'stage',
          coalesce(names[array_position(keys, old.stage)], old.stage) || ' → ' || coalesce(names[array_position(keys, new.stage)], new.stage), auth.uid(), v_name);
    end if;
    if new.is_return and not old.is_return then
      insert into prosthesis_events (clinic_id, job_id, kind, body, author_id, author_name)
        values (new.clinic_id, new.id, 'system', left('Marcado como retorno: ' || coalesce(new.return_reason, ''), 255), auth.uid(), v_name);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists prosthesis_jobs_log_insert on prosthesis_jobs;
create trigger prosthesis_jobs_log_insert after insert on prosthesis_jobs for each row execute function prosthesis_jobs_log();
drop trigger if exists prosthesis_jobs_log_update on prosthesis_jobs;
create trigger prosthesis_jobs_log_update after update on prosthesis_jobs for each row execute function prosthesis_jobs_log();

-- Comentário: o serviço é da mesma clínica; autor e nome vêm do servidor (não do cliente).
create or replace function prosthesis_events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare j_clinic uuid;
begin
  select clinic_id into j_clinic from prosthesis_jobs where id = new.job_id;
  if j_clinic is distinct from new.clinic_id then raise exception 'serviço de outra clínica'; end if;
  if new.kind = 'comment' and auth.uid() is not null then
    new.author_id := auth.uid();
    select professional_name into new.author_name from clinic_members
      where clinic_id = new.clinic_id and user_id = auth.uid() and status = 'active' limit 1;
  end if;
  return new;
end $$;
drop trigger if exists prosthesis_events_guard on prosthesis_events;
create trigger prosthesis_events_guard before insert on prosthesis_events for each row execute function prosthesis_events_guard();

-- ========== 3. RLS ==========

alter table laboratories enable row level security;
drop policy if exists laboratories_read on laboratories;
drop policy if exists laboratories_insert on laboratories;
drop policy if exists laboratories_update on laboratories;
drop policy if exists laboratories_delete on laboratories;
create policy laboratories_read on laboratories for select using (is_member(clinic_id));
create policy laboratories_insert on laboratories for insert with check (can_write(clinic_id));
create policy laboratories_update on laboratories for update using (can_write(clinic_id)) with check (can_write(clinic_id));
create policy laboratories_delete on laboratories for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']));

alter table prosthesis_jobs enable row level security;
drop policy if exists prosthesis_jobs_read on prosthesis_jobs;
drop policy if exists prosthesis_jobs_insert on prosthesis_jobs;
drop policy if exists prosthesis_jobs_update on prosthesis_jobs;
drop policy if exists prosthesis_jobs_delete on prosthesis_jobs;
create policy prosthesis_jobs_read on prosthesis_jobs for select using (is_member(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy prosthesis_jobs_insert on prosthesis_jobs for insert with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy prosthesis_jobs_update on prosthesis_jobs for update
  using (can_write(clinic_id) and can_see_patient(clinic_id, patient_id)) with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy prosthesis_jobs_delete on prosthesis_jobs for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']) and can_see_patient(clinic_id, patient_id));

-- Eventos herdam a visibilidade do serviço (o exists roda sob a RLS dele). Sem update nem delete.
alter table prosthesis_events enable row level security;
drop policy if exists prosthesis_events_read on prosthesis_events;
drop policy if exists prosthesis_events_insert on prosthesis_events;
create policy prosthesis_events_read on prosthesis_events for select using (
  is_member(clinic_id) and exists (select 1 from prosthesis_jobs j where j.id = prosthesis_events.job_id and j.clinic_id = prosthesis_events.clinic_id));
create policy prosthesis_events_insert on prosthesis_events for insert with check (
  can_write(clinic_id) and kind = 'comment' and author_id = auth.uid()
  and exists (select 1 from prosthesis_jobs j where j.id = prosthesis_events.job_id and j.clinic_id = prosthesis_events.clinic_id));
