# Arquitetura — clone do Adianta Odonto

Lido: `replica/recon.md` (16 telas, 5 fluxos, 10 entidades) e `replica/features.csv`
(53 linhas). Este documento escolhe a stack, desenha o schema e a API, aponta onde
vai doer, e ordena o build.

## Passo 1 — Stack

| camada | escolha | por quê |
| --- | --- | --- |
| web app | Next.js (App Router) + TypeScript | único app, server actions cobrem CRUD sem precisar de um backend separado; bom suporte a PWA (o original só roda como PWA, sem app nativo) |
| styling | Tailwind + tokens do replica-design | consistência rápida; odontograma e cards de KPI viram componentes reutilizáveis |
| mobile | nenhum nativo no MVP — PWA instalável | o original também não tem app nativo; instalar como PWA cobre "usar no celular" sem o custo de Expo agora |
| banco | Postgres no Supabase | RLS nativo por linha é exatamente o que precisamos (cada dentista só vê seus próprios pacientes); auth e storage no mesmo lugar |
| ORM | Drizzle | migrations como código, tipagem forte, sem magia escondida — schema abaixo é a fonte da verdade |
| auth | Supabase Auth (e-mail+senha, com OTP de 6 dígitos para verificação) | o original usa exatamente esse padrão (e-mail da compra + código de 6 dígitos); Supabase Auth faz isso de fábrica |
| pagamentos | Stripe Checkout em **modo pagamento único** (não Billing/assinatura) | o original vende acesso anual avulso, sem cobrança recorrente — é um diferencial de produto (menos reclamação tipo "cobrança após cancelamento"); Stripe Checkout one-time + um campo `access_expires_at` resolve sem complexidade de assinatura |
| mensageria | WhatsApp Cloud API (Meta) para confirmação/recall; Resend para e-mail transacional (boas-vindas, recibo de compra) | o original depende 100% de WhatsApp para confirmação e recall — não dá para clonar o core loop de agenda sem isso |
| jobs | Vercel Cron (diário) + fila simples via Supabase (tabela `notification_queue`) | só precisamos de "rodar 1x por dia: quem confirma em 48h, quem sumiu há 30/365 dias" — não justifica Inngest/Trigger.dev ainda |
| arquivos | Supabase Storage | logo do dentista (para o PDF), foto de paciente (opcional) |
| geração de PDF | `@react-pdf/renderer` rodando em server action/route handler | gera o orçamento com a identidade do dentista (logo/cor/fonte), sem depender de serviço externo |
| hosting | Vercel | deploy do Next.js sem fricção, cron nativo |

Um banco só. Sem microsserviço. O clone precisa das features do original, não da
arquitetura dele (que nem conhecemos — é caixa-preta).

## Passo 2 — Schema

Multi-tenant por `owner_id` (o dentista dono da conta — equivale ao "você" do
original). Todo o resto do schema é escopado por `owner_id`, com RLS no Supabase
garantindo que um dentista nunca lê dado de outro. Datas em `timestamptz` (UTC).
Dinheiro em centavos (`integer`) + moeda fixa `BRL` por enquanto.

