-- Vendas: funil kanban de oportunidades ligado aos orçamentos, comentários, histórico e metas do mês.
-- Idempotente (pode rodar de novo). Não altera create_budget, authorize_budget, decline_budget nem
-- budgets_guard: a oportunidade nasce e se move por gatilhos AFTER em budgets, que só escrevem nas
-- tabelas novas. Não mexe em tabelas existentes além de criar gatilhos em clinics e budgets.
--
-- Regras:
--  * Etapas: 4 padrão por clínica (kind open/in_progress/won/lost), protegidas contra exclusão e troca de tipo;
--    a clínica pode criar, renomear e excluir as suas (kind nulo). Só o dono muda as etapas.
--  * Oportunidade: de um paciente visível ao usuário (can_see_patient). Escreve quem tem can_write
--    (acesso vencido = só leitura). Orçamento criado -> Em aberto; autorizado -> Ganha; recusado -> Perdida.
--    Orçamento "vencido" não é um estado do banco (é calculado na tela), então não move para Perdida.
--  * Histórico (criação e mudança de etapa) é gravado por gatilho; comentário é a única linha que o usuário insere.

-- ========== 1. Tabelas ==========

create table if not exists sales_stages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position integer not null default 0,
  kind text check (kind in ('open', 'in_progress', 'won', 'lost')),
  created_at timestamptz not null default now()
);
create unique index if not exists sales_stages_kind_uq on sales_stages (clinic_id, kind) where kind is not null;
create unique index if not exists sales_stages_name_uq on sales_stages (clinic_id, lower(btrim(name)));
create index if not exists sales_stages_clinic_idx on sales_stages (clinic_id, position);

-- stage_id sem ON DELETE: o padrão (NO ACTION) deixa a clínica inteira ser apagada em cascata.
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  stage_id uuid not null references sales_stages(id),
  budget_id uuid references budgets(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  value_cents integer not null default 0 check (value_cents >= 0),
  responsible_name text check (responsible_name is null or char_length(responsible_name) <= 120),
  label text check (label is null or char_length(label) <= 30),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now()
);
create unique index if not exists opportunities_budget_uq on opportunities (budget_id) where budget_id is not null;
create index if not exists opportunities_clinic_stage_idx on opportunities (clinic_id, stage_id);
create index if not exists opportunities_patient_idx on opportunities (patient_id);

