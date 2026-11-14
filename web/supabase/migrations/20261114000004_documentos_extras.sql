-- Onda B1 (extras): logo da clínica, documentos personalizados e arquivos do paciente.
-- Não altera migrations anteriores. Não inclui assinatura digital (ICP-Brasil) nem receita
-- de controle especial: ambas são reguladas e ficam fora do produto (decisão para o advogado).

-- ========== 1. Logo da clínica ==========
-- Imagem pequena guardada como data URL (reduzida no navegador); só o dono altera, pela
-- política clinics_update que já existe. Os membros leem junto com o resto da clínica.

alter table clinics
  add column logo_data text check (
    logo_data is null or (length(logo_data) <= 300000 and logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')
  );

-- ========== 2. Documentos personalizados ==========
-- Título e texto livres, impressos como MINUTA. Mesma regra de autoria dos atestados.

create table custom_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid references auth.users(id) on delete set null default auth.uid(),
  professional_name text check (professional_name is null or length(professional_name) <= 120),
  professional_cro text check (professional_cro is null or length(professional_cro) <= 40),
  professional_cro_uf text check (professional_cro_uf is null or length(professional_cro_uf) = 2),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 10000),
  issued_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on custom_documents (patient_id, issued_on desc);
create index on custom_documents (clinic_id);

create trigger custom_documents_touch before update on custom_documents for each row execute function touch_updated_at();
create trigger custom_documents_guard before update on custom_documents for each row execute function documents_guard();

alter table custom_documents enable row level security;
create policy custom_documents_read on custom_documents for select using (is_member(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy custom_documents_insert on custom_documents for insert with check (
  can_write(clinic_id) and has_role(clinic_id, array['owner','dentist'])
  and professional_id = auth.uid() and can_see_patient(clinic_id, patient_id)
);
create policy custom_documents_update on custom_documents for update
  using (can_write(clinic_id) and can_see_patient(clinic_id, patient_id) and (has_role(clinic_id, array['owner']) or professional_id = auth.uid()))
  with check (can_write(clinic_id) and can_see_patient(clinic_id, patient_id));
create policy custom_documents_delete on custom_documents for delete using (
  can_write(clinic_id) and can_see_patient(clinic_id, patient_id) and (has_role(clinic_id, array['owner']) or professional_id = auth.uid())
);

-- ========== 3. Arquivos do paciente ==========
-- Radiografias, fotos e PDFs em bucket PRIVADO. Caminho do objeto: <clinic_id>/<patient_id>/<uuid>.<ext>.
-- Leem e enviam: dono, dentista e recepção (financeiro não vê arquivos clínicos). Apagar: dono ou
-- quem enviou. Não há update: arquivo não é sobrescrito nem movido.

create table patient_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  storage_path text not null unique check (
    storage_path ~ ('^' || clinic_id::text || '/' || patient_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$')
  ),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on patient_files (patient_id, created_at desc);
create index on patient_files (clinic_id);

alter table patient_files enable row level security;
create policy patient_files_read on patient_files for select using (
  has_role(clinic_id, array['owner','dentist','receptionist']) and can_see_patient(clinic_id, patient_id)
);
create policy patient_files_insert on patient_files for insert with check (
  can_write(clinic_id) and has_role(clinic_id, array['owner','dentist','receptionist'])
  and uploaded_by = auth.uid() and can_see_patient(clinic_id, patient_id)
);
create policy patient_files_delete on patient_files for delete using (
  can_write(clinic_id) and can_see_patient(clinic_id, patient_id)
  and has_role(clinic_id, array['owner','dentist','receptionist'])
  and (has_role(clinic_id, array['owner']) or uploaded_by = auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-files', 'patient-files', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Decide acesso a um objeto pelo caminho. O CASE garante que o cast para uuid só roda em
-- caminho bem formado. Security invoker: can_see_patient herda a RLS de patients.
create or replace function patient_file_access(p_name text, p_mode text) returns boolean
language plpgsql stable set search_path = public as $$
declare
  u constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_clinic uuid; v_patient uuid;
begin
  if p_name is null or p_name !~ ('^' || u || '/' || u || '/' || u || '\.(png|jpg|webp|pdf)$') then return false; end if;
  v_clinic := split_part(p_name, '/', 1)::uuid;
  v_patient := split_part(p_name, '/', 2)::uuid;
  if not has_role(v_clinic, array['owner','dentist','receptionist']) then return false; end if;
  if not can_see_patient(v_clinic, v_patient) then return false; end if;
  if p_mode = 'read' then return true; end if;
  if not can_write(v_clinic) then return false; end if;
  if p_mode = 'write' then return true; end if;
  -- 'delete': dono, ou quem enviou (a linha em patient_files ainda existe: apague o objeto antes da linha)
  return has_role(v_clinic, array['owner'])
    or exists (select 1 from patient_files f where f.storage_path = p_name and f.uploaded_by = auth.uid());
end $$;

create policy patient_files_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'patient-files' and patient_file_access(name, 'read'));
create policy patient_files_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-files' and patient_file_access(name, 'write'));
create policy patient_files_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'patient-files' and patient_file_access(name, 'delete'));