```sql
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
  stripe_checkout_session_id text,
  created_at timestamptz not null default now()
);
create index on access_grants (account_id, expires_at desc);
-- acesso ativo = existe um access_grant com expires_at > now() (soma dos
-- períodos, como o original: "o ano novo é somado ao que faltava")
-- pós-vencimento: o app fica read-only, nunca apaga dado (regra de produto,
-- não de schema -- ver "Passo 4").

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
  is_global boolean not null default true, -- catálogo padrão vs. criado pelo dentista
  owner_id uuid references accounts(id) on delete cascade, -- null se global
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
  phone text, -- WhatsApp
  email text,
  address jsonb,          -- {cep, street, number, complement, neighborhood, city, uf}
  guardian jsonb,         -- {name, phone, relationship} -- paciente menor
  referral_source text,   -- "como chegou"
  notes text,
  recall_enabled boolean not null default true, -- "lembrar quando sumir"
  last_visit_at timestamptz,
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
  tooth_fdi smallint check (tooth_fdi between 11 and 48),
  conditions text[] not null default '{}', -- enum abaixo, multi-valor
  procedure_id uuid references procedures(id) on delete set null,
  custom_procedure_name text, -- se não achou no catálogo
  phase text not null default 'urgency'
    check (phase in ('urgency','oral_prep','rehab','esthetic','maintenance')),
  price_cents integer, -- null = "a definir"
  created_at timestamptz not null default now()
);
create index on plan_items (plan_id);
-- conditions válidas: healthy, erupting, decayed, failed_restoration, fractured,
-- mobile, restored, has_endodontics, has_prosthesis, implant, impacted, missing
-- (checar em app, não em CHECK, por ser array)

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

-- autorização parcial (achado do recon: "a paciente aprovou só uma parte")
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
  budget_id uuid references budgets(id) on delete set null, -- null = avulso
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
  patient_id uuid references patients(id) on delete set null, -- null = "Pessoal"
  kind text not null check (kind in ('consultation','return','personal')),
  starts_at timestamptz, -- null = "horário a definir"
  duration_minutes integer not null default 30,
  status text not null default 'to_confirm'
    check (status in ('to_confirm','confirmed','done','cancelled','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on appointments (owner_id, starts_at);
create index on appointments (patient_id);
-- 1 dentista não pode ter 2 compromissos reais sobrepostos: checado na app
-- layer (exclusion constraint exigiria starts_at/ends_at não-nulos, e o
-- original permite "horário a definir" -- por isso a trava fica em código).

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
```

**Regras de acesso:** Row Level Security no Supabase em toda tabela com `owner_id`
(ou `account_id`): `using (owner_id = auth_account_id())`, onde
`auth_account_id()` é uma função SQL que resolve `auth.uid()` → `accounts.id`.
Tabelas de catálogo global (`specialties`, `procedures` com `is_global = true`)
são de leitura pública para qualquer conta autenticada e só graváveis por um
job de seed/admin.

## Passo 3 — API (server actions / route handlers)

| rota | o que faz | quem chama | input | output | fluxo |
| --- | --- | --- | --- | --- | --- |
| `POST /api/auth/otp` | envia código de 6 dígitos por e-mail | não autenticado | `{email}` | `{ok}` | login |
| `POST /api/auth/verify` | valida código, cria sessão | não autenticado | `{email, code}` | `{session}` | login |
| `patients.create` | cria paciente (só nome obrigatório) | dentista dono | `PatientInput` | `Patient` | F01, S05 |
| `patients.update` | edita ficha | dono | `Partial<PatientInput>` | `Patient` | S06 |
| `patients.import` | importa planilha CSV/XLSX | dono | arquivo | `{created, skipped, errors[]}` | F05 |
| `patients.list` | lista com contadores (em tratamento, orçamento aberto, etc.) | dono | filtros | `Patient[] + counts` | S05 |
| `plans.create` / `plans.update` | monta/edita odontograma e itens | dono | `PlanInput` | `TreatmentPlan` | F01, S02 |
| `plans.saveAsBudget` | vira o plano em orçamento | dono | `planId` | `Budget` | F01 |
| `budgets.generatePdf` | gera PDF com marca do dentista | dono | `budgetId` | `{pdfUrl}` | F01, S03 |
| `budgets.sendWhatsapp` | manda link do orçamento por WhatsApp | dono | `budgetId` | `{sent}` | F01 |
| `budgets.authorize` | autoriza total ou por item | dono | `{budgetId, itemIds?}` | `Budget` | F01 |
| `treatments.log` | lança atendimento (com ou sem orçamento) | dono | `TreatmentInput` | `Treatment` | S04 |
| `appointments.create/update` | agenda compromisso | dono | `AppointmentInput` | `Appointment` | F02, S07 |
| `appointments.confirm` | marca confirmado + dispara mensagem | dono | `appointmentId` | `Appointment` | S08 |
| `recall.list` | pacientes sumidos (30-364d, 1a+) | dono | `{bucket}` | `Patient[]` | F03, S09 |
| `finance.summary` | KPIs do mês (entrou/saiu/saldo/a receber) | dono | `{month, year}` | `FinanceSummary` | S01, S10 |
| `expenses.create` | lança gasto | dono | `ExpenseInput` | `Expense` | S10/S11 |
| `catalog.listProcedures` | busca procedimento por especialidade/termo | dono | `{query, specialtyId}` | `Procedure[]` | S02, S12 |
| `catalog.createCustomProcedure` | "+Criar um procedimento meu" | dono | `{name, specialtyId}` | `Procedure` | S02 |
| `pricing.setDefault` | define valor padrão de um procedimento | dono | `{procedureId, priceCents}` | ok | S12 |
| `account.updateProfile` | perfil profissional, PDF, tema | dono | `ProfileInput` | `Account` | S13 |
| `billing.createCheckout` | inicia Stripe Checkout (pagamento único) | não autenticado ou dono (renovação) | `{email}` | `{checkoutUrl}` | compra/renovação |

