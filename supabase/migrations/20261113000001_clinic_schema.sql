-- Schema inicial: clínica multi-dentista.
-- Dono dos dados = clinic. Usuários entram via clinic_members (papéis).
-- Fonte do desenho: replica/architecture.md (seção "Decisão") e recon-smileo.md.

create extension if not exists pgcrypto;

-- ========== CLÍNICA / EQUIPE / ACESSO ==========

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  timezone text not null default 'America/Sao_Paulo',
  practice_mode text not null default 'shared' check (practice_mode in ('shared','split')),
  work_mode text not null default 'solo' check (work_mode in ('solo','in_clinic','owns_clinic')),
  contact text,
  pdf_color text check (pdf_color is null or pdf_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  active_specialty_ids text[] not null default array['geral','dentistica','endo','perio','cirurgia','protese','implante','orto','odontoped','radio','dtm','estomato'],
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, -- null enquanto convite pendente
  invited_email text,
  role text not null check (role in ('owner','dentist','receptionist','finance')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  professional_name text,
  cro text,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id),
  check (user_id is not null or invited_email is not null)
);
create index on clinic_members (user_id);
create index on clinic_members (lower(invited_email)) where status = 'invited';

create table access_grants (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  plan text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index on access_grants (clinic_id, expires_at desc);

-- Eventos do Stripe já processados (idempotência). Só service role escreve.
create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- ========== FUNÇÕES DE AUTORIZAÇÃO ==========

create or replace function is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clinic_members m where m.clinic_id = c and m.user_id = auth.uid() and m.status = 'active')
$$;

create or replace function has_role(c uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clinic_members m where m.clinic_id = c and m.user_id = auth.uid() and m.status = 'active' and m.role = any(roles))
$$;

-- Acesso pago/teste em vigor? Sem isso, a clínica fica só-leitura (nada é apagado).
create or replace function clinic_active(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from access_grants g where g.clinic_id = c and g.expires_at > now())
$$;

create or replace function can_write(c uuid) returns boolean
language sql stable as $$ select is_member(c) and clinic_active(c) $$;

-- ========== CATÁLOGO DA CLÍNICA ==========
-- Especialidades e procedimentos base ficam no código (catálogo estático, ids texto).

create table custom_procedures (
  id text primary key default ('custom-' || gen_random_uuid()),
  clinic_id uuid not null references clinics(id) on delete cascade,
  specialty_id text not null,
  name text not null check (length(name) between 2 and 120),
  created_at timestamptz not null default now()
);
create index on custom_procedures (clinic_id);

create table procedure_settings (
  clinic_id uuid not null references clinics(id) on delete cascade,
  procedure_id text not null,
  price_cents integer check (price_cents >= 0),
  recall_months smallint check (recall_months between 1 and 60),
  primary key (clinic_id, procedure_id)
);

-- ========== PACIENTES ==========

create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  dentist_id uuid references auth.users(id) on delete set null, -- responsável (modo dividido)
  full_name text not null check (length(full_name) between 1 and 160),
  birth_date date,
  sex text check (sex in ('female','male','other')),
  cpf text check (cpf is null or cpf ~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$'),
  phone text,
  email text,
  address jsonb,
  guardian jsonb,
  referral_source text,
  notes text,
  recall_enabled boolean not null default true,
  last_visit_at date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on patients (clinic_id, full_name);
create index on patients (clinic_id, last_visit_at);
create unique index on patients (clinic_id, cpf) where cpf is not null;

create table patient_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null check (kind in ('created','plan_created','budget_presented','budget_authorized','treatment_done','payment_received','appointment_scheduled')),
  label text not null,
  created_at timestamptz not null default now()
);
create index on patient_events (patient_id, created_at desc);

-- ========== PLANO / ORÇAMENTO / PARCELAS ==========

