-- Adianta Odonto clone — schema inicial (migration 0001)
-- Ver replica/architecture.md para o raciocínio por trás de cada escolha.

create extension if not exists pgcrypto;

-- ========== CONTA / ACESSO ==========

create table accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  professional_name text,
  cro text,
  work_mode text not null default 'solo'
    check (work_mode in ('solo','in_clinic','owns_clinic')),
  contact_phone text,
  contact_address text,
  pdf_logo_url text,
  pdf_color text,
  pdf_font text,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table access_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  plan text not null default 'essential' check (plan in ('essential')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now()
);
create index on access_grants (account_id, expires_at desc);

-- ========== CATÁLOGO ==========

create table specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table account_specialties (
  account_id uuid not null references accounts(id) on delete cascade,
  specialty_id uuid not null references specialties(id) on delete cascade,
  active boolean not null default true,
  primary key (account_id, specialty_id)
);

create table procedures (
  id uuid primary key default gen_random_uuid(),
  specialty_id uuid not null references specialties(id) on delete restrict,
  name text not null,
  is_global boolean not null default true,
  owner_id uuid references accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on procedures (specialty_id);
create index on procedures (owner_id);

create table procedure_prices (
  account_id uuid not null references accounts(id) on delete cascade,
  procedure_id uuid not null references procedures(id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  primary key (account_id, procedure_id)
);

-- ========== PACIENTES ==========

create table patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  full_name text not null,
  birth_date date,
  sex text check (sex in ('female','male','other')),
  cpf text,
  phone text,
  email text,
  address jsonb,
  guardian jsonb,
  referral_source text,
  notes text,
  recall_enabled boolean not null default true,
  last_visit_at timestamptz,
  deleted_at timestamptz, -- soft delete (LGPD) em vez de apagar histórico financeiro
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on patients (owner_id, full_name);
create index on patients (owner_id, last_visit_at);
create unique index on patients (owner_id, cpf) where cpf is not null;

create table patient_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null check (kind in
    ('created','plan_created','budget_presented','budget_authorized',
     'treatment_done','payment_received','appointment_scheduled','note')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on patient_events (patient_id, created_at desc);

-- ========== ODONTOGRAMA / PLANO / ORÇAMENTO ==========

create table treatment_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null default 'adult' check (kind in ('adult','child')),
  validity_days integer not null default 30,
  status text not null default 'draft'
    check (status in ('draft','budgeted','authorized','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on treatment_plans (owner_id, patient_id);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references treatment_plans(id) on delete cascade,
  tooth_fdi smallint check (tooth_fdi between 11 and 85), -- 11-48 permanente, 51-85 decídua
  conditions text[] not null default '{}',
  procedure_id uuid references procedures(id) on delete set null,
  custom_procedure_name text,
  phase text not null default 'urgency'
    check (phase in ('urgency','oral_prep','rehab','esthetic','maintenance')),
  price_cents integer,
  created_at timestamptz not null default now()
);
create index on plan_items (plan_id);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references treatment_plans(id) on delete cascade,
  owner_id uuid not null references accounts(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  total_cents integer not null default 0,
  status text not null default 'presented'
    check (status in ('presented','authorized','declined')),
  pdf_url text,
  presented_at timestamptz not null default now(),
  authorized_at timestamptz,
  created_at timestamptz not null default now()
);
create index on budgets (owner_id, status);
create index on budgets (patient_id);

create table budget_item_authorizations (
  budget_id uuid not null references budgets(id) on delete cascade,
  plan_item_id uuid not null references plan_items(id) on delete cascade,
  authorized boolean not null default false,
  primary key (budget_id, plan_item_id)
);

-- ========== ATENDIMENTOS / FINANCEIRO ==========

create table treatments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  budget_id uuid references budgets(id) on delete set null,
  plan_item_id uuid references plan_items(id) on delete set null,
  procedure_name text not null,
  performed_at date not null default current_date,
  price_cents integer not null default 0,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','received')),
  clinical_status text not null default 'in_progress'
    check (clinical_status in ('in_progress','done')),
  created_at timestamptz not null default now()
);
create index on treatments (owner_id, performed_at);
create index on treatments (patient_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  category text not null,
  amount_cents integer not null check (amount_cents >= 0),
  spent_at date not null default current_date,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);
create index on expenses (owner_id, spent_at);

-- ========== AGENDA ==========

create table appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null,
  kind text not null check (kind in ('consultation','return','personal')),
  starts_at timestamptz,
  duration_minutes integer not null default 30,
  status text not null default 'to_confirm'
    check (status in ('to_confirm','confirmed','done','cancelled','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on appointments (owner_id, starts_at);
create index on appointments (patient_id);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('confirmation','recall')),
  body text not null,
  created_at timestamptz not null default now()
);

create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email')),
  kind text not null check (kind in ('confirmation_reminder','recall')),
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notification_queue (status, scheduled_for);

-- ========== RLS ==========

create or replace function auth_account_id() returns uuid
language sql stable as $$
  select id from accounts where auth_user_id = auth.uid()
$$;

alter table accounts enable row level security;
create policy accounts_self on accounts
  using (auth_user_id = auth.uid());

alter table access_grants enable row level security;
create policy access_grants_owner on access_grants
  using (account_id = auth_account_id());

alter table account_specialties enable row level security;
create policy account_specialties_owner on account_specialties
  using (account_id = auth_account_id());

alter table procedure_prices enable row level security;
create policy procedure_prices_owner on procedure_prices
  using (account_id = auth_account_id());

alter table patients enable row level security;
create policy patients_owner on patients
  using (owner_id = auth_account_id());

alter table patient_events enable row level security;
create policy patient_events_owner on patient_events
  using (patient_id in (select id from patients where owner_id = auth_account_id()));

alter table treatment_plans enable row level security;
create policy treatment_plans_owner on treatment_plans
  using (owner_id = auth_account_id());

alter table plan_items enable row level security;
create policy plan_items_owner on plan_items
  using (plan_id in (select id from treatment_plans where owner_id = auth_account_id()));

alter table budgets enable row level security;
create policy budgets_owner on budgets
  using (owner_id = auth_account_id());

alter table budget_item_authorizations enable row level security;
create policy budget_item_authorizations_owner on budget_item_authorizations
  using (budget_id in (select id from budgets where owner_id = auth_account_id()));

alter table treatments enable row level security;
create policy treatments_owner on treatments
  using (owner_id = auth_account_id());

alter table expenses enable row level security;
create policy expenses_owner on expenses
  using (owner_id = auth_account_id());

alter table appointments enable row level security;
create policy appointments_owner on appointments
  using (owner_id = auth_account_id());

alter table message_templates enable row level security;
create policy message_templates_owner on message_templates
  using (owner_id = auth_account_id());

alter table notification_queue enable row level security;
create policy notification_queue_owner on notification_queue
  using (owner_id = auth_account_id());

-- specialties e procedures globais (is_global = true) ficam sem RLS de
-- escrita para o usuário comum: leitura liberada, escrita só via service role.
alter table specialties enable row level security;
create policy specialties_read on specialties for select using (true);

alter table procedures enable row level security;
create policy procedures_read on procedures for select
  using (is_global = true or owner_id = auth_account_id());
create policy procedures_write_own on procedures for insert
  with check (is_global = false and owner_id = auth_account_id());
