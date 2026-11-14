-- Onda B (parcial): evolução clínica e anamnese (modelos + fichas preenchidas).
-- Dados clínicos são sensíveis (LGPD): leitura só para membro ativo da clínica;
-- escrita só com acesso em vigor (can_write). No modo "dividido", o dentista só
-- enxerga registros dos pacientes que ele próprio enxerga (a RLS de `patients`
-- vale dentro do `exists` abaixo, pois a consulta roda como o usuário).
-- Não altera nada do esquema anterior.

-- ========== EVOLUÇÃO CLÍNICA ==========

create table clinical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  treatment_id uuid references treatments(id) on delete set null, -- atendimento ao qual a nota se liga (opcional)
  note_date date not null default current_date,
  body text not null check (length(btrim(body)) between 1 and 10000),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on clinical_notes (patient_id, note_date desc);
create index on clinical_notes (clinic_id);
create index on clinical_notes (treatment_id) where treatment_id is not null;

-- ========== ANAMNESE ==========

-- Modelo editável: lista de perguntas em jsonb [{id, text, kind: 'yesno'|'text', alert?: boolean}].
create table anamnesis_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 100),
  created_at timestamptz not null default now()
);
create index on anamnesis_templates (clinic_id);

-- Ficha preenchida. Guarda cópia do texto das perguntas: editar ou apagar o
-- modelo depois não muda o que o paciente respondeu.
create table anamnesis_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  template_id uuid references anamnesis_templates(id) on delete set null,
  template_name text not null check (length(template_name) between 1 and 120),
  answers jsonb not null default '[]' check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 100),
  filled_on date not null default current_date,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on anamnesis_records (patient_id, filled_on desc);
create index on anamnesis_records (clinic_id);

-- ========== RLS ==========

alter table clinical_notes enable row level security;
create policy clinical_notes_read on clinical_notes for select using (
  is_member(clinic_id)
  and exists (select 1 from patients p where p.id = clinical_notes.patient_id and p.clinic_id = clinical_notes.clinic_id)
);
create policy clinical_notes_insert on clinical_notes for insert with check (
  can_write(clinic_id)
  and exists (select 1 from patients p where p.id = clinical_notes.patient_id and p.clinic_id = clinical_notes.clinic_id)
  and (treatment_id is null or exists (select 1 from treatments t where t.id = clinical_notes.treatment_id and t.patient_id = clinical_notes.patient_id))
);
create policy clinical_notes_update on clinical_notes for update
  using (can_write(clinic_id) and exists (select 1 from patients p where p.id = clinical_notes.patient_id and p.clinic_id = clinical_notes.clinic_id))
  with check (
    can_write(clinic_id)
    and exists (select 1 from patients p where p.id = clinical_notes.patient_id and p.clinic_id = clinical_notes.clinic_id)
    and (treatment_id is null or exists (select 1 from treatments t where t.id = clinical_notes.treatment_id and t.patient_id = clinical_notes.patient_id))
  );
create policy clinical_notes_delete on clinical_notes for delete using (
  can_write(clinic_id)
  and exists (select 1 from patients p where p.id = clinical_notes.patient_id and p.clinic_id = clinical_notes.clinic_id)
);

alter table anamnesis_records enable row level security;
create policy anamnesis_records_read on anamnesis_records for select using (
  is_member(clinic_id)
  and exists (select 1 from patients p where p.id = anamnesis_records.patient_id and p.clinic_id = anamnesis_records.clinic_id)
);
create policy anamnesis_records_insert on anamnesis_records for insert with check (
  can_write(clinic_id)
  and exists (select 1 from patients p where p.id = anamnesis_records.patient_id and p.clinic_id = anamnesis_records.clinic_id)
);
create policy anamnesis_records_update on anamnesis_records for update
  using (can_write(clinic_id) and exists (select 1 from patients p where p.id = anamnesis_records.patient_id and p.clinic_id = anamnesis_records.clinic_id))
  with check (can_write(clinic_id) and exists (select 1 from patients p where p.id = anamnesis_records.patient_id and p.clinic_id = anamnesis_records.clinic_id));
create policy anamnesis_records_delete on anamnesis_records for delete using (
  can_write(clinic_id)
  and exists (select 1 from patients p where p.id = anamnesis_records.patient_id and p.clinic_id = anamnesis_records.clinic_id)
);

-- Modelos não ligam a paciente: mesmo padrão das demais tabelas da clínica.
alter table anamnesis_templates enable row level security;
create policy anamnesis_templates_read on anamnesis_templates for select using (is_member(clinic_id));
create policy anamnesis_templates_insert on anamnesis_templates for insert with check (can_write(clinic_id));
create policy anamnesis_templates_update on anamnesis_templates for update using (can_write(clinic_id)) with check (can_write(clinic_id));
create policy anamnesis_templates_delete on anamnesis_templates for delete using (can_write(clinic_id));