create table treatment_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  dentist_id uuid references auth.users(id) on delete set null,
  kind text not null default 'adult' check (kind in ('adult','child')),
  validity_days integer not null default 30 check (validity_days between 1 and 365),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  payment_methods text[] not null default '{}',
  notes text,
  status text not null default 'draft' check (status in ('draft','budgeted','authorized')),
  created_at timestamptz not null default now()
);
create index on treatment_plans (clinic_id, patient_id);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  plan_id uuid not null references treatment_plans(id) on delete cascade,
  position smallint not null default 0,
  tooth_fdi smallint check (tooth_fdi between 11 and 85),
  region text check (region in ('upper','lower','both')),
  conditions text[] not null default '{}',
  procedure_id text,
  procedure_name text,
  phase text not null check (phase in ('urgency','oral_prep','rehab','esthetic','maintenance')),
  price_cents integer check (price_cents >= 0),
  quantity smallint not null default 1 check (quantity between 1 and 99)
);
create index on plan_items (plan_id);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  plan_id uuid not null references treatment_plans(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null default 'presented' check (status in ('presented','authorized','declined')),
  authorized_item_ids uuid[] not null default '{}',
  presented_at timestamptz not null default now(),
  authorized_at timestamptz
);
create index on budgets (clinic_id, status);
create index on budgets (patient_id);

create table installments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  budget_id uuid not null references budgets(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  number smallint not null check (number >= 1),
  of_total smallint not null check (of_total >= number),
  due_date date not null,
  amount_cents integer not null check (amount_cents >= 0),
  method text check (method in ('pix','credit','debit','cash','transfer','boleto','other')),
  paid_at date
);
create index on installments (clinic_id, due_date) where paid_at is null;
create index on installments (patient_id);

-- ========== ATENDIMENTOS / DESPESAS ==========

create table treatments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  dentist_id uuid references auth.users(id) on delete set null,
  budget_id uuid references budgets(id) on delete set null,
  plan_item_id uuid references plan_items(id) on delete set null,
  procedure_id text,
  procedure_name text not null,
  performed_at date not null default current_date,
  price_cents integer not null default 0 check (price_cents >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending','received','budget')),
  clinical_status text not null default 'in_progress' check (clinical_status in ('in_progress','done')),
  created_at timestamptz not null default now()
);
create index on treatments (clinic_id, performed_at);
create index on treatments (patient_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  category text not null,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  spent_at date not null,
  recurring boolean not null default false,
  paid boolean not null default true
);
create index on expenses (clinic_id, spent_at);

-- ========== AGENDA ==========
-- Dia e hora no fuso da clínica (clinics.timezone). Uma clínica = um fuso.

create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null,
  dentist_id uuid references auth.users(id) on delete set null,
  title text,
  kind text not null check (kind in ('consultation','return','personal')),
  date date not null,
  time time,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 600),
  status text not null default 'to_confirm' check (status in ('to_confirm','confirmed','done','cancelled','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  check (kind = 'personal' or patient_id is not null)
);
create index on appointments (clinic_id, date);
create index on appointments (patient_id);

create table message_templates (
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('confirmation','recall')),
  body text not null check (length(body) between 5 and 1000),
  primary key (clinic_id, kind)
);

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  period text not null default 'any' check (period in ('morning','afternoon','any')),
  notes text,
  status text not null default 'waiting' check (status in ('waiting','contacted','placed','removed')),
  created_at timestamptz not null default now()
);
create index on waitlist_entries (clinic_id, status);

create table recall_states (
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid primary key references patients(id) on delete cascade,
  status text not null check (status in ('pending','contacted','scheduled','dismissed')),
  due_at date not null,
  updated_at timestamptz not null default now()
);

-- ========== RLS ==========

alter table clinics enable row level security;
create policy clinics_read on clinics for select using (is_member(id));
create policy clinics_update on clinics for update using (has_role(id, array['owner'])) with check (has_role(id, array['owner']));

alter table clinic_members enable row level security;
create policy members_read on clinic_members for select using (is_member(clinic_id) or user_id = auth.uid());
create policy members_owner_write on clinic_members for all using (has_role(clinic_id, array['owner'])) with check (has_role(clinic_id, array['owner']));
-- cada um ajusta o próprio nome/CRO/tema
create policy members_self_update on clinic_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table access_grants enable row level security;
create policy grants_read on access_grants for select using (is_member(clinic_id));

alter table stripe_events enable row level security; -- sem policy: só service role