**Webhooks de entrada:** `POST /api/webhooks/stripe` (checkout completado → cria/
estende `access_grants`, idempotente por `stripe_checkout_session_id`).
**Webhooks de saída:** nenhum (não expomos API pública no MVP).

**Jobs agendados (Vercel Cron, diário):**
- `enqueue-confirmations`: compromissos nas próximas 48-72h sem confirmação →
  insere em `notification_queue`.
- `enqueue-recalls`: pacientes com `last_visit_at` cruzando 30 dias ou 365 dias
  e `recall_enabled = true` → insere em `notification_queue`.
- `send-queue`: processa `notification_queue` pendente via WhatsApp Cloud API.
- `expire-access`: não apaga nada — só é consultado sob demanda (acesso ativo =
  `exists access_grants where expires_at > now()`), sem job necessário.

## Passo 4 — O que vai doer

- **WhatsApp Cloud API:** exige número comercial verificado na Meta e templates
  de mensagem pré-aprovados para enviar fora da janela de 24h (confirmação e
  recall quase sempre estão fora dessa janela). Planejar aprovação de template
  com antecedência — é o maior risco de cronograma do MVP.
- **Fuso horário:** `starts_at` em UTC, mas toda exibição/filtro de "hoje",
  "próximos 7 dias", "30-364 dias sem vir" precisa converter para o fuso do
  dentista (`America/Sao_Paulo` fixo no MVP, configurável depois).
  Horário de verão não existe mais no Brasil desde 2019 — simplifica.
- **Idempotência do webhook do Stripe:** checkout pode notificar mais de uma
  vez; `stripe_checkout_session_id` único em `access_grants` evita duplicar
  acesso.
- **Concorrência na agenda:** dois cliques quase simultâneos no mesmo horário
  não têm exclusion constraint no banco (porque `starts_at` pode ser nulo);
  checar conflito na server action com `select ... for update` antes de
  inserir, e aceitar que é "best effort" como o original aparenta ser.
- **Upload de planilha de pacientes (importação):** CPF duplicado, telefone em
  formatos variados, encoding de CSV — validar linha a linha e devolver um
  relatório de erros, nunca falhar a importação inteira por uma linha ruim.
- **Geração de PDF:** `@react-pdf/renderer` em serverless tem cold start; cachear
  o PDF gerado (`budgets.pdf_url`) e só regenerar se o orçamento mudar.
- **Multi-tenancy:** todo query novo precisa lembrar do `owner_id` — RLS no
  Postgres é a rede de segurança, mas a aplicação também deve filtrar
  explicitamente (defesa em profundidade; nunca confiar só na RLS numa rota
  nova sem testar).
- **LGPD / exclusão de dados:** paciente pode pedir exclusão; como `patient_events`,
  `treatments` etc. têm `on delete cascade` em `patient_id`, apagar o paciente
  já cobre o essencial — mas isso contradiz a regra do original de nunca apagar
  nada automaticamente. Decisão de produto a confirmar antes do launch: soft-delete
  (`deleted_at`) em `patients` em vez de cascade físico, para manter histórico
  financeiro consistente mesmo após solicitação de exclusão de dados pessoais.

