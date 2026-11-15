-- HOF (harmonização orofacial) no plano de tratamento e no orçamento.
-- Idempotente. Os dados HOF ficam em colunas novas de plan_items: as policies
-- plan_items_* (is_member / can_write + plano da mesma clínica, que por sua vez
-- herda a visibilidade do paciente) continuam valendo sem alteração.

-- ========== 1. Validação das anotações do faceograma ==========
-- hof_marks é uma lista de formas: {id, kind: point|arrow|line, points: [[x,y], ...]}
-- com x em 0..300 e y em 0..400 (viewBox do faceograma). Ponto = 1 par; seta e linha = 2.
create or replace function hof_marks_valid(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare e jsonb; p jsonb; need integer;
begin
  if jsonb_typeof(m) is distinct from 'array' then return false; end if;
  if jsonb_array_length(m) > 100 then return false; end if;
  for e in select * from jsonb_array_elements(m) loop
    if jsonb_typeof(e) is distinct from 'object' then return false; end if;
    if coalesce(e->>'kind', '') not in ('point', 'arrow', 'line') then return false; end if;
    if jsonb_typeof(e->'points') is distinct from 'array' then return false; end if;
    need := case when e->>'kind' = 'point' then 1 else 2 end;
    if jsonb_array_length(e->'points') <> need then return false; end if;
    for p in select * from jsonb_array_elements(e->'points') loop
      if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) <> 2 then return false; end if;
      if jsonb_typeof(p->0) is distinct from 'number' or jsonb_typeof(p->1) is distinct from 'number' then return false; end if;
      if (p->>0)::numeric not between 0 and 300 or (p->>1)::numeric not between 0 and 400 then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- ========== 2. Colunas novas em plan_items ==========
alter table plan_items
  add column if not exists hof boolean not null default false,
  add column if not exists hof_face text,
  add column if not exists hof_regions text[] not null default '{}',
  add column if not exists hof_marks jsonb not null default '[]'::jsonb,
  add column if not exists product_amount numeric(8,2),
  add column if not exists product_unit text,
  add column if not exists dentist_name text;

alter table plan_items drop constraint if exists plan_items_hof_face_check;
alter table plan_items add constraint plan_items_hof_face_check check (hof_face is null or hof_face in ('female', 'male'));

alter table plan_items drop constraint if exists plan_items_hof_regions_check;
alter table plan_items add constraint plan_items_hof_regions_check check (
  cardinality(hof_regions) <= 18
  and hof_regions <@ array['testa','glabela','tempora_d','tempora_e','olheira_d','olheira_e','malar_d','malar_e',
    'nasogeniano_d','nasogeniano_e','nariz','labio_superior','labio_inferior','mento','mandibula_d','mandibula_e','pescoco','perioral']::text[]);

alter table plan_items drop constraint if exists plan_items_hof_marks_check;
alter table plan_items add constraint plan_items_hof_marks_check check (hof_marks_valid(hof_marks));

alter table plan_items drop constraint if exists plan_items_product_check;
alter table plan_items add constraint plan_items_product_check check (
  (product_amount is null) = (product_unit is null)
  and (product_amount is null or (product_amount > 0 and product_amount <= 9999))
  and (product_unit is null or product_unit in ('U', 'mL', 'seringa')));

alter table plan_items drop constraint if exists plan_items_dentist_name_check;
alter table plan_items add constraint plan_items_dentist_name_check check (dentist_name is null or char_length(dentist_name) <= 120);

-- Item que não é de HOF não carrega dado de HOF; item de HOF sempre tem região.
alter table plan_items drop constraint if exists plan_items_hof_consistency_check;
alter table plan_items add constraint plan_items_hof_consistency_check check (
  case when hof then cardinality(hof_regions) > 0
       else cardinality(hof_regions) = 0 and hof_marks = '[]'::jsonb and product_amount is null and hof_face is null and dentist_name is null end);

-- ========== 3. create_budget grava os campos de HOF ==========
-- Mesma assinatura e mesmas validações da versão de 20261114000002; só o insert dos itens muda.
-- (authorize_budget e budgets_guard não mudam: os campos de HOF não entram em valor, status nem permissão.)
create or replace function create_budget(p_clinic uuid, p_patient uuid, p_kind text, p_validity integer,
  p_discount integer, p_methods text[], p_notes text, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_plan uuid; b uuid; subtotal integer; disc integer; it jsonb; pos integer := 0; is_hof boolean;
begin
  if not can_write(p_clinic) then raise exception 'sem permissão ou acesso vencido'; end if;
  if not can_see_patient(p_clinic, p_patient) then raise exception 'paciente não encontrado nesta clínica'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'orçamento sem itens'; end if;
  insert into treatment_plans (clinic_id, patient_id, dentist_id, kind, validity_days, discount_cents, payment_methods, notes, status)
    values (p_clinic, p_patient, auth.uid(), p_kind, p_validity, greatest(coalesce(p_discount, 0), 0), coalesce(p_methods, '{}'), p_notes, 'budgeted')
    returning id into v_plan;
  for it in select * from jsonb_array_elements(p_items) loop
    is_hof := coalesce((it->>'hof')::boolean, false);
    insert into plan_items (clinic_id, plan_id, position, tooth_fdi, region, conditions, procedure_id, procedure_name, phase, price_cents, quantity,
      hof, hof_face, hof_regions, hof_marks, product_amount, product_unit, dentist_name)
    values (p_clinic, v_plan, pos, (it->>'tooth')::smallint, it->>'region',
      coalesce(array(select jsonb_array_elements_text(it->'conditions')), '{}'),
      it->>'procedure_id', it->>'procedure_name', it->>'phase', (it->>'price_cents')::integer, coalesce((it->>'quantity')::smallint, 1),
      is_hof,
      case when is_hof then coalesce(it->>'hof_face', 'female') end,
      case when is_hof then coalesce(array(select jsonb_array_elements_text(it->'hof_regions')), '{}') else '{}' end,
      case when is_hof then coalesce(it->'hof_marks', '[]'::jsonb) else '[]'::jsonb end,
      case when is_hof then (it->>'product_amount')::numeric end,
      case when is_hof then it->>'product_unit' end,
      case when is_hof then nullif(btrim(it->>'dentist_name'), '') end);
    pos := pos + 1;
  end loop;
  select coalesce(sum(coalesce(price_cents, 0) * quantity), 0) into subtotal from plan_items where plan_items.plan_id = v_plan;
  disc := least(greatest(coalesce(p_discount, 0), 0), subtotal);
  update treatment_plans set discount_cents = disc where id = v_plan;
  insert into budgets (clinic_id, plan_id, patient_id, subtotal_cents, discount_cents, total_cents)
    values (p_clinic, v_plan, p_patient, subtotal, disc, subtotal - disc)
    returning id into b;
  insert into patient_events (clinic_id, patient_id, kind, label) values
    (p_clinic, p_patient, 'plan_created', 'Plano de tratamento montado'),
    (p_clinic, p_patient, 'budget_presented', 'Orçamento apresentado');
  return b;
end $$;
-- create or replace mantém os grants anteriores de create_budget.