create table if not exists opportunity_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  kind text not null check (kind in ('comment', 'stage', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 255),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text check (author_name is null or char_length(author_name) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists opportunity_events_opp_idx on opportunity_events (opportunity_id, created_at);
create index if not exists opportunity_events_clinic_idx on opportunity_events (clinic_id);

create table if not exists sales_goals (
  clinic_id uuid not null references clinics(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  goal_cents integer not null check (goal_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, month)
);

-- ========== 2. Etapas padrão ==========

create or replace function ensure_sales_stages(c uuid) returns void
language sql security definer set search_path = public as $$
  insert into sales_stages (clinic_id, name, position, kind) values
    (c, 'Em aberto', 0, 'open'), (c, 'Em andamento', 1, 'in_progress'), (c, 'Ganha', 2, 'won'), (c, 'Perdida', 3, 'lost')
  on conflict do nothing
$$;
revoke execute on function ensure_sales_stages(uuid) from public, anon, authenticated;

create or replace function clinics_sales_stages() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform ensure_sales_stages(new.id); return new; end $$;
drop trigger if exists clinics_sales_stages on clinics;
create trigger clinics_sales_stages after insert on clinics for each row execute function clinics_sales_stages();

-- Etapa padrão não muda de tipo nem de clínica.
create or replace function sales_stages_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clinic_id <> old.clinic_id then raise exception 'não é possível mudar a clínica da etapa'; end if;
  if new.kind is distinct from old.kind then raise exception 'não é possível mudar o tipo da etapa'; end if;
  return new;
end $$;
drop trigger if exists sales_stages_guard on sales_stages;
create trigger sales_stages_guard before update on sales_stages for each row execute function sales_stages_guard();

-- ========== 3. Oportunidades: validação, histórico e comentários ==========

-- Etapa e orçamento precisam ser da mesma clínica (e orçamento do mesmo paciente). Definer: lê sem depender da RLS.
create or replace function opportunities_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_clinic uuid; b_clinic uuid; b_patient uuid;
begin
  -- Exclusão de orçamento (ou de clínica/paciente em cascata): a FK só zera budget_id; não valida nada
  -- (a etapa pode já ter sido apagada na mesma cascata).
  if tg_op = 'UPDATE' and old.budget_id is not null and new.budget_id is null
     and (new.clinic_id, new.patient_id, new.stage_id) is not distinct from (old.clinic_id, old.patient_id, old.stage_id) then
    return new;
  end if;
  select clinic_id into s_clinic from sales_stages where id = new.stage_id;
  if s_clinic is distinct from new.clinic_id then raise exception 'etapa de outra clínica'; end if;
  if new.budget_id is not null then
    select clinic_id, patient_id into b_clinic, b_patient from budgets where id = new.budget_id;
    if b_clinic is distinct from new.clinic_id or b_patient is distinct from new.patient_id then raise exception 'orçamento de outra clínica ou paciente'; end if;
  end if;
  if tg_op = 'UPDATE' then
    -- budget_id só pode ser zerado, e isso já saiu acima junto com a FK.
    if new.clinic_id <> old.clinic_id or new.patient_id <> old.patient_id
       or (new.budget_id is not null and new.budget_id is distinct from old.budget_id) then
      raise exception 'não é possível mudar clínica, paciente ou orçamento da oportunidade';
    end if;
    new.updated_at := now();
    if new.stage_id <> old.stage_id then new.stage_changed_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists opportunities_guard on opportunities;
create trigger opportunities_guard before insert or update on opportunities for each row execute function opportunities_guard();

-- Histórico gravado no servidor: o usuário não escreve nem apaga linhas de criação ou de mudança de etapa.
create or replace function opportunities_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_from text; v_to text;
begin
  select professional_name into v_name from clinic_members
    where clinic_id = new.clinic_id and user_id = auth.uid() and status = 'active' limit 1;
  if tg_op = 'INSERT' then
    insert into opportunity_events (clinic_id, opportunity_id, kind, body, author_id, author_name)
      values (new.clinic_id, new.id, 'system', 'Criou esta oportunidade', auth.uid(), v_name);
  elsif new.stage_id <> old.stage_id then
    select name into v_from from sales_stages where id = old.stage_id;
    select name into v_to from sales_stages where id = new.stage_id;
    insert into opportunity_events (clinic_id, opportunity_id, kind, body, author_id, author_name)
      values (new.clinic_id, new.id, 'stage', coalesce(v_from, '—') || ' → ' || coalesce(v_to, '—'), auth.uid(), v_name);
  end if;
  return null;
end $$;
drop trigger if exists opportunities_log_insert on opportunities;
create trigger opportunities_log_insert after insert on opportunities for each row execute function opportunities_log();
drop trigger if exists opportunities_log_stage on opportunities;
create trigger opportunities_log_stage after update of stage_id on opportunities for each row execute function opportunities_log();

-- Comentário: a oportunidade é da mesma clínica; autor e nome vêm do servidor (não do cliente).
create or replace function opportunity_events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare o_clinic uuid;
begin
  select clinic_id into o_clinic from opportunities where id = new.opportunity_id;
  if o_clinic is distinct from new.clinic_id then raise exception 'oportunidade de outra clínica'; end if;
  if new.kind = 'comment' and auth.uid() is not null then
    new.author_id := auth.uid();
    select professional_name into new.author_name from clinic_members
      where clinic_id = new.clinic_id and user_id = auth.uid() and status = 'active' limit 1;
  end if;
  return new;
end $$;
drop trigger if exists opportunity_events_guard on opportunity_events;
create trigger opportunity_events_guard before insert on opportunity_events for each row execute function opportunity_events_guard();

-- ========== 4. Orçamento -> oportunidade ==========
-- Criado: Em aberto. Autorizado: Ganha. Recusado: Perdida. Roda como dono da função (o usuário que criou
-- o orçamento já passou pela RLS de budgets). Orçamento sem oportunidade (dado antigo) ganha uma ao mudar.

create or replace function sales_sync_budget() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_stage uuid; v_name text;
begin
  perform ensure_sales_stages(new.clinic_id);
  select id into v_stage from sales_stages where clinic_id = new.clinic_id
    and kind = case new.status when 'authorized' then 'won' when 'declined' then 'lost' else 'open' end;
  select professional_name into v_name from clinic_members
    where clinic_id = new.clinic_id and user_id = auth.uid() and status = 'active' limit 1;
  insert into opportunities (clinic_id, patient_id, stage_id, budget_id, title, value_cents, responsible_name, created_at, stage_changed_at)
    values (new.clinic_id, new.patient_id, v_stage, new.id, 'Orçamento de tratamento', new.total_cents, v_name, new.presented_at, now())
  on conflict (budget_id) where budget_id is not null
    do update set stage_id = excluded.stage_id where opportunities.stage_id is distinct from excluded.stage_id;
  return null;
end $$;
drop trigger if exists budgets_sales_sync on budgets;
create trigger budgets_sales_sync after insert on budgets for each row execute function sales_sync_budget();
drop trigger if exists budgets_sales_sync_status on budgets;
create trigger budgets_sales_sync_status after update of status on budgets
  for each row when (old.status is distinct from new.status) execute function sales_sync_budget();

-- ========== 5. Excluir etapa ==========
-- Etapa com cartões só sai se disser para onde eles vão. Roda como o usuário: a RLS vale nos updates.

create or replace function delete_sales_stage(p_stage uuid, p_move_to uuid default null) returns void
language plpgsql security invoker set search_path = public as $$
declare s sales_stages; n integer;
begin
  select * into s from sales_stages where id = p_stage for update;
  if not found then raise exception 'etapa não encontrada'; end if;
  if not can_write(s.clinic_id) or not has_role(s.clinic_id, array['owner']) then raise exception 'sem permissão ou acesso vencido'; end if;
  if s.kind is not null then raise exception 'as etapas padrão não podem ser excluídas'; end if;
  select count(*) into n from opportunities where stage_id = p_stage;
  if n > 0 then
    if p_move_to is null or p_move_to = p_stage
       or not exists (select 1 from sales_stages where id = p_move_to and clinic_id = s.clinic_id) then
      raise exception 'escolha outra etapa para mover os cartões';
    end if;
    update opportunities set stage_id = p_move_to where stage_id = p_stage;
  end if;
  delete from sales_stages where id = p_stage;
end $$;
revoke execute on function delete_sales_stage(uuid, uuid) from public, anon;
grant execute on function delete_sales_stage(uuid, uuid) to authenticated;

-- ========== 6. RLS ==========

alter table sales_stages enable row level security;
drop policy if exists sales_stages_read on sales_stages;
drop policy if exists sales_stages_insert on sales_stages;
drop policy if exists sales_stages_update on sales_stages;
drop policy if exists sales_stages_delete on sales_stages;
create policy sales_stages_read on sales_stages for select using (is_member(clinic_id));
-- Etapas novas são sempre personalizadas (kind nulo); as padrão só nascem pelo servidor.
create policy sales_stages_insert on sales_stages for insert with check (can_write(clinic_id) and has_role(clinic_id, array['owner']) and kind is null);
create policy sales_stages_update on sales_stages for update
  using (can_write(clinic_id) and has_role(clinic_id, array['owner'])) with check (can_write(clinic_id) and has_role(clinic_id, array['owner']));
create policy sales_stages_delete on sales_stages for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']) and kind is null);

alter table opportunities enable row level security;
drop policy if exists opportunities_read on opportunities;
drop policy if exists opportunities_insert on opportunities;
drop policy if exists opportunities_update on opportunities;
drop policy if exists opportunities_delete on opportunities;
create policy opportunities_read on opportunities for select using (is_member(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy opportunities_insert on opportunities for insert with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy opportunities_update on opportunities for update
  using (can_write(clinic_id) and can_see_patient(clinic_id, patient_id)) with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy opportunities_delete on opportunities for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']) and can_see_patient(clinic_id, patient_id));

-- Eventos herdam a visibilidade da oportunidade (o exists roda sob a RLS dela). Sem update nem delete.
alter table opportunity_events enable row level security;
drop policy if exists opportunity_events_read on opportunity_events;
drop policy if exists opportunity_events_insert on opportunity_events;
create policy opportunity_events_read on opportunity_events for select using (
  is_member(clinic_id) and exists (select 1 from opportunities o where o.id = opportunity_events.opportunity_id and o.clinic_id = opportunity_events.clinic_id));
create policy opportunity_events_insert on opportunity_events for insert with check (
  can_write(clinic_id) and kind = 'comment' and author_id = auth.uid()
  and exists (select 1 from opportunities o where o.id = opportunity_events.opportunity_id and o.clinic_id = opportunity_events.clinic_id));

alter table sales_goals enable row level security;
drop policy if exists sales_goals_read on sales_goals;
drop policy if exists sales_goals_insert on sales_goals;
drop policy if exists sales_goals_update on sales_goals;
drop policy if exists sales_goals_delete on sales_goals;
create policy sales_goals_read on sales_goals for select using (is_member(clinic_id));
create policy sales_goals_insert on sales_goals for insert with check (can_write(clinic_id) and has_role(clinic_id, array['owner']));
create policy sales_goals_update on sales_goals for update
  using (can_write(clinic_id) and has_role(clinic_id, array['owner'])) with check (can_write(clinic_id) and has_role(clinic_id, array['owner']));
create policy sales_goals_delete on sales_goals for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']));

-- ========== 7. Dados que já existem ==========
-- Etapas padrão para as clínicas atuais e uma oportunidade para cada orçamento (aberto, aprovado ou recusado).
-- Por último, para o gatilho de histórico registrar a criação.

select ensure_sales_stages(id) from clinics;

insert into opportunities (clinic_id, patient_id, stage_id, budget_id, title, value_cents, created_at, stage_changed_at)
select b.clinic_id, b.patient_id, s.id, b.id, 'Orçamento de tratamento', b.total_cents, b.presented_at, coalesce(b.authorized_at, b.presented_at)
from budgets b
join sales_stages s on s.clinic_id = b.clinic_id and s.kind = case b.status when 'authorized' then 'won' when 'declined' then 'lost' else 'open' end
on conflict do nothing;