-- Tabelas clínicas: membro lê; membro com acesso em vigor escreve.
do $$
declare t text;
begin
  foreach t in array array['custom_procedures','procedure_settings','patient_events','treatment_plans','plan_items','budgets',
                           'installments','treatments','appointments','message_templates','waitlist_entries','recall_states']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_member(clinic_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (can_write(clinic_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (can_write(clinic_id)) with check (can_write(clinic_id))', t || '_update', t);
    execute format('create policy %I on %I for delete using (can_write(clinic_id))', t || '_delete', t);
  end loop;
end $$;

-- Pacientes: no modo "dividido", dentista vê só os próprios.
alter table patients enable row level security;
create policy patients_read on patients for select using (
  is_member(clinic_id) and (
    (select practice_mode from clinics c where c.id = clinic_id) = 'shared'
    or not has_role(clinic_id, array['dentist'])
    or dentist_id = auth.uid() or dentist_id is null
  )
);
create policy patients_insert on patients for insert with check (can_write(clinic_id));
create policy patients_update on patients for update using (can_write(clinic_id)) with check (can_write(clinic_id));
create policy patients_delete on patients for delete using (can_write(clinic_id) and has_role(clinic_id, array['owner']));

-- Despesas: só dono e financeiro.
alter table expenses enable row level security;
create policy expenses_read on expenses for select using (has_role(clinic_id, array['owner','finance']));
create policy expenses_write on expenses for all using (can_write(clinic_id) and has_role(clinic_id, array['owner','finance']))
  with check (can_write(clinic_id) and has_role(clinic_id, array['owner','finance']));

-- ========== RPCs (operações de várias linhas, atômicas) ==========

-- Cria a clínica do usuário logado (primeiro acesso) com 14 dias de teste.
create or replace function create_clinic(p_name text, p_professional_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from clinic_members where user_id = auth.uid() and status = 'active') then
    raise exception 'você já pertence a uma clínica';
  end if;
  insert into clinics (name) values (coalesce(nullif(trim(p_name), ''), 'Minha clínica')) returning id into c;
  insert into clinic_members (clinic_id, user_id, role, professional_name) values (c, auth.uid(), 'owner', p_professional_name);
  insert into access_grants (clinic_id, plan, expires_at) values (c, 'Teste', now() + interval '14 days');
  insert into message_templates (clinic_id, kind, body) values
    (c, 'confirmation', 'Olá, {nome}! Passando para confirmar seu horário em {data} às {hora}. Pode responder com SIM para confirmar? 😊'),
    (c, 'recall', 'Oi, {nome}! Já está na hora da sua revisão. Quer que eu reserve um horário para você nesta semana?');
  return c;
end $$;

-- Aceita convites pendentes para o e-mail do usuário logado.
create or replace function claim_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; email text;
begin
  select u.email into email from auth.users u where u.id = auth.uid();
  update clinic_members set user_id = auth.uid(), status = 'active'
    where status = 'invited' and lower(invited_email) = lower(email) and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Plano + itens + orçamento numa transação. items: [{tooth, region, conditions, procedure_id, procedure_name, phase, price_cents, quantity}]
create or replace function create_budget(p_clinic uuid, p_patient uuid, p_kind text, p_validity integer,
  p_discount integer, p_methods text[], p_notes text, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_plan uuid; b uuid; subtotal integer; it jsonb; pos integer := 0;
begin
  if not can_write(p_clinic) then raise exception 'sem permissão ou acesso vencido'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'orçamento sem itens'; end if;
  insert into treatment_plans (clinic_id, patient_id, dentist_id, kind, validity_days, discount_cents, payment_methods, notes, status)
    values (p_clinic, p_patient, auth.uid(), p_kind, p_validity, greatest(p_discount, 0), coalesce(p_methods, '{}'), p_notes, 'budgeted')
    returning id into v_plan;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into plan_items (clinic_id, plan_id, position, tooth_fdi, region, conditions, procedure_id, procedure_name, phase, price_cents, quantity)
    values (p_clinic, v_plan, pos, (it->>'tooth')::smallint, it->>'region',
      coalesce(array(select jsonb_array_elements_text(it->'conditions')), '{}'),
      it->>'procedure_id', it->>'procedure_name', it->>'phase', (it->>'price_cents')::integer, coalesce((it->>'quantity')::smallint, 1));
    pos := pos + 1;
  end loop;
  select coalesce(sum(coalesce(price_cents, 0) * quantity), 0) into subtotal from plan_items where plan_items.plan_id = v_plan;
  insert into budgets (clinic_id, plan_id, patient_id, subtotal_cents, discount_cents, total_cents)
    values (p_clinic, v_plan, p_patient, subtotal, least(greatest(p_discount, 0), subtotal), subtotal - least(greatest(p_discount, 0), subtotal))
    returning id into b;
  insert into patient_events (clinic_id, patient_id, kind, label) values
    (p_clinic, p_patient, 'plan_created', 'Plano de tratamento montado'),
    (p_clinic, p_patient, 'budget_presented', 'Orçamento apresentado');
  return b;
end $$;

-- Aprova (total ou parcial), cria atendimentos e parcelas.
create or replace function authorize_budget(p_budget uuid, p_item_ids uuid[], p_installments integer,
  p_first_due date, p_method text, p_paid_now boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare b budgets; n integer := greatest(1, least(24, p_installments)); chosen_sub integer; all_sub integer;
  total integer; base integer; i integer; chosen_count integer; all_count integer;
begin
  select * into b from budgets where id = p_budget for update;
  if not found then raise exception 'orçamento não encontrado'; end if;
  if not can_write(b.clinic_id) then raise exception 'sem permissão ou acesso vencido'; end if;
  if b.status <> 'presented' then raise exception 'orçamento já respondido'; end if;
  select coalesce(sum(coalesce(price_cents,0)*quantity),0), count(*) into all_sub, all_count from plan_items where plan_id = b.plan_id;
  select coalesce(sum(coalesce(price_cents,0)*quantity),0), count(*) into chosen_sub, chosen_count
    from plan_items where plan_id = b.plan_id and id = any(p_item_ids);
  if chosen_count = 0 then raise exception 'escolha pelo menos um item'; end if;
  total := chosen_sub - case when all_sub > 0 then round(b.discount_cents::numeric * chosen_sub / all_sub)::integer else 0 end;

  update budgets set status = 'authorized', authorized_item_ids = p_item_ids, authorized_at = now() where id = p_budget;
  update treatment_plans set status = 'authorized' where id = b.plan_id;

  insert into treatments (clinic_id, patient_id, dentist_id, budget_id, plan_item_id, procedure_id, procedure_name, price_cents, payment_status, clinical_status)
  select b.clinic_id, b.patient_id, auth.uid(), b.id, pi.id, pi.procedure_id,
    coalesce(pi.procedure_name, 'Procedimento')
      || case when pi.tooth_fdi is not null then ' · dente ' || pi.tooth_fdi
              when pi.region = 'upper' then ' · arcada superior' when pi.region = 'lower' then ' · arcada inferior'
              when pi.region = 'both' then ' · ambas as arcadas' else '' end
      || case when pi.quantity > 1 then ' (×' || pi.quantity || ')' else '' end,
    coalesce(pi.price_cents, 0) * pi.quantity, 'budget', 'in_progress'
  from plan_items pi where pi.plan_id = b.plan_id and pi.id = any(p_item_ids);

  base := total / n;
  for i in 1..n loop
    insert into installments (clinic_id, budget_id, patient_id, number, of_total, due_date, amount_cents, method, paid_at)
    values (b.clinic_id, b.id, b.patient_id, i, n, (p_first_due + make_interval(months => i - 1))::date,
      case when i = n then total - base * (n - 1) else base end, p_method,
      case when p_paid_now and i = 1 then current_date else null end);
  end loop;

  insert into patient_events (clinic_id, patient_id, kind, label) values (b.clinic_id, b.patient_id, 'budget_authorized',
    case when chosen_count = all_count then 'Orçamento aprovado' else 'Orçamento aprovado em parte (' || chosen_count || ' de ' || all_count || ' itens)' end
    || case when n > 1 then ' em ' || n || 'x' else '' end);
end $$;

-- Soma um período de acesso (compra ou renovação). Chamado só pelo webhook (service role).
create or replace function grant_access(p_clinic uuid, p_plan text, p_days integer, p_session text)
returns void language plpgsql security definer set search_path = public as $$
declare start_at timestamptz;
begin
  select greatest(now(), coalesce(max(expires_at), now())) into start_at from access_grants where clinic_id = p_clinic;
  insert into access_grants (clinic_id, plan, starts_at, expires_at, stripe_checkout_session_id)
    values (p_clinic, p_plan, start_at, start_at + make_interval(days => p_days), p_session)
    on conflict (stripe_checkout_session_id) do nothing;
end $$;
revoke execute on function grant_access(uuid, text, integer, text) from public, anon, authenticated;

-- updated_at automático
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger clinics_touch before update on clinics for each row execute function touch_updated_at();
create trigger patients_touch before update on patients for each row execute function touch_updated_at();
