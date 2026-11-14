-- Onda B1: documentos simples (receita e atestado), medicamentos por clínica,
-- modelos de receita e dados profissionais (CRO/UF/CPF/nascimento) do membro.
-- Não altera migrations anteriores, exceto por substituir a RPC update_my_profile
-- (a assinatura antiga de 3 parâmetros é removida; a nova mantém a mesma regra:
-- só nome, CRO, UF, CPF, nascimento e tema; nunca papel, status ou clinic_id).
--
-- Os documentos são MINUTAS: o texto e a conformidade (CFO, vigilância sanitária)
-- são responsabilidade do profissional e da clínica. Nenhuma receita de controle
-- especial válida é gerada: "controlado" só sinaliza.
-- Não há storage nem assinatura digital nesta migration.

-- ========== 1. Perfil profissional do membro ==========

alter table clinic_members
  add column cro_uf text check (cro_uf is null or cro_uf in
    ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  add column cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  add column birth_date date check (birth_date is null or birth_date between date '1900-01-01' and current_date);

drop function if exists update_my_profile(text, text, text);
create or replace function update_my_profile(
  p_professional_name text, p_cro text, p_theme text,
  p_cro_uf text default null, p_cpf text default null, p_birth_date date default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if length(coalesce(p_professional_name, '')) > 120 or length(coalesce(p_cro, '')) > 40 then
    raise exception 'nome ou CRO longo demais';
  end if;
  -- CPF, UF e nascimento inválidos caem nos CHECKs da tabela (erro 23514).
  update clinic_members
     set professional_name = p_professional_name, cro = p_cro, theme = coalesce(p_theme, theme),
         cro_uf = nullif(btrim(p_cro_uf), ''), cpf = v_cpf, birth_date = p_birth_date
   where user_id = auth.uid() and status = 'active';
end $$;
revoke execute on function update_my_profile(text, text, text, text, text, date) from public, anon;
grant execute on function update_my_profile(text, text, text, text, text, date) to authenticated;

-- ========== 2. Medicamentos da clínica ==========
-- Começa VAZIA: só entram nomes que a própria clínica usou numa receita.
-- Sem dado de paciente, por isso não depende de can_see_patient.

create table medications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  route text not null default 'internal' check (route in ('internal','external')),
  controlled boolean not null default false,
  unit text check (unit is null or length(btrim(unit)) between 1 and 30),
  default_posology text check (default_posology is null or length(default_posology) <= 500),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index medications_clinic_name_uq on medications (clinic_id, (lower(btrim(name))));

-- ========== 3. Receita simples ==========
-- Guarda cópia (snapshot) do nome/CRO/UF do profissional no momento da emissão:
-- o documento não muda se o perfil mudar depois, e não precisamos ler a linha de outro membro.

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid references auth.users(id) on delete set null default auth.uid(),
  professional_name text check (professional_name is null or length(professional_name) <= 120),
  professional_cro text check (professional_cro is null or length(professional_cro) <= 40),
  professional_cro_uf text check (professional_cro_uf is null or length(professional_cro_uf) = 2),
  issued_on date not null default current_date,
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on prescriptions (patient_id, issued_on desc);
create index on prescriptions (clinic_id);

create table prescription_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  position integer not null default 0,
  medication_id uuid references medications(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  quantity numeric(8,2) check (quantity is null or quantity > 0),
  unit text check (unit is null or length(btrim(unit)) between 1 and 30),
  posology text not null check (length(btrim(posology)) between 1 and 500),
  route text not null default 'internal' check (route in ('internal','external')),
  controlled boolean not null default false
);
create index on prescription_items (prescription_id, position);
create index on prescription_items (clinic_id);
create index on prescription_items (medication_id) where medication_id is not null;

create table prescription_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  -- [{name, quantity, unit, posology, route, controlled}]; sem dado de paciente
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index prescription_templates_clinic_name_uq on prescription_templates (clinic_id, (lower(btrim(name))));

-- ========== 4. Atestado ==========
-- O CID é dado de saúde sensível e só entra com consentimento do paciente (cid_consent).

create table certificates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid references auth.users(id) on delete set null default auth.uid(),
  professional_name text check (professional_name is null or length(professional_name) <= 120),
  professional_cro text check (professional_cro is null or length(professional_cro) <= 40),
  professional_cro_uf text check (professional_cro_uf is null or length(professional_cro_uf) = 2),
  issued_on date not null default current_date,
  starts_on date not null default current_date,
  kind text not null check (kind in ('days','hours')),
  amount integer not null check (amount > 0 and ((kind = 'days' and amount <= 365) or (kind = 'hours' and amount <= 24))),
  cid text check (cid is null or length(btrim(cid)) between 1 and 20),
  cid_consent boolean not null default false,
  purpose text check (purpose is null or length(purpose) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cid is null or cid_consent) -- CID sem consentimento registrado é recusado
);
create index on certificates (patient_id, issued_on desc);
create index on certificates (clinic_id);

-- ========== 5. Gatilhos ==========

create trigger prescriptions_touch before update on prescriptions for each row execute function touch_updated_at();
create trigger certificates_touch before update on certificates for each row execute function touch_updated_at();

-- Clínica, paciente e autor de um documento nunca mudam depois de criados.
create or replace function documents_guard() returns trigger language plpgsql as $$
begin
  if new.clinic_id <> old.clinic_id or new.patient_id <> old.patient_id
     or new.professional_id is distinct from old.professional_id then
    raise exception 'clínica, paciente e autor do documento não podem mudar';
  end if;
  return new;
end $$;
create trigger prescriptions_guard before update on prescriptions for each row execute function documents_guard();
create trigger certificates_guard before update on certificates for each row execute function documents_guard();

-- Item e medicamento referenciado precisam ser da mesma clínica da receita.
create or replace function prescription_items_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from prescriptions p where p.id = new.prescription_id and p.clinic_id = new.clinic_id) then
    raise exception 'item de outra clínica';
  end if;
  if new.medication_id is not null
     and not exists (select 1 from medications m where m.id = new.medication_id and m.clinic_id = new.clinic_id) then
    raise exception 'medicamento de outra clínica';
  end if;
  return new;