## Passo 5 — Ordem de build

**1. Vertical slice (prova a stack)**
- Telas: S05 (criar paciente, só nome), S02 (odontograma simplificado: marcar
  1 dente, 1 procedimento, 1 valor), S03 (virar orçamento), S04 (lançar
  atendimento), S10 (ver o valor cair no financeiro).
- Tabelas: `accounts`, `patients`, `specialties`, `procedures`, `treatment_plans`,
  `plan_items`, `budgets`, `treatments`.
- Rotas: `patients.create`, `plans.create`, `plans.saveAsBudget`,
  `budgets.authorize`, `treatments.log`, `finance.summary`.
- Critério de pronto: cadastrar paciente → montar plano → virar orçamento →
  autorizar → lançar atendimento → ver R$ aparecer no financeiro, de ponta a
  ponta, feio mas funcionando.

**2. Must-haves (por área, direto do features.csv)**
- Clínico: condições completas do dente (12 estados), fases do plano,
  "+Criar procedimento meu", busca com "mais usados".
- Orçamento: PDF com marca própria, envio por WhatsApp, lista com abas.
- Atendimento: filtros por estado clínico/pagamento/período.
- Pacientes: ficha 360°, cadastro completo (CEP, responsável), CRM com
  contadores.
- Agenda: criar compromisso, aba Confirmar com WhatsApp, aba Retornos/recall.
- Financeiro: gráfico entrada×saída, lançamento de gastos.
- Tabela de preços: catálogo completo, valor padrão por procedimento.
- Conta: perfil profissional, Stripe Checkout (pagamento único), acesso
  read-only pós-vencimento.

**3. Should-haves**
- Onboarding guiado, importação de planilha, exportar pacientes, editor de
  frases prontas, personalização de PDF (cor/fonte), ativar/desativar
  especialidades, autorização parcial de orçamento, múltiplos planos por
  paciente ("plano B"), toggle "marcar próxima consulta" a partir do
  atendimento, aniversariantes do mês.

**4. Could-haves**
- Tema claro/escuro, PWA "usar como aplicativo" (polish), garantia de 7 dias
  (fluxo de reembolso via Stripe).

**5. Fixes do replica-entrepreneur**, quando essa etapa rodar.

## Resumo

- **Stack:** Next.js + TypeScript + Tailwind + Supabase (Postgres/Auth/Storage)
  + Drizzle + Stripe Checkout (pagamento único) + WhatsApp Cloud API, tudo na
  Vercel.
- **Tabelas:** 17.
- **Rotas/ações:** 24 (+ 1 webhook de entrada, 4 jobs agendados).
- **As três partes mais arriscadas:** aprovação de template e janela de 24h da
  WhatsApp Cloud API; concorrência de horário na agenda sem exclusion
  constraint; decisão de produto entre "nunca apagar" (como o original) e
  LGPD (soft-delete em vez de cascade físico).
- **Próximo passo:** `/replica-design`.

## Decisão (2026-11-13): o sistema atende clínicas

O usuário confirmou que o produto vai atender **clínicas com vários
dentistas**, não só o consultório solo. Antes do primeiro deploy do banco
(`/replica-backend`), o schema acima muda:

- nova tabela `clinics` (nome, logo, fuso, `practice_mode` shared|split) e
  `clinic_members` (user, papel owner|dentist|receptionist|finance, status, convite);
- `owner_id` → `clinic_id` em todas as tabelas de dados; `dentist_id` em
  `appointments`, `budgets`, `treatments`;
- RLS passa a checar "é membro ativo da clínica" + permissões por papel; no
  modo `split`, dentista só vê os próprios pacientes;
- `access_grants` passa a pertencer à clínica (plano por número de dentistas).

Novas tabelas já usadas pela camada falsa (onda A do Smileo): `installments`,
`waitlist_entries`, `recall_states`, `procedure_recall_months`; campos novos:
`plan_items.quantity/region`, `treatment_plans.discount_cents/payment_methods/notes`,
`expenses.paid`, `patients.archived_at`. Detalhes em `recon-smileo.md`.
