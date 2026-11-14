-- Anamnese: rascunho, conclusão, revisões e trava no banco.
--
-- Papéis (anamnese é dado de saúde sensível):
--   dono e dentista ........ leem, preenchem rascunhos, CONCLUEM e criam revisões
--   recepção ............... lê e preenche/edita/exclui RASCUNHOS; não conclui
--   financeiro ............. não lê nem escreve (não precisa do conteúdo clínico)
-- Ficha concluída não aceita update nem delete diretos. Correção = nova revisão
-- (outra linha, ligada à anterior por revision_of); a anterior fica preservada.
-- Exceções do gatilho: exclusão/atualização em cascata (apagar paciente ou clínica,
-- apagar modelo/usuário) e quem não é usuário autenticado (service role, manutenção).

alter table anamnesis_records add column status text not null default 'completed' check (status in ('draft','completed'));
alter table anamnesis_records add column revision_of uuid references anamnesis_records(id);
alter table anamnesis_records add column completed_at timestamptz;
alter table anamnesis_records add column completed_by uuid references auth.users(id) on delete set null;

-- Fichas que já existiam passam a concluídas, com o autor original como conferente.
update anamnesis_records set completed_at = created_at, completed_by = author_id where status = 'completed';
alter table anamnesis_records alter column status set default 'draft';
alter table anamnesis_records add constraint anamnesis_completed_has_date check (status = 'draft' or completed_at is not null);

-- Cada ficha concluída tem no máximo uma revisão: a cadeia é linear.
create unique index anamnesis_records_revision_uq on anamnesis_records (revision_of) where revision_of is not null;

create or replace function anamnesis_guard() returns trigger language plpgsql set search_path = public as $$
declare bad boolean;
begin
  -- cascata (FK) e service role passam: a trava vale para usuários do app
  if pg_trigger_depth() > 1 or auth.uid() is null then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;

  if TG_OP = 'DELETE' then
    if old.status = 'completed' then raise exception 'Ficha concluída não pode ser excluída. Crie uma revisão.'; end if;
    return old;
  end if;

  if TG_OP = 'UPDATE' then
    if old.status = 'completed' then raise exception 'Ficha concluída não pode ser alterada. Crie uma revisão.'; end if;
    if new.clinic_id <> old.clinic_id or new.patient_id <> old.patient_id
       or new.author_id is distinct from old.author_id or new.revision_of is distinct from old.revision_of then
      raise exception 'Clínica, paciente, autor e ficha de origem não podem mudar.';
    end if;
  elsif new.revision_of is not null then
    if not exists (select 1 from anamnesis_records r where r.id = new.revision_of and r.clinic_id = new.clinic_id
                   and r.patient_id = new.patient_id and r.status = 'completed') then
      raise exception 'A revisão precisa apontar para uma ficha concluída do mesmo paciente.';
    end if;
  end if;

  -- respostas: valores permitidos; ausência de resposta nunca vira "não"
  select exists (select 1 from jsonb_array_elements(new.answers) a
                 where a ? 'answer' and jsonb_typeof(a->'answer') <> 'null' and (a->>'answer') not in ('yes','no','unknown','na','private'))
    into bad;
  if bad then raise exception 'Resposta de anamnese inválida.'; end if;

  if new.status = 'completed' then
    if not has_role(new.clinic_id, array['owner','dentist']) then raise exception 'Só o dono ou o dentista concluem a ficha.'; end if;
    select exists (select 1 from jsonb_array_elements(new.answers) a
                   where a->>'kind' = 'yesno' and (a->>'answer') is null and (a->>'yes') is null)
      into bad;
    if bad then raise exception 'Responda todas as perguntas de sim ou não antes de concluir.'; end if;
    new.completed_at := now();
    new.completed_by := auth.uid();
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;
create trigger anamnesis_records_guard before insert or update or delete on anamnesis_records for each row execute function anamnesis_guard();

-- Políticas por papel (substituem as da migration 20261114000001).
drop policy if exists anamnesis_records_read on anamnesis_records;
drop policy if exists anamnesis_records_insert on anamnesis_records;
drop policy if exists anamnesis_records_update on anamnesis_records;
drop policy if exists anamnesis_records_delete on anamnesis_records;

create policy anamnesis_records_read on anamnesis_records for select using (
  has_role(clinic_id, array['owner','dentist','receptionist']) and can_see_patient(clinic_id, patient_id)
);
create policy anamnesis_records_insert on anamnesis_records for insert with check (
  can_write(clinic_id) and has_role(clinic_id, array['owner','dentist','receptionist'])
  and can_see_patient(clinic_id, patient_id) and author_id = auth.uid()
);
create policy anamnesis_records_update on anamnesis_records for update
  using (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist','receptionist']) and can_see_patient(clinic_id, patient_id))
  with check (can_write(clinic_id) and has_role(clinic_id, array['owner','dentist','receptionist']) and can_see_patient(clinic_id, patient_id));
create policy anamnesis_records_delete on anamnesis_records for delete using (
  can_write(clinic_id) and has_role(clinic_id, array['owner','dentist','receptionist']) and can_see_patient(clinic_id, patient_id)
);