end $$;
create trigger prescription_items_guard before insert or update on prescription_items for each row execute function prescription_items_guard();

-- ========== 6. RLS ==========
-- Leitura: membro ativo que enxerga o paciente (modo "consultório dividido" respeitado
-- por can_see_patient, que roda como o usuário e herda a RLS de patients).
-- Emitir (inserir) receita/atestado: só dono ou dentista, em nome de si mesmo.
-- Editar e excluir: só o dono da clínica ou o autor do documento; recepção e financeiro
-- só leem. Justificativa: receita e atestado são documentos de responsabilidade do
-- profissional; ninguém deve reescrever o documento de outro.

alter table medications enable row level security;
create policy medications_read on medications for select using (is_member(clinic_id));
create policy medications_insert on medications for insert with check (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist']));
create policy medications_update on medications for update
  using (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist']))
  with check (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist']));
create policy medications_delete on medications for delete using (
  can_write(clinic_id) and (has_role(clinic_id, array['owner']) or created_by = auth.uid())
);

alter table prescription_templates enable row level security;
create policy prescription_templates_read on prescription_templates for select using (is_member(clinic_id));
create policy prescription_templates_insert on prescription_templates for insert with check (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist']));
create policy prescription_templates_update on prescription_templates for update
  using (can_write(clinic_id) and (has_role(clinic_id, array['owner']) or created_by = auth.uid()))
  with check (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist']));
create policy prescription_templates_delete on prescription_templates for delete using (
  can_write(clinic_id) and (has_role(clinic_id, array['owner']) or created_by = auth.uid())
);

alter table prescriptions enable row level security;
create policy prescriptions_read on prescriptions for select using (is_member(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy prescriptions_insert on prescriptions for insert with check (
  can_write(clinic_id) and has_role(clinic_id, array['owner','dentist'])
  and professional_id = auth.uid() and can_see_patient(clinic_id, patient_id)
);
create policy prescriptions_update on prescriptions for update
  using (can_write(clinic_id) and can_see_patient(clinic_id, patient_id) and (has_role(clinic_id, array['owner']) or professional_id = auth.uid()))
  with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy prescriptions_delete on prescriptions for delete using (
  can_write(clinic_id) and can_see_patient(clinic_id, patient_id) and (has_role(clinic_id, array['owner']) or professional_id = auth.uid())
);

-- Itens herdam a regra da receita: o exists roda como o usuário, então a RLS de prescriptions vale dentro dele.
alter table prescription_items enable row level security;
create policy prescription_items_read on prescription_items for select using (
  is_member(clinic_id) and exists (select 1 from prescriptions p where p.id = prescription_items.prescription_id and p.clinic_id = prescription_items.clinic_id)
);
create policy prescription_items_insert on prescription_items for insert with check (
  can_write(clinic_id) and exists (select 1 from prescriptions p where p.id = prescription_items.prescription_id and p.clinic_id = prescription_items.clinic_id
    and (has_role(p.clinic_id, array['owner']) or p.professional_id = auth.uid()))
);
create policy prescription_items_update on prescription_items for update
  using (can_write(clinic_id) and exists (select 1 from prescriptions p where p.id = prescription_items.prescription_id and p.clinic_id = prescription_items.clinic_id
    and (has_role(p.clinic_id, array['owner']) or p.professional_id = auth.uid())))
  with check (can_write(clinic_id));
create policy prescription_items_delete on prescription_items for delete using (
  can_write(clinic_id) and exists (select 1 from prescriptions p where p.id = prescription_items.prescription_id and p.clinic_id = prescription_items.clinic_id
    and (has_role(p.clinic_id, array['owner']) or p.professional_id = auth.uid()))
);

alter table certificates enable row level security;
create policy certificates_read on certificates for select using (is_member(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy certificates_insert on certificates for insert with check (
  can_write(clinic_id) and has_role(clinic_id, array['owner','dentist'])
  and professional_id = auth.uid() and can_see_patient(clinic_id, patient_id)
);
create policy certificates_update on certificates for update
  using (can_write(clinic_id) and can_see_patient(clinic_id, patient_id) and (has_role(clinic_id, array['owner']) or professional_id = auth.uid()))
  with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy certificates_delete on certificates for delete using (
  can_write(clinic_id) and can_see_patient(clinic_id, patient_id) and (has_role(clinic_id, array['owner']) or professional_id = auth.uid())
);

-- ========== 7. RPC: receita + itens numa transação ==========
-- SECURITY INVOKER: todas as políticas acima valem. Itens sem medication_id cadastram o
-- nome no catálogo da clínica (se ainda não existe) e se ligam a ele.
-- Na edição (p_id), nome/CRO/UF do profissional NÃO mudam: ficam os da emissão.

create or replace function save_prescription(
  p_id uuid, p_clinic uuid, p_patient uuid, p_issued_on date, p_notes text,
  p_prof_name text, p_prof_cro text, p_prof_cro_uf text, p_items jsonb
) returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid; it jsonb; i integer := 0; v_med uuid; v_name text; v_route text; v_ctrl boolean; v_unit text; v_pos text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'a receita precisa de 1 a 30 itens';
  end if;
  if p_id is null then
    insert into prescriptions (clinic_id, patient_id, issued_on, notes, professional_name, professional_cro, professional_cro_uf)
      values (p_clinic, p_patient, coalesce(p_issued_on, current_date), nullif(btrim(p_notes), ''), p_prof_name, p_prof_cro, p_prof_cro_uf)
      returning id into v_id;
  else
    update prescriptions set issued_on = coalesce(p_issued_on, issued_on), notes = nullif(btrim(p_notes), '')
      where id = p_id and clinic_id = p_clinic and patient_id = p_patient returning id into v_id;
    if v_id is null then raise exception 'receita não encontrada ou sem permissão'; end if;
    delete from prescription_items where prescription_id = v_id;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    v_name := btrim(it->>'name');
    v_route := coalesce(nullif(it->>'route', ''), 'internal');
    v_ctrl := coalesce((it->>'controlled')::boolean, false);
    v_unit := nullif(btrim(it->>'unit'), '');
    v_pos := btrim(it->>'posology');
    v_med := nullif(it->>'medication_id', '')::uuid;
    if v_med is null then
      insert into medications (clinic_id, name, route, controlled, unit, default_posology)
        values (p_clinic, v_name, v_route, v_ctrl, v_unit, v_pos)
        on conflict (clinic_id, (lower(btrim(name)))) do nothing;
      select id into v_med from medications where clinic_id = p_clinic and lower(btrim(name)) = lower(v_name);
    end if;
    insert into prescription_items (clinic_id, prescription_id, position, medication_id, name, quantity, unit, posology, route, controlled)
      values (p_clinic, v_id, i, v_med, v_name, nullif(it->>'quantity', '')::numeric, v_unit, v_pos, v_route, v_ctrl);
  end loop;
  return v_id;
end $$;
revoke execute on function save_prescription(uuid, uuid, uuid, date, text, text, text, text, jsonb) from public, anon;
grant execute on function save_prescription(uuid, uuid, uuid, date, text, text, text, text, jsonb) to authenticated;
