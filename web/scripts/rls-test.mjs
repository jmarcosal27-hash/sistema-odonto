// Teste de isolamento entre clínicas e do modo só-leitura.
// Uso: node scripts/rls-test.mjs   (lê .env.local; precisa da service role)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };

async function userClient(email) {
  await admin.auth.admin.createUser({ email, password: "senha-teste-123", email_confirm: true }).catch(() => {});
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "senha-teste-123" });
  if (error) throw error;
  return c;
}

const stamp = Date.now();
const a = await userClient(`a-${stamp}@teste.local`);
const b = await userClient(`b-${stamp}@teste.local`);

const { data: clinicA, error: e1 } = await a.rpc("create_clinic", { p_name: "Clínica A" });
check(!e1 && clinicA, "usuário A cria a própria clínica");
const { data: clinicB } = await b.rpc("create_clinic", { p_name: "Clínica B" });
check(!!clinicB, "usuário B cria a própria clínica");

const { data: pat, error: e2 } = await a.from("patients").insert({ clinic_id: clinicA, full_name: "Paciente Fictício A" }).select("id").single();
check(!e2 && pat, "A cadastra paciente na clínica A");

const { data: seen } = await b.from("patients").select("id").eq("clinic_id", clinicA);
check(Array.isArray(seen) && seen.length === 0, "B NÃO vê pacientes da clínica A");

const { data: seenById } = await b.from("patients").select("id").eq("id", pat.id);
check(seenById?.length === 0, "B NÃO acha o paciente de A nem pelo id");

const { error: e3 } = await b.from("patients").insert({ clinic_id: clinicA, full_name: "Intruso" });
check(!!e3, "B NÃO consegue inserir paciente na clínica A");

const { data: upd } = await b.from("patients").update({ full_name: "Alterado por B" }).eq("id", pat.id).select("id");
check(!upd || upd.length === 0, "B NÃO consegue alterar paciente de A");

const { error: e4 } = await b.rpc("create_budget", { p_clinic: clinicA, p_patient: pat.id, p_kind: "adult", p_validity: 30, p_discount: 0, p_methods: [], p_notes: null,
  p_items: [{ procedure_name: "Teste", phase: "rehab", price_cents: 1000, quantity: 1, conditions: [] }] });
check(!!e4, "B NÃO cria orçamento na clínica A via RPC");

const { error: e5 } = await b.rpc("grant_access", { p_clinic: clinicB, p_plan: "Grátis", p_days: 999, p_session: "fake" });
check(!!e5, "usuário comum NÃO consegue se dar acesso (grant_access só via webhook)");

const { data: budgetId, error: e6 } = await a.rpc("create_budget", { p_clinic: clinicA, p_patient: pat.id, p_kind: "adult", p_validity: 30, p_discount: 100, p_methods: ["pix"], p_notes: null,
  p_items: [{ procedure_name: "Restauração", phase: "rehab", price_cents: 1000, quantity: 2, conditions: [] }, { procedure_name: "Limpeza", phase: "oral_prep", price_cents: 500, quantity: 1, conditions: [] }] });
check(!e6 && budgetId, "A cria orçamento (2 itens, desconto R$ 1,00)");
const { data: bud } = await a.from("budgets").select("*").eq("id", budgetId).single();
check(bud?.subtotal_cents === 2500 && bud?.total_cents === 2400, `total calculado no banco (subtotal 2500, total 2400) → ${bud?.subtotal_cents}/${bud?.total_cents}`);

const { data: items } = await a.from("plan_items").select("id").eq("plan_id", bud.plan_id);
const { error: e7 } = await a.rpc("authorize_budget", { p_budget: budgetId, p_item_ids: items.map((i) => i.id), p_installments: 3, p_first_due: "2026-12-01", p_method: "pix", p_paid_now: true });
check(!e7, "A aprova em 3x com entrada");
const { data: inst } = await a.from("installments").select("amount_cents, paid_at").eq("budget_id", budgetId).order("number");
check(inst?.length === 3 && inst.reduce((s, i) => s + i.amount_cents, 0) === 2400 && !!inst[0].paid_at, "3 parcelas somando 2400, primeira paga");

const { error: e8 } = await a.rpc("authorize_budget", { p_budget: budgetId, p_item_ids: items.map((i) => i.id), p_installments: 1, p_first_due: "2026-12-01", p_method: "pix", p_paid_now: false });
check(!!e8, "aprovar duas vezes é recusado");

// Prontuário (onda B): evolução clínica e anamnese
const { data: note, error: n1 } = await a.from("clinical_notes").insert({ clinic_id: clinicA, patient_id: pat.id, body: "Evolução fictícia" }).select("id").single();
check(!n1 && note, "A registra nota de evolução");
const { data: tpl, error: n2 } = await a.from("anamnesis_templates").insert({ clinic_id: clinicA, name: "Modelo teste", questions: [{ id: "q1", text: "Pergunta?", kind: "yesno" }] }).select("id").single();
check(!n2 && tpl, "A cria modelo de anamnese");
const { error: n3 } = await a.from("anamnesis_records").insert({ clinic_id: clinicA, patient_id: pat.id, template_id: tpl.id, template_name: "Modelo teste", answers: [{ questionId: "q1", text: "Pergunta?", kind: "yesno", yes: false }] });
check(!n3, "A preenche anamnese do paciente");

const { data: bNotes } = await b.from("clinical_notes").select("id").eq("clinic_id", clinicA);
check(bNotes?.length === 0, "B NÃO vê notas de evolução da clínica A");
const { data: bTpl } = await b.from("anamnesis_templates").select("id").eq("clinic_id", clinicA);
check(bTpl?.length === 0, "B NÃO vê modelos de anamnese da clínica A");
const { data: bRec } = await b.from("anamnesis_records").select("id").eq("patient_id", pat.id);
check(bRec?.length === 0, "B NÃO vê anamneses do paciente de A");
const { error: n4 } = await b.from("clinical_notes").insert({ clinic_id: clinicA, patient_id: pat.id, body: "Intruso" });
check(!!n4, "B NÃO insere nota na clínica A");
const { error: n5 } = await b.from("clinical_notes").insert({ clinic_id: clinicB, patient_id: pat.id, body: "Paciente de outra clínica" });
check(!!n5, "B NÃO cria nota na própria clínica apontando para paciente de A");
const { error: n6 } = await b.from("anamnesis_records").insert({ clinic_id: clinicA, patient_id: pat.id, template_name: "x", answers: [] });
check(!!n6, "B NÃO insere anamnese na clínica A");
const { data: bUpd } = await b.from("clinical_notes").update({ body: "Alterada por B" }).eq("id", note.id).select("id");
check(!bUpd || bUpd.length === 0, "B NÃO altera nota de A");
const { data: bDel } = await b.from("clinical_notes").delete().eq("id", note.id).select("id");
check(!bDel || bDel.length === 0, "B NÃO exclui nota de A");
const { data: bDelTpl } = await b.from("anamnesis_templates").delete().eq("id", tpl.id).select("id");
check(!bDelTpl || bDelTpl.length === 0, "B NÃO exclui modelo de A");
const { error: n7 } = await a.from("clinical_notes").insert({ clinic_id: clinicA, patient_id: pat.id, body: "   " });
check(!!n7, "CHECK: nota vazia é recusada");
const { error: n8 } = await a.from("anamnesis_templates").insert({ clinic_id: clinicA, name: "Ruim", questions: { nao: "array" } });
check(!!n8, "CHECK: perguntas do modelo precisam ser uma lista");

// ===== Correções de segurança (migration 20261114000002) =====
// Membro C (dentista) entra por convite feito pelo dono A.
const c = await userClient(`c-${stamp}@teste.local`);
const { data: { user: cUser } } = await c.auth.getUser();
await a.from("clinic_members").insert({ clinic_id: clinicA, invited_email: `c-${stamp}@teste.local`, role: "dentist", status: "invited" });
const { data: claimed, error: cl1 } = await c.rpc("claim_invites");
check(!cl1 && claimed === 1, "C aceita o convite de dentista (claim_invites)");
await a.from("clinic_members").insert({ clinic_id: clinicA, invited_email: `c-${stamp}@teste.local`, role: "owner", status: "invited" });
const { data: claimed2, error: cl2 } = await c.rpc("claim_invites");
check(!cl2 && claimed2 === 0, "convite repetido para quem já é membro não falha");
const memberRow = async () => (await admin.from("clinic_members").select("role,status,clinic_id").eq("user_id", cUser.id).eq("clinic_id", clinicA).single()).data;
check((await memberRow())?.role === "dentist", "convite repetido como 'owner' não promove ninguém");

await c.from("clinic_members").update({ role: "owner" }).eq("user_id", cUser.id);
check((await memberRow())?.role === "dentist", "membro NÃO vira owner alterando a própria linha");
await c.from("clinic_members").update({ clinic_id: clinicB }).eq("user_id", cUser.id);
check((await memberRow())?.clinic_id === clinicA, "membro NÃO troca o clinic_id da própria linha");
const { error: up1 } = await c.rpc("update_my_profile", { p_professional_name: "Dra. Teste", p_cro: "12345", p_theme: "dark", p_cro_uf: "SP", p_cpf: "123.456.789-09", p_birth_date: "1990-05-20" });
const { data: prof } = await admin.from("clinic_members").select("professional_name,cro,cro_uf,cpf,birth_date,theme,role,status,clinic_id").eq("user_id", cUser.id).eq("clinic_id", clinicA).single();
check(!up1 && prof?.professional_name === "Dra. Teste" && prof?.theme === "dark" && prof?.role === "dentist", "update_my_profile muda nome/CRO/tema e nada além");
check(prof?.cro === "12345" && prof?.cro_uf === "SP" && prof?.cpf === "12345678909" && prof?.birth_date === "1990-05-20" && prof?.status === "active" && prof?.clinic_id === clinicA,
  "update_my_profile grava CRO, UF, CPF (só dígitos) e nascimento, sem mexer em papel, status ou clínica");
const { error: upBad1 } = await c.rpc("update_my_profile", { p_professional_name: "x", p_cro: "1", p_theme: "dark", p_cro_uf: "XX" });
check(!!upBad1, "CHECK: UF do CRO inválida é recusada");
const { error: upBad2 } = await c.rpc("update_my_profile", { p_professional_name: "x", p_cro: "1", p_theme: "dark", p_cpf: "123" });
check(!!upBad2, "CHECK: CPF com menos de 11 dígitos é recusado");
check((await memberRow())?.role === "dentist", "update_my_profile não eleva papel (continua dentista)");
await admin.from("clinic_members").update({ status: "disabled" }).eq("user_id", cUser.id).eq("clinic_id", clinicA);
await c.from("clinic_members").update({ status: "active" }).eq("user_id", cUser.id);
check((await memberRow())?.status === "disabled", "membro desativado NÃO se reativa sozinho");
const { error: up2 } = await c.rpc("update_my_profile", { p_professional_name: "Reativada?", p_cro: null, p_theme: null });
const { data: prof2 } = await admin.from("clinic_members").select("professional_name,status").eq("user_id", cUser.id).eq("clinic_id", clinicA).single();
check(!up2 && prof2?.professional_name === "Dra. Teste" && prof2?.status === "disabled", "desativado: update_my_profile não altera nada");
await admin.from("clinic_members").update({ status: "active" }).eq("user_id", cUser.id).eq("clinic_id", clinicA);

// Escrita por papel (modo compartilhado): dentista C não mexe em parcela nem em valor de atendimento
const { data: instUpd } = await c.from("installments").update({ paid_at: "2026-12-02" }).eq("budget_id", budgetId).select("id");
check(!instUpd || instUpd.length === 0, "dentista NÃO marca parcela como paga");
const { data: tr } = await a.from("treatments").select("id").eq("patient_id", pat.id).limit(1).single();
const { error: trErr } = await c.from("treatments").update({ price_cents: 1 }).eq("id", tr.id);
check(!!trErr, "dentista NÃO altera valor de atendimento");
const { data: delTr } = await c.from("treatments").delete().eq("id", tr.id).select("id");
check(!delTr || delTr.length === 0, "dentista NÃO apaga atendimento");
const { data: delEv } = await a.from("patient_events").delete().eq("patient_id", pat.id).select("id");
check(!delEv || delEv.length === 0, "histórico (patient_events) NÃO pode ser apagado, nem pelo dono");

// Orçamento: recusar só via RPC e só enquanto 'presented'
const mkBudget = async () => (await a.rpc("create_budget", { p_clinic: clinicA, p_patient: pat.id, p_kind: "adult", p_validity: 30, p_discount: 0, p_methods: [], p_notes: null,
  p_items: [{ procedure_name: "Extra", phase: "rehab", price_cents: 700, quantity: 1, conditions: [] }] })).data;
const b2 = await mkBudget();
const { error: dc0 } = await a.from("budgets").update({ status: "authorized" }).eq("id", b2);
check(!!dc0, "orçamento NÃO muda de status por update direto");
const { error: dc1 } = await a.rpc("decline_budget", { p_budget: b2 });
check(!dc1, "decline_budget recusa orçamento apresentado");
const { error: dc2 } = await a.rpc("decline_budget", { p_budget: b2 });
check(!!dc2, "decline_budget não recusa duas vezes");
const { error: dc3 } = await a.rpc("decline_budget", { p_budget: budgetId });
check(!!dc3, "decline_budget NÃO recusa orçamento já aprovado");
const b3 = await mkBudget();
const b3plan = (await a.from("budgets").select("plan_id").eq("id", b3).single()).data.plan_id;
const { data: b3items } = await a.from("plan_items").select("id").eq("plan_id", b3plan);
const { error: nl } = await a.rpc("authorize_budget", { p_budget: b3, p_item_ids: b3items.map((i) => i.id), p_installments: null, p_first_due: "2026-12-01", p_method: "pix", p_paid_now: false });
check(!nl, "authorize_budget com p_installments nulo vale 1 parcela");

// Referências entre clínicas
const { data: patB } = await b.from("patients").insert({ clinic_id: clinicB, full_name: "Paciente B" }).select("id").single();
const { error: xr1 } = await a.rpc("create_budget", { p_clinic: clinicA, p_patient: patB.id, p_kind: "adult", p_validity: 30, p_discount: 0, p_methods: [], p_notes: null,
  p_items: [{ procedure_name: "x", phase: "rehab", price_cents: 100, quantity: 1, conditions: [] }] });
check(!!xr1, "create_budget NÃO aceita paciente de outra clínica");
const bBudget = (await b.rpc("create_budget", { p_clinic: clinicB, p_patient: patB.id, p_kind: "adult", p_validity: 30, p_discount: 0, p_methods: [], p_notes: null,
  p_items: [{ procedure_name: "y", phase: "rehab", price_cents: 100, quantity: 1, conditions: [] }] })).data;
const planB = (await b.from("budgets").select("plan_id").eq("id", bBudget).single()).data.plan_id;
const { error: xr2 } = await a.from("budgets").insert({ clinic_id: clinicA, patient_id: pat.id, plan_id: planB, subtotal_cents: 1, total_cents: 1 });
check(!!xr2, "orçamento NÃO aponta para plano de outra clínica");
const { error: xr3 } = await a.from("installments").insert({ clinic_id: clinicA, patient_id: pat.id, budget_id: bBudget, number: 1, of_total: 1, due_date: "2026-12-01", amount_cents: 1 });
check(!!xr3, "parcela NÃO aponta para orçamento de outra clínica");
const { error: xr4 } = await a.from("patients").update({ clinic_id: clinicB }).eq("id", pat.id);
check(!!xr4, "paciente NÃO muda de clínica");

// Modo "consultório dividido"
await a.from("clinics").update({ practice_mode: "split" }).eq("id", clinicA);
const { data: cPat } = await c.from("patients").insert({ clinic_id: clinicA, full_name: "Paciente do C", dentist_id: "00000000-0000-0000-0000-000000000000" }).select("id,dentist_id").single();
check(cPat?.dentist_id === cUser.id, "dentista cria paciente e o responsável é ele mesmo (ignora outro valor)");
const { data: cSees } = await c.from("patients").select("id").eq("clinic_id", clinicA);
check(cSees?.length === 1 && cSees[0].id === cPat.id, "split: C vê só o próprio paciente");
for (const t of ["treatment_plans", "budgets", "installments", "treatments", "patient_events", "clinical_notes", "anamnesis_records"]) {
  const { data: rows } = await c.from(t).select("id").eq("patient_id", pat.id);
  check(rows?.length === 0, `split: C NÃO vê ${t} de paciente de outro dentista`);
}
const { data: stolen } = await c.from("patients").update({ dentist_id: cUser.id }).eq("id", pat.id).select("id");
check(!stolen || stolen.length === 0, "split: C NÃO assume paciente de outro dentista");
const { error: giveAway } = await c.from("patients").update({ dentist_id: null }).eq("id", cPat.id);
check(!!giveAway, "dentista NÃO muda o responsável do próprio paciente");
const { error: reassign } = await a.from("patients").update({ dentist_id: cUser.id }).eq("id", cPat.id);
check(!reassign, "dono muda o responsável do paciente");
await a.from("clinics").update({ practice_mode: "shared" }).eq("id", clinicA);


// ===== Onda B1: documentos (migration 20261114000003) =====
const item = (name, extra = {}) => ({ name, quantity: 1, unit: "caixa", posology: "Conforme orientação", route: "internal", controlled: false, ...extra });
const { data: rxId, error: rx1 } = await a.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: "2026-11-14", p_notes: null,
  p_prof_name: "Dono A", p_prof_cro: "1", p_prof_cro_uf: "SP", p_items: [item("Medicamento Fictício X"), item("Pomada Fictícia", { route: "external", controlled: true })] });
if (rx1) console.log("rx1:", rx1.code, rx1.message, rx1.details ?? "");
check(!rx1 && rxId, "A emite receita com 2 itens (RPC save_prescription)");
const { data: meds } = await a.from("medications").select("id,name").eq("clinic_id", clinicA);
check(meds?.length === 2, "nomes usados na receita viram medicamentos da clínica (catálogo começa vazio)");
const { data: rxItems } = await a.from("prescription_items").select("id,medication_id").eq("prescription_id", rxId);
check(rxItems?.length === 2 && rxItems.every((i) => i.medication_id), "itens da receita ligados aos medicamentos");
const { data: rx2 } = await a.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: "2026-11-14", p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("  medicamento fictício x  ")] });
const { data: medsAfter } = await a.from("medications").select("id").eq("clinic_id", clinicA);
check(rx2 && medsAfter?.length === 2, "mesmo nome (maiúsculas/espaços diferentes) reaproveita o medicamento, sem duplicar");
const { error: md1 } = await a.from("medications").insert({ clinic_id: clinicA, name: "MEDICAMENTO FICTÍCIO X" });
check(!!md1, "medicamento duplicado (case-insensitive) é recusado");
const { error: md2 } = await a.from("medications").insert({ clinic_id: clinicA, name: "Outro", route: "oral" });
check(!!md2, "CHECK: via do medicamento precisa ser interna ou externa");
const { data: cert, error: ce1 } = await a.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "days", amount: 2, professional_name: "Dono A" }).select("id").single();
check(!ce1 && cert, "A emite atestado por dias");
const { error: ce2 } = await a.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "hours", amount: 3 });
check(!ce2, "A emite atestado por horas");
const { data: tplRx, error: tp1 } = await a.from("prescription_templates").insert({ clinic_id: clinicA, name: "Modelo teste", items: [item("Medicamento Fictício X")] }).select("id").single();
check(!tp1 && tplRx, "A salva modelo de receita");

// CHECKs
for (const [label, row] of [
  ["dias = 0", { kind: "days", amount: 0 }], ["dias negativos", { kind: "days", amount: -1 }], ["horas = 0", { kind: "hours", amount: 0 }],
  ["tipo inválido", { kind: "weeks", amount: 1 }], ["mais de 24 horas", { kind: "hours", amount: 25 }],
  ["CID sem consentimento", { kind: "days", amount: 1, cid: "K02" }]]) {
  const { error } = await a.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, ...row });
  check(!!error, `CHECK atestado: ${label} é recusado`);
}
const { error: ce3 } = await a.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "days", amount: 1, cid: "K02", cid_consent: true });
check(!ce3, "atestado com CID e consentimento é aceito");
const { error: it1 } = await a.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Zero", { quantity: 0 })] });
check(!!it1, "CHECK: quantidade do item precisa ser maior que zero");
const { error: it2 } = await a.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [] });
check(!!it2, "receita sem itens é recusada");
const { error: it3 } = await a.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Sem posologia", { posology: "  " })] });
check(!!it3, "CHECK: item sem posologia é recusado");

// Isolamento entre clínicas: B não vê, não insere, não altera, não exclui
for (const t of ["medications", "prescriptions", "prescription_items", "prescription_templates", "certificates"]) {
  const { data: rows } = await b.from(t).select("id").eq("clinic_id", clinicA);
  check(rows?.length === 0, `B NÃO vê ${t} da clínica A`);
}
const { error: bx1 } = await b.from("medications").insert({ clinic_id: clinicA, name: "Intruso" });
check(!!bx1, "B NÃO cria medicamento na clínica A");
const { error: bx2 } = await b.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "days", amount: 1 });
check(!!bx2, "B NÃO emite atestado na clínica A");
const { error: bx3 } = await b.from("certificates").insert({ clinic_id: clinicB, patient_id: pat.id, kind: "days", amount: 1 });
check(!!bx3, "B NÃO emite atestado na própria clínica apontando para paciente de A");
const { error: bx4 } = await b.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Intruso")] });
check(!!bx4, "B NÃO emite receita na clínica A (RPC)");
const { error: bx5 } = await b.rpc("save_prescription", { p_id: null, p_clinic: clinicB, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Cruzado")] });
check(!!bx5, "B NÃO emite receita na clínica B para paciente da clínica A");
const { error: bx6 } = await b.rpc("save_prescription", { p_id: rxId, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: "alterada", p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Alterado")] });
check(!!bx6, "B NÃO edita receita de A (RPC)");
const { data: bu1 } = await b.from("prescriptions").update({ notes: "alterada por B" }).eq("id", rxId).select("id");
check(!bu1 || bu1.length === 0, "B NÃO altera receita de A");
const { data: bu2 } = await b.from("certificates").update({ amount: 9 }).eq("id", cert.id).select("id");
check(!bu2 || bu2.length === 0, "B NÃO altera atestado de A");
const { data: bd1 } = await b.from("prescriptions").delete().eq("id", rxId).select("id");
check(!bd1 || bd1.length === 0, "B NÃO exclui receita de A");
const { data: bd2 } = await b.from("certificates").delete().eq("id", cert.id).select("id");
check(!bd2 || bd2.length === 0, "B NÃO exclui atestado de A");
const { data: bd3 } = await b.from("medications").delete().eq("id", meds[0].id).select("id");
check(!bd3 || bd3.length === 0, "B NÃO exclui medicamento de A");
const { data: bd4 } = await b.from("prescription_templates").delete().eq("id", tplRx.id).select("id");
check(!bd4 || bd4.length === 0, "B NÃO exclui modelo de receita de A");
// medicamento de outra clínica referenciado por item
const { data: medB } = await b.from("medications").insert({ clinic_id: clinicB, name: "Medicamento da B" }).select("id").single();
const { error: xm1 } = await a.from("prescription_items").insert({ clinic_id: clinicA, prescription_id: rxId, medication_id: medB.id, name: "x", posology: "y" });
check(!!xm1, "item de receita NÃO aponta para medicamento de outra clínica");
const { error: xm2 } = await a.from("prescription_items").insert({ clinic_id: clinicB, prescription_id: rxId, name: "x", posology: "y" });
check(!!xm2, "item NÃO usa clinic_id diferente do da receita");
const { error: xm3 } = await a.from("prescriptions").update({ patient_id: patB.id }).eq("id", rxId);
check(!!xm3, "receita NÃO muda de paciente");
const { error: xm4 } = await a.from("certificates").update({ clinic_id: clinicB }).eq("id", cert.id);
check(!!xm4, "atestado NÃO muda de clínica");

// Autoria: dentista C emite em nome próprio; só dono ou autor editam/excluem
const { data: cRx, error: cr1 } = await c.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: "Dra. Teste", p_prof_cro: "12345", p_prof_cro_uf: "SP", p_items: [item("Do C")] });
check(!cr1 && cRx, "dentista C emite receita");
const { data: cRxRow } = await a.from("prescriptions").select("professional_id").eq("id", cRx).single();
check(cRxRow?.professional_id === cUser.id, "o autor da receita é quem emitiu (auth.uid)");
const { error: cr2 } = await c.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "days", amount: 1, professional_id: (await a.auth.getUser()).data.user.id });
check(!!cr2, "dentista NÃO emite atestado em nome de outro profissional");
const { data: cEditOwn, error: cr3 } = await c.rpc("save_prescription", { p_id: cRx, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: "ok", p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Do C editado")] });
check(!cr3 && cEditOwn, "autor edita a própria receita");
const { error: cr4 } = await c.rpc("save_prescription", { p_id: rxId, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: "x", p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Invasão")] });
check(!!cr4, "dentista NÃO edita receita de outro profissional");
const { data: cDelOther } = await c.from("prescriptions").delete().eq("id", rxId).select("id");
check(!cDelOther || cDelOther.length === 0, "dentista NÃO exclui receita de outro profissional");
const { data: cDelCert } = await c.from("certificates").delete().eq("id", cert.id).select("id");
check(!cDelCert || cDelCert.length === 0, "dentista NÃO exclui atestado de outro profissional");
const { data: cDelOwn } = await c.from("prescriptions").delete().eq("id", cRx).select("id");
check(cDelOwn?.length === 1, "autor exclui a própria receita");
const { data: aDelC } = await a.from("prescriptions").delete().eq("id", rx2).select("id");
check(aDelC?.length === 1, "dono exclui receita (inclusive de outro autor)");

// Modo dividido: C só vê documentos dos pacientes que enxerga
await a.from("clinics").update({ practice_mode: "split" }).eq("id", clinicA);
for (const t of ["prescriptions", "certificates"]) {
  const { data: rows } = await c.from(t).select("id").eq("patient_id", pat.id);
  check(rows?.length === 0, `split: C NÃO vê ${t} de paciente de outro dentista`);
}
const { data: splitItems } = await c.from("prescription_items").select("id").eq("clinic_id", clinicA);
check(splitItems?.length === 0, "split: C NÃO vê itens de receitas de paciente de outro dentista");
const { error: sp1 } = await c.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Paciente alheio")] });
check(!!sp1, "split: C NÃO emite receita para paciente de outro dentista");
const { error: sp2 } = await c.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "days", amount: 1 });
check(!!sp2, "split: C NÃO emite atestado para paciente de outro dentista");
const { data: spOwn } = await c.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: cPat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Paciente próprio")] });
check(!!spOwn, "split: C emite receita para o próprio paciente");
await a.from("clinics").update({ practice_mode: "shared" }).eq("id", clinicA);

// Medicamentos e modelos não têm dado de paciente: todos os membros leem
const { data: cMeds } = await c.from("medications").select("id").eq("clinic_id", clinicA);
check((cMeds?.length ?? 0) >= 2, "membro da clínica lê o catálogo de medicamentos");

// ===== Extras da B1 (migration 20261114000004): logo, documentos livres, arquivos =====
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const { data: logoOk } = await a.from("clinics").update({ logo_data: PNG }).eq("id", clinicA).select("id");
check(logoOk?.length === 1, "dono grava o logo da clínica");
const { error: logoBad } = await a.from("clinics").update({ logo_data: "<script>alert(1)</script>" }).eq("id", clinicA);
check(!!logoBad, "CHECK: logo só aceita data URL de imagem png/jpeg/webp");
const { error: logoBig } = await a.from("clinics").update({ logo_data: "data:image/png;base64," + "A".repeat(300000) }).eq("id", clinicA);
check(!!logoBig, "CHECK: logo grande demais é recusado");
const { data: logoC } = await c.from("clinics").update({ logo_data: null }).eq("id", clinicA).select("id");
check(!logoC || logoC.length === 0, "dentista NÃO troca o logo da clínica");
const { data: logoB } = await b.from("clinics").select("logo_data").eq("id", clinicA);
check(logoB?.length === 0, "B NÃO lê o logo da clínica A");

// Medicamentos e modelos: editar e excluir
const { data: medUpd } = await a.from("medications").update({ unit: "frasco" }).eq("id", meds[0].id).select("id");
check(medUpd?.length === 1, "dono edita medicamento");
const { data: medUpdC } = await c.from("medications").update({ unit: "caixa" }).eq("id", meds[0].id).select("id");
check(medUpdC?.length === 1, "dentista edita medicamento da clínica");
const { data: medUpdB } = await b.from("medications").update({ unit: "x" }).eq("id", meds[0].id).select("id");
check(!medUpdB || medUpdB.length === 0, "B NÃO edita medicamento de A");
const { data: medDelC } = await c.from("medications").delete().eq("id", meds[0].id).select("id");
check(!medDelC || medDelC.length === 0, "dentista NÃO exclui medicamento criado por outro");
const { data: tplUpdC } = await c.from("prescription_templates").update({ name: "Renomeado por C" }).eq("id", tplRx.id).select("id");
check(!tplUpdC || tplUpdC.length === 0, "dentista NÃO renomeia modelo criado por outro");
const { data: tplUpdB } = await b.from("prescription_templates").update({ name: "Renomeado por B" }).eq("id", tplRx.id).select("id");
check(!tplUpdB || tplUpdB.length === 0, "B NÃO renomeia modelo de A");
const { data: tplUpdA } = await a.from("prescription_templates").update({ name: "Modelo renomeado" }).eq("id", tplRx.id).select("id");
check(tplUpdA?.length === 1, "dono renomeia modelo");
const { data: cTpl } = await c.from("prescription_templates").insert({ clinic_id: clinicA, name: "Modelo do C", items: [item("Do C")] }).select("id").single();
const { data: cTplRen } = await c.from("prescription_templates").update({ name: "Modelo do C 2" }).eq("id", cTpl.id).select("id");
check(cTplRen?.length === 1, "autor renomeia o próprio modelo");
const { data: aDelCTpl } = await a.from("prescription_templates").delete().eq("id", cTpl.id).select("id");
check(aDelCTpl?.length === 1, "dono exclui modelo de outro autor");
const { data: medDelA } = await a.from("medications").delete().eq("id", meds[0].id).select("id");
check(medDelA?.length === 1, "dono exclui medicamento");
const { data: itemsKept } = await a.from("prescription_items").select("id,medication_id,name").eq("prescription_id", rxId);
check(itemsKept?.length >= 1 && itemsKept.every((i) => !!i.name), "excluir medicamento mantém os itens das receitas já emitidas");

// Documentos personalizados
const doc = { clinic_id: clinicA, patient_id: pat.id, title: "Declaração fictícia", body: "Texto livre de teste." };
const { data: cd, error: cd1 } = await a.from("custom_documents").insert(doc).select("id,professional_id").single();
check(!cd1 && cd, "dono cria documento personalizado");
const { data: aUser } = await a.auth.getUser();
check(cd?.professional_id === aUser.user.id, "o autor do documento é quem criou (auth.uid)");
for (const [col, val] of [["title", "   "], ["body", "   "]]) {
  const { error } = await a.from("custom_documents").insert({ ...doc, [col]: val });
  check(!!error, `CHECK: documento com ${col} vazio é recusado`);
}
const { error: cdLong } = await a.from("custom_documents").insert({ ...doc, body: "x".repeat(10001) });
check(!!cdLong, "CHECK: texto acima de 10000 caracteres é recusado");
const { data: bCd } = await b.from("custom_documents").select("id").eq("clinic_id", clinicA);
check(bCd?.length === 0, "B NÃO vê documentos personalizados de A");
const { error: bCd1 } = await b.from("custom_documents").insert(doc);
check(!!bCd1, "B NÃO cria documento na clínica A");
const { error: bCd2 } = await b.from("custom_documents").insert({ ...doc, clinic_id: clinicB });
check(!!bCd2, "B NÃO cria documento na própria clínica para paciente de A");
const { data: bCd3 } = await b.from("custom_documents").update({ body: "alterado" }).eq("id", cd.id).select("id");
check(!bCd3 || bCd3.length === 0, "B NÃO altera documento de A");
const { data: bCd4 } = await b.from("custom_documents").delete().eq("id", cd.id).select("id");
check(!bCd4 || bCd4.length === 0, "B NÃO exclui documento de A");
const { error: cdMove } = await a.from("custom_documents").update({ clinic_id: clinicB }).eq("id", cd.id);
check(!!cdMove, "documento NÃO muda de clínica");
const { error: cdFake } = await c.from("custom_documents").insert({ ...doc, professional_id: aUser.user.id });
check(!!cdFake, "dentista NÃO cria documento em nome de outro profissional");
const { data: cCd } = await c.from("custom_documents").insert({ ...doc, title: "Do C" }).select("id").single();
check(!!cCd, "dentista cria o próprio documento");
const { data: cEditA } = await c.from("custom_documents").update({ body: "invasão" }).eq("id", cd.id).select("id");
check(!cEditA || cEditA.length === 0, "dentista NÃO edita documento de outro profissional");
const { data: cDelA } = await c.from("custom_documents").delete().eq("id", cd.id).select("id");
check(!cDelA || cDelA.length === 0, "dentista NÃO exclui documento de outro profissional");
const { data: cEditOwnDoc } = await c.from("custom_documents").update({ body: "meu texto" }).eq("id", cCd.id).select("id");
check(cEditOwnDoc?.length === 1, "autor edita o próprio documento");
const { data: aDelCd } = await a.from("custom_documents").delete().eq("id", cCd.id).select("id");
check(aDelCd?.length === 1, "dono exclui documento de outro autor");

// Arquivos do paciente (tabela + storage privado)
const bucket = "patient-files";
const uid = () => crypto.randomUUID();
const pdf = () => new Blob(["%PDF-1.4 arquivo de teste"], { type: "application/pdf" });
const pathA = `${clinicA}/${pat.id}/${uid()}.pdf`;
const { error: upA } = await a.storage.from(bucket).upload(pathA, pdf(), { contentType: "application/pdf" });
check(!upA, "dono envia arquivo para o paciente");
const fileRow = { clinic_id: clinicA, patient_id: pat.id, name: "exame.pdf", mime: "application/pdf", size_bytes: 25, storage_path: pathA };
const { data: pf, error: pf1 } = await a.from("patient_files").insert(fileRow).select("id").single();
check(!pf1 && pf, "dono registra o arquivo na ficha");
const { data: dl } = await a.storage.from(bucket).download(pathA);
check(!!dl, "dono baixa o próprio arquivo");
const { data: sig } = await a.storage.from(bucket).createSignedUrl(pathA, 60);
check(!!sig?.signedUrl, "dono gera link temporário do arquivo");
const { data: pubTry } = await createClient(URL_, ANON, { auth: { persistSession: false } }).storage.from(bucket).download(pathA);
check(!pubTry, "sem login NÃO baixa arquivo (bucket privado)");
const { data: bDl } = await b.storage.from(bucket).download(pathA);
check(!bDl, "B NÃO baixa arquivo da clínica A");
const { data: bList } = await b.storage.from(bucket).list(`${clinicA}/${pat.id}`);
check(!bList || bList.length === 0, "B NÃO lista arquivos da clínica A");
const { error: bUp1 } = await b.storage.from(bucket).upload(`${clinicA}/${pat.id}/${uid()}.pdf`, pdf(), { contentType: "application/pdf" });
check(!!bUp1, "B NÃO envia arquivo para a clínica A");
const { error: bUp2 } = await b.storage.from(bucket).upload(`${clinicB}/${pat.id}/${uid()}.pdf`, pdf(), { contentType: "application/pdf" });
check(!!bUp2, "B NÃO envia arquivo na própria clínica para paciente de A");
const { error: bUp3 } = await a.storage.from(bucket).upload(`${clinicA}/${pat.id}/nome-invalido.pdf`, pdf(), { contentType: "application/pdf" });
check(!!bUp3, "caminho fora do padrão é recusado");
const { error: bUp4 } = await a.storage.from(bucket).upload(`${clinicA}/${pat.id}/${uid()}.html`, new Blob(["<b>x</b>"], { type: "text/html" }), { contentType: "text/html" });
check(!!bUp4, "tipo de arquivo não permitido é recusado");
const { error: bUp5 } = await a.storage.from(bucket).upload(pathA, pdf(), { contentType: "application/pdf", upsert: true });
check(!!bUp5, "arquivo existente NÃO é sobrescrito");
const { data: bPf } = await b.from("patient_files").select("id").eq("clinic_id", clinicA);
check(bPf?.length === 0, "B NÃO vê arquivos da clínica A na ficha");
const { error: bPf1 } = await b.from("patient_files").insert({ ...fileRow, storage_path: `${clinicA}/${pat.id}/${uid()}.pdf` });
check(!!bPf1, "B NÃO registra arquivo na clínica A");
const { error: pfBadPath } = await a.from("patient_files").insert({ ...fileRow, storage_path: `${clinicB}/${patB.id}/${uid()}.pdf` });
check(!!pfBadPath, "CHECK: caminho do arquivo precisa ser da própria clínica e do próprio paciente");
const { error: pfBadMime } = await a.from("patient_files").insert({ ...fileRow, mime: "text/html", storage_path: `${clinicA}/${pat.id}/${uid()}.pdf` });
check(!!pfBadMime, "CHECK: tipo de arquivo fora da lista é recusado");
const { error: pfBig } = await a.from("patient_files").insert({ ...fileRow, size_bytes: 10485761, storage_path: `${clinicA}/${pat.id}/${uid()}.pdf` });
check(!!pfBig, "CHECK: arquivo acima de 10 MB é recusado");
const { data: pfUpd } = await a.from("patient_files").update({ name: "outro.pdf" }).eq("id", pf.id).select("id");
check(!pfUpd || pfUpd.length === 0, "registro de arquivo não é editável");
const { data: bPfDel } = await b.from("patient_files").delete().eq("id", pf.id).select("id");
check(!bPfDel || bPfDel.length === 0, "B NÃO exclui registro de arquivo de A");
const { data: bRm } = await b.storage.from(bucket).remove([pathA]);
check(!bRm || bRm.length === 0, "B NÃO exclui objeto de A");
// dentista C envia o próprio arquivo; não apaga o de A; dono apaga o de C
const pathC = `${clinicA}/${pat.id}/${uid()}.pdf`;
const { error: cUp } = await c.storage.from(bucket).upload(pathC, pdf(), { contentType: "application/pdf" });
const { data: cPf } = await c.from("patient_files").insert({ ...fileRow, name: "do-c.pdf", storage_path: pathC }).select("id").single();
check(!cUp && cPf, "dentista envia e registra o próprio arquivo");
const { data: cRmA } = await c.storage.from(bucket).remove([pathA]);
check(!cRmA || cRmA.length === 0, "dentista NÃO exclui objeto enviado por outro");
const { data: cDelA2 } = await c.from("patient_files").delete().eq("id", pf.id).select("id");
check(!cDelA2 || cDelA2.length === 0, "dentista NÃO exclui registro de arquivo de outro");
// financeiro não lê arquivos clínicos
const f = await userClient(`f-${stamp}@teste.local`);
await a.from("clinic_members").insert({ clinic_id: clinicA, invited_email: `f-${stamp}@teste.local`, role: "finance", status: "invited" });
await f.rpc("claim_invites");
const { data: fPf } = await f.from("patient_files").select("id").eq("clinic_id", clinicA);
check(fPf?.length === 0, "financeiro NÃO vê arquivos do paciente");
const { data: fDl } = await f.storage.from(bucket).download(pathA);
check(!fDl, "financeiro NÃO baixa arquivos do paciente");
const { error: fUp } = await f.storage.from(bucket).upload(`${clinicA}/${pat.id}/${uid()}.pdf`, pdf(), { contentType: "application/pdf" });
check(!!fUp, "financeiro NÃO envia arquivos do paciente");
// modo dividido: C não enxerga arquivos de paciente de outro dentista
await a.from("clinics").update({ practice_mode: "split" }).eq("id", clinicA);
const { data: splitDl } = await c.storage.from(bucket).download(pathA);
check(!splitDl, "split: C NÃO baixa arquivo de paciente de outro dentista");
const { data: splitPf } = await c.from("patient_files").select("id").eq("patient_id", pat.id);
check(splitPf?.length === 0, "split: C NÃO vê arquivos de paciente de outro dentista");
const { error: splitUp } = await c.storage.from(bucket).upload(`${clinicA}/${pat.id}/${uid()}.pdf`, pdf(), { contentType: "application/pdf" });
check(!!splitUp, "split: C NÃO envia arquivo para paciente de outro dentista");
await a.from("clinics").update({ practice_mode: "shared" }).eq("id", clinicA);
// excluir: dono apaga o objeto e depois a linha (ordem usada pelo app)
const { data: aRmC } = await a.storage.from(bucket).remove([pathC]);
check(aRmC?.length === 1, "dono exclui o objeto enviado por outro");
const { data: aDelC2 } = await a.from("patient_files").delete().eq("id", cPf.id).select("id");
check(aDelC2?.length === 1, "dono exclui o registro enviado por outro");

// ===== Anamnese: rascunho, conclusão e revisões (migration 20261115000001) =====
const ans = (answer) => [{ questionId: "q1", text: "Pergunta?", kind: "yesno", answer, yes: answer === "yes" ? true : answer === "no" ? false : undefined }];
const rec = { clinic_id: clinicA, patient_id: pat.id, template_name: "Modelo teste" };
const { data: dr, error: dr1 } = await a.from("anamnesis_records").insert({ ...rec, answers: ans(undefined) }).select("id,status,completed_at").single();
check(!dr1 && dr?.status === "draft" && dr.completed_at === null, "anamnese nasce como rascunho");
const { data: drUp } = await a.from("anamnesis_records").update({ answers: ans("unknown") }).eq("id", dr.id).select("id");
check(drUp?.length === 1, "rascunho pode ser editado");
const { error: cx1 } = await a.from("anamnesis_records").update({ answers: ans(undefined), status: "completed" }).eq("id", dr.id);
check(!!cx1, "concluir com pergunta sem resposta é recusado (ausência nunca vira \"não\")");
const { error: cx2 } = await a.from("anamnesis_records").update({ answers: ans("talvez") }).eq("id", dr.id);
check(!!cx2, "resposta fora do conjunto permitido é recusada");
const { data: done, error: cx3 } = await a.from("anamnesis_records").update({ answers: ans("private"), status: "completed", completed_at: "2000-01-01T00:00:00Z", completed_by: cUser.id }).eq("id", dr.id).select("completed_at,completed_by").single();
check(!cx3 && done?.completed_by === aUser.user.id && new Date(done.completed_at).getFullYear() >= 2026, "conclusão grava conferente e data no servidor (não aceita os valores enviados)");
const { error: cx4 } = await a.from("anamnesis_records").update({ answers: ans("yes") }).eq("id", dr.id);
check(!!cx4, "ficha concluída NÃO é editada");
const { error: cx5 } = await a.from("anamnesis_records").update({ status: "draft" }).eq("id", dr.id);
check(!!cx5, "ficha concluída NÃO volta a rascunho");
const { error: cx6 } = await a.from("anamnesis_records").delete().eq("id", dr.id);
check(!!cx6, "ficha concluída NÃO é excluída");
const { data: stillThere } = await a.from("anamnesis_records").select("id,answers").eq("id", dr.id).single();
check(stillThere?.answers?.[0]?.answer === "private", "ficha concluída segue intacta");
const { error: cx7 } = await a.from("anamnesis_records").insert({ ...rec, answers: ans("no"), status: "completed", completed_at: "2000-01-01T00:00:00Z" });
check(!cx7, "dono cria ficha já concluída");

// revisão: nova linha ligada à anterior; a anterior fica preservada
const { data: draftRev, error: rv1 } = await a.from("anamnesis_records").insert({ ...rec, answers: ans("no"), revision_of: dr.id }).select("id").single();
check(!rv1 && draftRev, "dono cria revisão (rascunho) de ficha concluída");
const { error: rv2 } = await a.from("anamnesis_records").insert({ ...rec, answers: ans("no"), revision_of: dr.id });
check(!!rv2, "ficha concluída tem no máximo uma revisão");
const { error: rv3 } = await a.from("anamnesis_records").insert({ ...rec, answers: ans("no"), revision_of: draftRev.id });
check(!!rv3, "revisão NÃO aponta para rascunho");
const { error: rv4 } = await a.from("anamnesis_records").update({ revision_of: null }).eq("id", draftRev.id);
check(!!rv4, "revisão NÃO troca a ficha de origem");
const { error: rv5 } = await a.from("anamnesis_records").update({ patient_id: cPat.id }).eq("id", draftRev.id);
check(!!rv5, "rascunho NÃO muda de paciente");

// papéis: recepção preenche rascunho mas não conclui; financeiro não lê nem escreve
const rcp = await userClient(`r-${stamp}@teste.local`);
await a.from("clinic_members").insert({ clinic_id: clinicA, invited_email: `r-${stamp}@teste.local`, role: "receptionist", status: "invited" });
await rcp.rpc("claim_invites");
const { data: rRead } = await rcp.from("anamnesis_records").select("id").eq("patient_id", pat.id);
check((rRead?.length ?? 0) >= 2, "recepção LÊ anamneses");
const { data: rDraft, error: rd1 } = await rcp.from("anamnesis_records").insert({ ...rec, answers: ans(undefined) }).select("id").single();
check(!rd1 && rDraft, "recepção cria rascunho");
const { error: rd2 } = await rcp.from("anamnesis_records").update({ answers: ans("yes"), status: "completed" }).eq("id", rDraft.id);
check(!!rd2, "recepção NÃO conclui a ficha");
const { error: rd3 } = await rcp.from("anamnesis_records").insert({ ...rec, answers: ans("no"), status: "completed" });
check(!!rd3, "recepção NÃO cria ficha já concluída");
const { error: rd4 } = await rcp.from("anamnesis_records").delete().eq("id", rDraft.id);
check(!rd4, "recepção exclui o próprio rascunho");
const { error: rd5 } = await rcp.from("anamnesis_records").delete().eq("id", dr.id);
check(!!rd5, "recepção NÃO exclui ficha concluída");
const { data: fAna } = await f.from("anamnesis_records").select("id").eq("clinic_id", clinicA);
check(fAna?.length === 0, "financeiro NÃO vê anamneses");
const { error: fa1 } = await f.from("anamnesis_records").insert({ ...rec, answers: ans(undefined) });
check(!!fa1, "financeiro NÃO cria anamnese");
const { error: ba1 } = await b.from("anamnesis_records").update({ status: "completed", answers: ans("no") }).eq("id", draftRev.id);
const { data: ba2 } = await admin.from("anamnesis_records").select("status").eq("id", draftRev.id).single();
check(ba2?.status === "draft", "B NÃO conclui rascunho da clínica A" + (ba1 ? "" : " (0 linhas)"));
const { error: ba3 } = await b.from("anamnesis_records").insert({ ...rec, answers: ans("no"), revision_of: dr.id });
check(!!ba3, "B NÃO cria revisão de ficha da clínica A");

// modo dividido: dentista C não mexe nas anamneses de paciente de outro dentista
await a.from("clinics").update({ practice_mode: "split" }).eq("id", clinicA);
const { data: anSp1 } = await c.from("anamnesis_records").select("id").eq("patient_id", pat.id);
check(anSp1?.length === 0, "split: C NÃO vê anamnese de paciente de outro dentista");
const { error: anSp2 } = await c.from("anamnesis_records").insert({ ...rec, answers: ans(undefined) });
check(!!anSp2, "split: C NÃO cria anamnese para paciente de outro dentista");
const { error: anSp3 } = await c.from("anamnesis_records").insert({ ...rec, answers: ans("no"), revision_of: dr.id });
check(!!anSp3, "split: C NÃO cria revisão de ficha de outro dentista");
await a.from("clinics").update({ practice_mode: "shared" }).eq("id", clinicA);

// dentista conclui (não só o dono)
const { data: cDraft } = await c.from("anamnesis_records").insert({ ...rec, answers: ans("na") }).select("id").single();
const { data: cDone } = await c.from("anamnesis_records").update({ status: "completed" }).eq("id", cDraft.id).select("completed_by").single();
check(cDone?.completed_by === cUser.id, "dentista conclui a ficha");

// ===== HOF no plano e no orçamento (migration 20261116000001) =====
const hofMarks = [{ id: "m1", kind: "point", points: [[150, 128]] }, { id: "m2", kind: "arrow", points: [[60, 60], [100, 110.5]] }];
const hofItem = (extra = {}) => ({ procedure_name: "Toxina botulínica estética", procedure_id: "harmonizacao-procedimentos-1", phase: "esthetic", price_cents: 150000, quantity: 1, conditions: [],
  hof: true, hof_face: "female", hof_regions: ["testa", "glabela"], hof_marks: hofMarks, product_amount: 20, product_unit: "U", dentist_name: "Dra. Teste", ...extra });
const mkHof = (client, clinic, patient, item) => client.rpc("create_budget", { p_clinic: clinic, p_patient: patient, p_kind: "adult", p_validity: 30, p_discount: 0, p_methods: [], p_notes: null, p_items: [item] });
const { data: hofBudget, error: hf1 } = await mkHof(a, clinicA, pat.id, hofItem());
check(!hf1 && hofBudget, "A cria orçamento com item de HOF (região, produto e desenho)");
const hofPlan = (await a.from("budgets").select("plan_id,subtotal_cents").eq("id", hofBudget).single()).data;
const { data: hofRow } = await a.from("plan_items").select("*").eq("plan_id", hofPlan.plan_id).single();
check(hofRow?.hof === true && hofRow.hof_regions?.join() === "testa,glabela" && Number(hofRow.product_amount) === 20 && hofRow.product_unit === "U" && hofRow.hof_face === "female" && hofRow.dentist_name === "Dra. Teste",
  "item de HOF grava regiões, quantidade, unidade, rosto e dentista");
check(hofRow?.hof_marks?.length === 2 && hofRow.hof_marks[1].points[1][1] === 110.5, "item de HOF grava as anotações do desenho");
check(hofPlan.subtotal_cents === 150000, "valor do item de HOF entra no total em centavos");
const { data: hofPlain } = await mkHof(a, clinicA, pat.id, { procedure_name: "Limpeza", phase: "oral_prep", price_cents: 100, quantity: 1, conditions: [], hof_regions: ["testa"], product_amount: 5, product_unit: "mL" });
const hofPlainRow = (await a.from("plan_items").select("hof,hof_regions,product_amount").eq("plan_id", (await a.from("budgets").select("plan_id").eq("id", hofPlain).single()).data.plan_id).single()).data;
check(hofPlainRow?.hof === false && hofPlainRow.hof_regions.length === 0 && hofPlainRow.product_amount === null, "item comum ignora campos de HOF enviados");

// leitura por outro membro da mesma clínica
const { data: cHof } = await c.from("plan_items").select("id,hof_regions").eq("plan_id", hofPlan.plan_id);
check(cHof?.length === 1 && cHof[0].hof_regions.length === 2, "dentista C (outro membro) LÊ o item de HOF");

// isolamento entre clínicas
const { data: bHof } = await b.from("plan_items").select("id").eq("plan_id", hofPlan.plan_id);
check(bHof?.length === 0, "B NÃO vê item de HOF da clínica A");
const { error: hfB1 } = await mkHof(b, clinicA, pat.id, hofItem());
check(!!hfB1, "B NÃO cria orçamento de HOF na clínica A");
const { error: hfB2 } = await mkHof(b, clinicB, pat.id, hofItem());
check(!!hfB2, "B NÃO cria orçamento de HOF na própria clínica para paciente de A");
const { error: hfB3 } = await b.from("plan_items").insert({ clinic_id: clinicA, plan_id: hofPlan.plan_id, phase: "esthetic", hof: true, hof_regions: ["mento"] });
check(!!hfB3, "B NÃO insere item de HOF no plano da clínica A");
const { data: hfB4 } = await b.from("plan_items").update({ hof_regions: ["nariz"] }).eq("id", hofRow.id).select("id");
check(!hfB4 || hfB4.length === 0, "B NÃO altera região de item de HOF de A");
const { data: hfB5 } = await b.from("plan_items").delete().eq("id", hofRow.id).select("id");
check(!hfB5 || hfB5.length === 0, "B NÃO exclui item de HOF de A");

// sem acesso: dentista de outro paciente em modo dividido não lê nem cria
await a.from("clinics").update({ practice_mode: "split" }).eq("id", clinicA);
const { data: hfSp } = await c.from("plan_items").select("id").eq("plan_id", hofPlan.plan_id);
check(hfSp?.length === 0, "split: C NÃO vê item de HOF de paciente de outro dentista");
const { error: hfSp2 } = await mkHof(c, clinicA, pat.id, hofItem());
check(!!hfSp2, "split: C NÃO cria orçamento de HOF para paciente de outro dentista");
await a.from("clinics").update({ practice_mode: "shared" }).eq("id", clinicA);

// CHECKs
for (const [label, extra] of [
  ["região inexistente", { hof_regions: ["joelho"] }], ["HOF sem região", { hof_regions: [] }],
  ["unidade inválida", { product_unit: "gotas" }], ["quantidade sem unidade", { product_unit: null }], ["unidade sem quantidade", { product_amount: null }],
  ["quantidade zero", { product_amount: 0 }], ["quantidade acima de 9999", { product_amount: 10000 }],
  ["rosto inválido", { hof_face: "outro" }], ["marcações não são lista", { hof_marks: { nao: "lista" } }],
  ["forma desconhecida", { hof_marks: [{ id: "x", kind: "circulo", points: [[1, 1]] }] }],
  ["seta com um ponto só", { hof_marks: [{ id: "x", kind: "arrow", points: [[1, 1]] }] }],
  ["ponto fora do viewBox (x)", { hof_marks: [{ id: "x", kind: "point", points: [[301, 1]] }] }],
  ["ponto fora do viewBox (y)", { hof_marks: [{ id: "x", kind: "point", points: [[1, -1]] }] }],
  ["coordenada não numérica", { hof_marks: [{ id: "x", kind: "point", points: [["1", 1]] }] }],
  ["mais de 100 marcações", { hof_marks: Array.from({ length: 101 }, (_, i) => ({ id: `m${i}`, kind: "point", points: [[1, 1]] })) }],
  ["dentista com mais de 120 caracteres", { dentist_name: "x".repeat(121) }],
]) {
  const { error } = await mkHof(a, clinicA, pat.id, hofItem(extra));
  check(!!error, `CHECK HOF: ${label} é recusado`);
}
const { error: hfCk } = await a.from("plan_items").update({ hof: false }).eq("id", hofRow.id);
check(!!hfCk, "CHECK HOF: item deixa de ser HOF só se limpar regiões e produto");
const { data: hfOwnEdit } = await a.from("plan_items").update({ hof_regions: ["mento"], product_amount: 1, product_unit: "seringa" }).eq("id", hofRow.id).select("id");
check(hfOwnEdit?.length === 1, "A edita região e produto do item de HOF");
// o total e o status do orçamento seguem protegidos (budgets_guard)
const { error: hfGuard } = await a.from("budgets").update({ total_cents: 1 }).eq("id", hofBudget);
check(!!hfGuard, "budgets_guard continua valendo: total do orçamento de HOF NÃO muda por update");
const { error: hfAuth } = await a.rpc("authorize_budget", { p_budget: hofBudget, p_item_ids: [hofRow.id], p_installments: 1, p_first_due: "2026-12-01", p_method: "pix", p_paid_now: false });
check(!hfAuth, "A aprova orçamento com item de HOF");

// ===== Vendas (migration 20261116000002) =====
const { data: stagesA } = await a.from("sales_stages").select("id,kind,name").eq("clinic_id", clinicA);
const stg = (k) => stagesA?.find((s) => s.kind === k)?.id;
check(stagesA?.length === 4 && ["open", "in_progress", "won", "lost"].every(stg), "clínica nova já nasce com as 4 etapas padrão");
const oppOf = async (client, budget) => (await client.from("opportunities").select("*").eq("budget_id", budget).maybeSingle()).data;
const histOf = async (oppId) => (await a.from("opportunity_events").select("kind,body,author_name").eq("opportunity_id", oppId).order("created_at")).data ?? [];
const authorize1 = async (budget) => {
  const plan = (await a.from("budgets").select("plan_id").eq("id", budget).single()).data.plan_id;
  const ids = (await a.from("plan_items").select("id").eq("plan_id", plan)).data.map((i) => i.id);
  return a.rpc("authorize_budget", { p_budget: budget, p_item_ids: ids, p_installments: 1, p_first_due: "2026-12-01", p_method: "pix", p_paid_now: false });
};

// criação e movimentação automáticas a partir do orçamento
const oAuth = await oppOf(a, budgetId);
check(oAuth?.stage_id === stg("won") && oAuth.value_cents === 2400 && oAuth.patient_id === pat.id, "orçamento aprovado nos testes acima tem oportunidade em Ganha, com o valor em centavos");
const oDecl = await oppOf(a, b2);
check(oDecl?.stage_id === stg("lost"), "orçamento recusado tem oportunidade em Perdida");
const bs1 = await mkBudget();
const oNew = await oppOf(a, bs1);
check(oNew?.stage_id === stg("open") && oNew.value_cents === 700 && oNew.title === "Orçamento de tratamento", "criar orçamento cria a oportunidade em Em aberto");
check((await histOf(oNew.id)).some((e) => e.kind === "system" && e.body === "Criou esta oportunidade"), "histórico registra a criação da oportunidade");
const { error: bsAuth } = await authorize1(bs1);
check(!bsAuth, "aprovar orçamento continua funcionando com a oportunidade ligada");
check((await oppOf(a, bs1))?.stage_id === stg("won"), "aprovar o orçamento move a oportunidade para Ganha");
check((await histOf(oNew.id)).some((e) => e.kind === "stage" && e.body === "Em aberto → Ganha"), "histórico registra a mudança de etapa feita pelo orçamento");
const bs2 = await mkBudget();
await a.rpc("decline_budget", { p_budget: bs2 });
const oBs2 = await oppOf(a, bs2);
check(oBs2?.stage_id === stg("lost"), "recusar o orçamento move a oportunidade para Perdida");
const { error: dupOpp } = await a.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), budget_id: bs1, title: "Duplicada" });
check(!!dupOpp, "um orçamento só tem uma oportunidade");
const { error: oppBudMove } = await a.from("opportunities").update({ budget_id: b3 }).eq("id", oNew.id);
check(!!oppBudMove, "oportunidade NÃO troca de orçamento");
const { error: oppPatMove } = await a.from("opportunities").update({ patient_id: cPat.id }).eq("id", oNew.id);
check(!!oppPatMove, "oportunidade NÃO troca de paciente");
const { error: oppXBud } = await a.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), budget_id: bBudget, title: "Orçamento de outra clínica" });
check(!!oppXBud, "oportunidade NÃO aponta para orçamento de outra clínica");

// oportunidade manual, mover, comentar
const { data: man, error: mn1 } = await a.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), title: "Clareamento", value_cents: 80000, responsible_name: "Dra. A", label: "retorno" }).select("id,stage_changed_at").single();
check(!mn1 && man, "A cria oportunidade manual (paciente, título, valor, responsável)");
for (const [label, row] of [["título vazio", { title: "   " }], ["valor negativo", { value_cents: -1 }], ["título acima de 120", { title: "x".repeat(121) }], ["rótulo acima de 30", { label: "x".repeat(31) }], ["responsável acima de 120", { responsible_name: "x".repeat(121) }]]) {
  const { error } = await a.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), title: "Ok", ...row });
  check(!!error, `CHECK oportunidade: ${label} é recusado`);
}
await new Promise((r) => setTimeout(r, 20));
const { data: mv, error: mv1 } = await a.from("opportunities").update({ stage_id: stg("in_progress") }).eq("id", man.id).select("stage_changed_at").single();
check(!mv1 && new Date(mv.stage_changed_at) > new Date(man.stage_changed_at), "A move a oportunidade de etapa e a data da mudança é atualizada");
check((await histOf(man.id)).some((e) => e.kind === "stage" && e.body === "Em aberto → Em andamento"), "histórico registra Em aberto → Em andamento");
const { error: cm1 } = await a.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "Paciente pediu para ligar na sexta.", author_id: cUser.id, author_name: "Outra pessoa" });
const cmRow = (await a.from("opportunity_events").select("author_id,author_name").eq("opportunity_id", man.id).eq("kind", "comment").single()).data;
check(!cm1 && cmRow?.author_id === aUser.user.id && cmRow.author_name !== "Outra pessoa", "A comenta; autor e nome vêm do servidor, não do cliente");
const { error: cm2 } = await a.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "x".repeat(255) });
check(!cm2, "comentário de 255 caracteres é aceito");
const { error: cm3 } = await a.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "x".repeat(256) });
check(!!cm3, "CHECK: comentário acima de 255 caracteres é recusado");
const { error: cm4 } = await a.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "   " });
check(!!cm4, "CHECK: comentário vazio é recusado");
const { error: cm5 } = await a.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "stage", body: "Falso → Falso" });
check(!!cm5, "usuário NÃO forja linha de histórico de etapa");
const { data: cmUpd } = await a.from("opportunity_events").update({ body: "alterado" }).eq("opportunity_id", man.id).select("id");
const { data: cmDel } = await a.from("opportunity_events").delete().eq("opportunity_id", man.id).select("id");
check((!cmUpd || cmUpd.length === 0) && (!cmDel || cmDel.length === 0), "comentários e histórico NÃO são editados nem apagados");

// etapas
const { data: customStage, error: st1 } = await a.from("sales_stages").insert({ clinic_id: clinicA, name: "Negociação", position: 4 }).select("id").single();
check(!st1 && customStage, "dono cria etapa personalizada");
const { error: st2 } = await a.from("sales_stages").insert({ clinic_id: clinicA, name: "ganha", position: 9 });
check(!!st2, "nome de etapa repetido (sem diferenciar maiúsculas) é recusado");
const { error: st3 } = await a.from("sales_stages").insert({ clinic_id: clinicA, name: "Falsa padrão", position: 9, kind: "won" });
check(!!st3, "usuário NÃO cria etapa com tipo padrão");
const { data: st4 } = await a.from("sales_stages").update({ name: "Ganhou" }).eq("id", stg("won")).select("id");
check(st4?.length === 1, "dono renomeia etapa padrão");
await a.from("sales_stages").update({ name: "Ganha" }).eq("id", stg("won"));
const { error: st5 } = await a.from("sales_stages").update({ kind: "lost" }).eq("id", customStage.id);
check(!!st5, "etapa NÃO muda de tipo");
const { error: st5b } = await a.from("sales_stages").update({ kind: null }).eq("id", stg("open"));
check(!!st5b, "etapa padrão NÃO vira personalizada");
const { data: st6 } = await a.from("sales_stages").delete().eq("id", stg("lost")).select("id");
check(!st6 || st6.length === 0, "etapa padrão NÃO é excluída");
const { error: st6b } = await a.rpc("delete_sales_stage", { p_stage: stg("lost"), p_move_to: stg("open") });
check(!!st6b, "delete_sales_stage recusa etapa padrão");
await a.from("opportunities").update({ stage_id: customStage.id }).eq("id", man.id);
const { error: st7 } = await a.rpc("delete_sales_stage", { p_stage: customStage.id });
check(!!st7, "etapa com cartões NÃO é excluída sem destino para eles");
const { error: st8 } = await a.rpc("delete_sales_stage", { p_stage: customStage.id, p_move_to: customStage.id });
check(!!st8, "destino dos cartões não pode ser a própria etapa");
const { error: st9 } = await b.rpc("delete_sales_stage", { p_stage: customStage.id, p_move_to: stg("open") });
check(!!st9, "B NÃO exclui etapa da clínica A");
const { error: st10 } = await c.rpc("delete_sales_stage", { p_stage: customStage.id, p_move_to: stg("open") });
check(!!st10, "dentista (não é o dono) NÃO exclui etapa");
const { error: st11 } = await a.rpc("delete_sales_stage", { p_stage: customStage.id, p_move_to: stg("in_progress") });
const manAfter = (await a.from("opportunities").select("stage_id").eq("id", man.id).single()).data;
const { data: gone } = await a.from("sales_stages").select("id").eq("id", customStage.id);
check(!st11 && manAfter?.stage_id === stg("in_progress") && gone?.length === 0, "excluir etapa move os cartões para o destino e remove a etapa");
const { data: emptyStage } = await a.from("sales_stages").insert({ clinic_id: clinicA, name: "Vazia", position: 5 }).select("id").single();
const { error: st12 } = await a.rpc("delete_sales_stage", { p_stage: emptyStage.id });
check(!st12, "etapa vazia é excluída sem destino");
const { error: cst } = await c.from("sales_stages").insert({ clinic_id: clinicA, name: "Do dentista", position: 7 });
check(!!cst, "dentista NÃO cria etapa");

// metas do mês
const { error: g1 } = await a.from("sales_goals").upsert({ clinic_id: clinicA, month: "2026-11-01", goal_cents: 5000000 });
check(!g1, "dono define a meta do mês");
const { error: g2 } = await a.from("sales_goals").upsert({ clinic_id: clinicA, month: "2026-11-01", goal_cents: 6000000 });
const { data: gRows } = await a.from("sales_goals").select("goal_cents").eq("clinic_id", clinicA);
check(!g2 && gRows?.length === 1 && gRows[0].goal_cents === 6000000, "dono altera a meta do mês (uma linha por mês)");
const { error: g3 } = await a.from("sales_goals").insert({ clinic_id: clinicA, month: "2026-12-15", goal_cents: 1 });
check(!!g3, "CHECK: meta só aceita o primeiro dia do mês");
const { error: g4 } = await a.from("sales_goals").insert({ clinic_id: clinicA, month: "2026-12-01", goal_cents: -1 });
check(!!g4, "CHECK: meta negativa é recusada");
const { error: g5 } = await c.from("sales_goals").upsert({ clinic_id: clinicA, month: "2026-11-01", goal_cents: 1 });
const { data: gAfterC } = await a.from("sales_goals").select("goal_cents").eq("clinic_id", clinicA);
check(!!g5 && gAfterC?.[0]?.goal_cents === 6000000, "dentista NÃO altera a meta");
const { data: gC } = await c.from("sales_goals").select("goal_cents").eq("clinic_id", clinicA);
check(gC?.length === 1, "dentista LÊ a meta do mês");

// dentista move e comenta (não é só do dono)
const { data: cMove } = await c.from("opportunities").update({ stage_id: stg("open") }).eq("id", man.id).select("id");
check(cMove?.length === 1, "dentista move oportunidade de etapa");
const { error: cCom } = await c.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "Comentário do dentista" });
check(!cCom, "dentista comenta na oportunidade");
const { data: cDelOpp } = await c.from("opportunities").delete().eq("id", man.id).select("id");
check(!cDelOpp || cDelOpp.length === 0, "dentista NÃO exclui oportunidade");

// isolamento entre clínicas
for (const t of ["sales_stages", "opportunities", "opportunity_events", "sales_goals"]) {
  const { data: rows } = await b.from(t).select("clinic_id").eq("clinic_id", clinicA);
  check(rows?.length === 0, `B NÃO vê ${t} da clínica A`);
}
const { data: bStages } = await b.from("sales_stages").select("id").eq("clinic_id", clinicB);
check(bStages?.length === 4, "B tem as próprias 4 etapas padrão");
const bOpen = (await b.from("sales_stages").select("id").eq("clinic_id", clinicB).eq("kind", "open").single()).data.id;
const { error: xo1 } = await b.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), title: "Intruso" });
check(!!xo1, "B NÃO cria oportunidade na clínica A");
const { error: xo2 } = await b.from("opportunities").insert({ clinic_id: clinicB, patient_id: pat.id, stage_id: bOpen, title: "Paciente de outra clínica" });
check(!!xo2, "B NÃO cria oportunidade na própria clínica para paciente de A");
const { error: xo3 } = await b.from("opportunities").insert({ clinic_id: clinicB, patient_id: patB.id, stage_id: stg("open"), title: "Etapa de outra clínica" });
check(!!xo3, "oportunidade NÃO usa etapa de outra clínica");
const { data: xo4 } = await b.from("opportunities").update({ stage_id: bOpen }).eq("id", man.id).select("id");
check(!xo4 || xo4.length === 0, "B NÃO move oportunidade de A");
const { data: xo5 } = await b.from("opportunities").delete().eq("id", man.id).select("id");
check(!xo5 || xo5.length === 0, "B NÃO exclui oportunidade de A");
const { error: xo6 } = await b.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "Intruso" });
check(!!xo6, "B NÃO comenta em oportunidade da clínica A");
const { error: xo7 } = await b.from("opportunity_events").insert({ clinic_id: clinicB, opportunity_id: man.id, kind: "comment", body: "Cruzado" });
check(!!xo7, "B NÃO comenta em oportunidade de A usando a própria clínica");
const { error: xo8 } = await b.from("sales_stages").insert({ clinic_id: clinicA, name: "Intruso", position: 9 });
check(!!xo8, "B NÃO cria etapa na clínica A");
const { data: xo9 } = await b.from("sales_stages").update({ name: "Alterada por B" }).eq("id", stg("open")).select("id");
check(!xo9 || xo9.length === 0, "B NÃO renomeia etapa de A");
const { error: xo10 } = await b.from("sales_goals").upsert({ clinic_id: clinicA, month: "2026-11-01", goal_cents: 1 });
check(!!xo10, "B NÃO altera a meta de A");
const { error: xo11 } = await b.from("sales_goals").upsert({ clinic_id: clinicB, month: "2026-11-01", goal_cents: 100000 });
check(!xo11, "B define a própria meta");
const bOppAuto = (await b.from("opportunities").select("id,stage_id").eq("budget_id", bBudget).maybeSingle()).data;
check(bOppAuto?.stage_id === bOpen, "o orçamento de B criou a oportunidade na etapa Em aberto de B");

// modo dividido: oportunidade herda a visibilidade do paciente
await a.from("clinics").update({ practice_mode: "split" }).eq("id", clinicA);
const { data: spOpps } = await c.from("opportunities").select("id").eq("patient_id", pat.id);
check(spOpps?.length === 0, "split: C NÃO vê oportunidades de paciente de outro dentista");
const { data: spEv } = await c.from("opportunity_events").select("id").eq("opportunity_id", man.id);
check(spEv?.length === 0, "split: C NÃO vê comentários de oportunidade de paciente de outro dentista");
const { error: spIns } = await c.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), title: "Paciente alheio" });
check(!!spIns, "split: C NÃO cria oportunidade para paciente de outro dentista");
const { data: spMove } = await c.from("opportunities").update({ stage_id: stg("won") }).eq("id", man.id).select("id");
check(!spMove || spMove.length === 0, "split: C NÃO move oportunidade de paciente de outro dentista");
const { data: spOppOwn, error: spOppErr } = await c.from("opportunities").insert({ clinic_id: clinicA, patient_id: cPat.id, stage_id: stg("open"), title: "Paciente próprio" }).select("id").single();
check(!spOppErr && spOppOwn, "split: C cria oportunidade para o próprio paciente");
await a.from("clinics").update({ practice_mode: "shared" }).eq("id", clinicA);

// excluir orçamento mantém a oportunidade, só solta o vínculo
const { error: delBud } = await a.from("budgets").delete().eq("id", bs2);
const oKept = (await a.from("opportunities").select("id,budget_id").eq("id", oBs2.id).maybeSingle()).data;
check(!delBud && oKept?.id === oBs2.id && oKept.budget_id === null, "excluir o orçamento NÃO apaga a oportunidade (só solta o vínculo)");
const { data: aDelOpp } = await a.from("opportunities").delete().eq("id", spOppOwn.id).select("id");
check(aDelOpp?.length === 1, "dono exclui oportunidade");

// ===== Controle de prótese (migration 20261116000003) =====
const { data: lab1, error: lb1 } = await a.from("laboratories").insert({ clinic_id: clinicA, name: "Lab Sorriso", phone: "11999990000", notes: "Entrega em 7 dias" }).select("id").single();
check(!lb1 && lab1, "A cadastra laboratório");
const { error: lb2 } = await a.from("laboratories").insert({ clinic_id: clinicA, name: " lab sorriso " });
check(!!lb2, "nome de laboratório repetido (sem diferenciar maiúsculas) é recusado");
const { error: lb3 } = await a.from("laboratories").insert({ clinic_id: clinicA, name: "   " });
check(!!lb3, "CHECK: laboratório sem nome é recusado");
const { data: lbB } = await b.from("laboratories").select("id").eq("clinic_id", clinicA);
check(lbB?.length === 0, "B NÃO vê laboratórios da clínica A");
const { error: lbBi } = await b.from("laboratories").insert({ clinic_id: clinicA, name: "Intruso" });
check(!!lbBi, "B NÃO cadastra laboratório na clínica A");
const { data: lbBu } = await b.from("laboratories").update({ name: "Alterado por B" }).eq("id", lab1.id).select("id");
check(!lbBu || lbBu.length === 0, "B NÃO altera laboratório de A");
const { data: labB1 } = await b.from("laboratories").insert({ clinic_id: clinicB, name: "Lab de B" }).select("id").single();

const job = (extra = {}) => ({ clinic_id: clinicA, patient_id: pat.id, professional_name: "Dra. A", description: "Coroa de zircônia no 26", kind: "crown", teeth: "26", shade: "A2", laboratory_id: lab1.id, sent_on: "2026-11-01", due_on: "2026-11-10", cost_cents: 45000, ...extra });
const { data: pj, error: pj1 } = await a.from("prosthesis_jobs").insert(job()).select("id,stage,stage_changed_at,is_return").single();
check(!pj1 && pj?.stage === "pre_lab" && pj.is_return === false, "A cria serviço de prótese (nasce em Pré-laboratório)");
const pHist = async (id) => (await a.from("prosthesis_events").select("kind,body,author_id,author_name").eq("job_id", id).order("created_at")).data ?? [];
check((await pHist(pj.id)).some((e) => e.kind === "system" && e.body === "Criou este serviço"), "histórico registra a criação do serviço (gravado pelo servidor)");
for (const [label, row] of [["profissional vazio", { professional_name: "  " }], ["descrição vazia", { description: "  " }], ["descrição acima de 255", { description: "x".repeat(256) }], ["tipo inválido", { kind: "ponte" }],
  ["etapa inválida", { stage: "voando" }], ["valor negativo", { cost_cents: -1 }], ["rótulo acima de 30", { label: "x".repeat(31) }], ["previsão antes do envio", { sent_on: "2026-11-10", due_on: "2026-11-01" }],
  ["retorno sem motivo", { is_return: true, return_reason: "  " }]]) {
  const { error } = await a.from("prosthesis_jobs").insert(job(row));
  check(!!error, `CHECK serviço de prótese: ${label} é recusado`);
}
const { error: pjXLab } = await a.from("prosthesis_jobs").insert(job({ laboratory_id: labB1.id }));
check(!!pjXLab, "serviço NÃO aponta para laboratório de outra clínica");
const { data: pjB } = await b.from("prosthesis_jobs").select("id").eq("clinic_id", clinicA);
check(pjB?.length === 0, "B NÃO vê serviços da clínica A");
const { error: pjBi } = await b.from("prosthesis_jobs").insert(job());
check(!!pjBi, "B NÃO cria serviço na clínica A");
const { data: pjBu } = await b.from("prosthesis_jobs").update({ stage: "done" }).eq("id", pj.id).select("id");
check(!pjBu || pjBu.length === 0, "B NÃO move serviço de A");
const { error: pjPat } = await a.from("prosthesis_jobs").update({ patient_id: cPat.id }).eq("id", pj.id);
check(!!pjPat, "serviço NÃO troca de paciente");

await new Promise((r) => setTimeout(r, 20));
const { data: pmv, error: pmv1 } = await a.from("prosthesis_jobs").update({ stage: "sent" }).eq("id", pj.id).select("stage_changed_at").single();
check(!pmv1 && new Date(pmv.stage_changed_at) > new Date(pj.stage_changed_at), "A move o serviço de etapa e a data da mudança é atualizada");
await a.from("prosthesis_jobs").update({ stage: "lab" }).eq("id", pj.id);
const pH = await pHist(pj.id);
check(pH.some((e) => e.kind === "stage" && e.body === "Pré-laboratório → Envio") && pH.some((e) => e.kind === "stage" && e.body === "Envio → Laboratório"), "histórico registra cada mudança de etapa");
check(pH.filter((e) => e.kind === "stage").every((e) => e.author_id === aUser.user.id), "histórico guarda quem moveu");
await a.from("prosthesis_jobs").update({ is_return: true, return_reason: "Cor não combinou" }).eq("id", pj.id);
check((await pHist(pj.id)).some((e) => e.kind === "system" && e.body === "Marcado como retorno: Cor não combinou"), "histórico registra a marcação de retorno com o motivo");

const { error: pc1 } = await a.from("prosthesis_events").insert({ clinic_id: clinicA, job_id: pj.id, kind: "comment", body: "Laboratório confirmou o prazo.", author_id: cUser.id, author_name: "Outra pessoa" });
const pcRow = (await a.from("prosthesis_events").select("author_id,author_name").eq("job_id", pj.id).eq("kind", "comment").single()).data;
check(!pc1 && pcRow?.author_id === aUser.user.id && pcRow.author_name !== "Outra pessoa", "A comenta no serviço; autor e nome vêm do servidor");
const { error: pc2 } = await a.from("prosthesis_events").insert({ clinic_id: clinicA, job_id: pj.id, kind: "comment", body: "x".repeat(255) });
check(!pc2, "comentário de 255 caracteres é aceito no serviço");
const { error: pc3 } = await a.from("prosthesis_events").insert({ clinic_id: clinicA, job_id: pj.id, kind: "comment", body: "x".repeat(256) });
check(!!pc3, "CHECK: comentário do serviço acima de 255 é recusado");
const { error: pc4 } = await a.from("prosthesis_events").insert({ clinic_id: clinicA, job_id: pj.id, kind: "stage", body: "Falso → Falso" });
check(!!pc4, "usuário NÃO forja linha de histórico do serviço");
const { error: pc5 } = await b.from("prosthesis_events").insert({ clinic_id: clinicA, job_id: pj.id, kind: "comment", body: "Intruso" });
check(!!pc5, "B NÃO comenta em serviço de A");
const { data: pcB } = await b.from("prosthesis_events").select("id").eq("job_id", pj.id);
check(pcB?.length === 0, "B NÃO vê histórico do serviço de A");
const { data: pcUpd } = await a.from("prosthesis_events").update({ body: "alterado" }).eq("job_id", pj.id).select("id");
const { data: pcDel } = await a.from("prosthesis_events").delete().eq("job_id", pj.id).select("id");
check((!pcUpd || pcUpd.length === 0) && (!pcDel || pcDel.length === 0), "histórico e comentários do serviço NÃO são editados nem apagados");

// só o dono exclui serviço e laboratório (o dentista da clínica A tem can_write, mas não é dono)
const { data: cDelPj } = await c.from("prosthesis_jobs").delete().eq("id", pj.id).select("id");
check(!cDelPj || cDelPj.length === 0, "dentista (não é o dono) NÃO exclui serviço");
const { data: cDelLab } = await c.from("laboratories").delete().eq("id", lab1.id).select("id");
check(!cDelLab || cDelLab.length === 0, "dentista (não é o dono) NÃO exclui laboratório");

// excluir laboratório solta os serviços, não os apaga
const { data: lab2 } = await a.from("laboratories").insert({ clinic_id: clinicA, name: "Lab Temporário" }).select("id").single();
const { data: pj2 } = await a.from("prosthesis_jobs").insert(job({ laboratory_id: lab2.id, description: "Faceta no 11" })).select("id").single();
const { error: lbDel } = await a.from("laboratories").delete().eq("id", lab2.id);
const pj2After = (await a.from("prosthesis_jobs").select("id,laboratory_id").eq("id", pj2.id).maybeSingle()).data;
check(!lbDel && pj2After?.id === pj2.id && pj2After.laboratory_id === null, "excluir laboratório NÃO apaga o serviço (só solta o vínculo)");
const { data: pjDel } = await a.from("prosthesis_jobs").delete().eq("id", pj2.id).select("id");
check(pjDel?.length === 1, "dono exclui serviço");
check(((await a.from("prosthesis_events").select("id").eq("job_id", pj2.id)).data ?? []).length === 0, "excluir o serviço apaga o histórico dele em cascata");

// ===== Agenda por profissional (migration 20261116000004) =====
const { data: pro1, error: pr1 } = await a.from("professionals").insert({ clinic_id: clinicA, name: "Dra. Agenda", color: "#2563eb" }).select("id").single();
check(!pr1 && pro1, "dono A cadastra profissional");
const { data: pro2 } = await a.from("professionals").insert({ clinic_id: clinicA, name: "Dr. Cadeira 2", color: "#16a34a" }).select("id").single();
for (const [label, row] of [["nome vazio", { name: "  " }], ["nome acima de 80", { name: "x".repeat(81) }], ["cor inválida", { name: "Cor ruim", color: "azul" }], ["nome repetido sem diferenciar caixa", { name: " dra. agenda " }]]) {
  const { error } = await a.from("professionals").insert({ clinic_id: clinicA, ...row });
  check(!!error, `CHECK profissional: ${label} é recusado`);
}
const { data: prB } = await b.from("professionals").select("id").eq("clinic_id", clinicA);
check(prB?.length === 0, "B NÃO vê profissionais da clínica A");
const { error: prBi } = await b.from("professionals").insert({ clinic_id: clinicA, name: "Intruso" });
check(!!prBi, "B NÃO cadastra profissional na clínica A");
const { data: prBu } = await b.from("professionals").update({ name: "Alterado por B" }).eq("id", pro1.id).select("id");
check(!prBu || prBu.length === 0, "B NÃO altera profissional de A");
const { data: prBd } = await b.from("professionals").delete().eq("id", pro1.id).select("id");
check(!prBd || prBd.length === 0, "B NÃO exclui profissional de A");
const { error: prC } = await c.from("professionals").insert({ clinic_id: clinicA, name: "Criado por dentista" });
check(!!prC, "dentista (não é o dono) NÃO cadastra profissional");
const { data: prCr } = await c.from("professionals").select("id").eq("clinic_id", clinicA);
check((prCr?.length ?? 0) >= 2, "dentista da clínica LÊ os profissionais");
const { data: proB1 } = await b.from("professionals").insert({ clinic_id: clinicB, name: "Profissional de B" }).select("id").single();

// agendamento com profissional, procedimentos e novos status
const ap = (extra = {}) => ({ clinic_id: clinicA, patient_id: pat.id, kind: "consultation", date: "2026-12-01", time: "09:00", duration_minutes: 45, ...extra });
const procs = [{ name: "Limpeza", price_cents: 15000, duration_minutes: 30 }, { name: "Aplicação de flúor", price_cents: 5000, duration_minutes: 15 }];
const { data: ap1, error: ag1 } = await a.from("appointments").insert(ap({ professional_id: pro1.id, procedures: procs, label: "Primeira consulta", forced: true })).select("id,professional_id,procedures,label,forced,status").single();
check(!ag1 && ap1?.professional_id === pro1.id && ap1.procedures.length === 2 && ap1.label === "Primeira consulta" && ap1.forced === true && ap1.status === "to_confirm", "A agenda com profissional, 2 procedimentos, etiqueta e encaixe");
const { data: apOld } = await a.from("appointments").insert(ap({ time: "15:00" })).select("id,professional_id,procedures,forced").single();
check(apOld?.professional_id === null && Array.isArray(apOld.procedures) && apOld.procedures.length === 0 && apOld.forced === false, "agendamento sem profissional continua válido (lista vazia, sem encaixe)");
for (const st of ["to_confirm", "confirmed", "waiting", "in_service", "done", "no_show", "cancelled"]) {
  const { error } = await a.from("appointments").update({ status: st }).eq("id", ap1.id);
  check(!error, `status '${st}' é aceito`);
}
const { error: stBad } = await a.from("appointments").update({ status: "voando" }).eq("id", ap1.id);
check(!!stBad, "CHECK: status inválido é recusado");
for (const [label, row] of [["procedimentos não é lista", { procedures: { nome: "x" } }], ["procedimento sem nome", { procedures: [{ name: " ", price_cents: 1, duration_minutes: 10 }] }],
  ["valor negativo", { procedures: [{ name: "x", price_cents: -1, duration_minutes: 10 }] }], ["valor quebrado", { procedures: [{ name: "x", price_cents: 1.5, duration_minutes: 10 }] }],
  ["duração zero", { procedures: [{ name: "x", price_cents: 1, duration_minutes: 0 }] }], ["duração acima de 600", { procedures: [{ name: "x", price_cents: 1, duration_minutes: 601 }] }],
  ["item que não é objeto", { procedures: ["x"] }], ["mais de 20 itens", { procedures: Array.from({ length: 21 }, () => ({ name: "x", price_cents: 1, duration_minutes: 5 })) }],
  ["etiqueta acima de 30", { label: "x".repeat(31) }]]) {
  const { error } = await a.from("appointments").insert(ap(row));
  check(!!error, `CHECK agendamento: ${label} é recusado`);
}
const { error: apXPro } = await a.from("appointments").insert(ap({ professional_id: proB1.id }));
check(!!apXPro, "agendamento NÃO aponta para profissional de outra clínica");
const { data: apB } = await b.from("appointments").select("id").eq("professional_id", pro1.id);
check(apB?.length === 0, "B NÃO vê agendamentos da clínica A por profissional");

// bloqueios
const blk = (extra = {}) => ({ clinic_id: clinicA, professional_id: pro1.id, date: "2026-12-01", start_time: "12:00", end_time: "13:00", reason: "Almoço", ...extra });
const { data: bl1, error: bk1 } = await a.from("time_blocks").insert(blk()).select("id,reason").single();
check(!bk1 && bl1?.reason === "Almoço", "A bloqueia o horário de um profissional");
const { error: bk2 } = await a.from("time_blocks").insert(blk({ professional_id: null, date: "2026-12-02", reason: "Feriado" }));
check(!bk2, "A bloqueia a clínica toda (sem profissional)");
for (const [label, row] of [["fim antes do início", { start_time: "13:00", end_time: "12:00" }], ["fim igual ao início", { start_time: "12:00", end_time: "12:00" }],
  ["motivo vazio", { reason: "  " }], ["motivo acima de 80", { reason: "x".repeat(81) }], ["profissional de outra clínica", { professional_id: proB1.id }]]) {
  const { error } = await a.from("time_blocks").insert(blk(row));
  check(!!error, `CHECK bloqueio: ${label} é recusado`);
}
const { data: blB } = await b.from("time_blocks").select("id").eq("clinic_id", clinicA);
check(blB?.length === 0, "B NÃO vê bloqueios da clínica A");
const { error: blBi } = await b.from("time_blocks").insert(blk());
check(!!blBi, "B NÃO cria bloqueio na clínica A");
const { data: blBu } = await b.from("time_blocks").update({ reason: "Alterado por B" }).eq("id", bl1.id).select("id");
check(!blBu || blBu.length === 0, "B NÃO altera bloqueio de A");
const { data: blBd } = await b.from("time_blocks").delete().eq("id", bl1.id).select("id");
check(!blBd || blBd.length === 0, "B NÃO remove bloqueio de A");
const { error: blC } = await c.from("time_blocks").insert(blk({ date: "2026-12-03" }));
check(!blC, "dentista da clínica cria bloqueio (quem escreve bloqueia)");

// excluir profissional: agendamentos ficam, sem profissional; bloqueios dele saem
const { data: proTmp } = await a.from("professionals").insert({ clinic_id: clinicA, name: "Profissional Temporário" }).select("id").single();
const { data: apTmp } = await a.from("appointments").insert(ap({ time: "16:00", professional_id: proTmp.id })).select("id").single();
const { data: blTmp } = await a.from("time_blocks").insert(blk({ professional_id: proTmp.id, date: "2026-12-04" })).select("id").single();
const { data: proDel } = await a.from("professionals").delete().eq("id", proTmp.id).select("id");
const apTmpAfter = (await a.from("appointments").select("id,professional_id").eq("id", apTmp.id).maybeSingle()).data;
const blTmpAfter = (await a.from("time_blocks").select("id").eq("id", blTmp.id).maybeSingle()).data;
check(proDel?.length === 1 && apTmpAfter?.id === apTmp.id && apTmpAfter.professional_id === null && !blTmpAfter, "excluir profissional NÃO apaga o agendamento (fica sem profissional) e remove os bloqueios dele");

// Caixa e comissão (migration 20261116000006): só dono/financeiro; nada é apagado; estorno é permanente
{
const cmv = (o = {}) => ({ clinic_id: clinicA, kind: "in", occurred_on: "2026-12-01", amount_cents: 5000, method: "cash", category: "Outras entradas", ...o });
const { data: cm1, error: cmE1 } = await a.from("cash_movements").insert(cmv({ patient_id: pat.id, professional_id: pro1.id })).select("id").single();
check(!cmE1 && cm1, "caixa: dono A lança entrada manual ligada a paciente e dentista");
const { data: cmB } = await b.from("cash_movements").select("id").eq("clinic_id", clinicA);
check((cmB?.length ?? 0) === 0, "caixa: B NÃO vê lançamentos da clínica A");
const { error: cmE2 } = await b.from("cash_movements").insert(cmv());
check(!!cmE2, "caixa: B NÃO lança no caixa da clínica A");
const { data: cmR } = await rcp.from("cash_movements").select("id").eq("clinic_id", clinicA);
check((cmR?.length ?? 0) === 0, "caixa: recepção NÃO lê o caixa");
const { error: cmE3 } = await rcp.from("cash_movements").insert(cmv());
check(!!cmE3, "caixa: recepção NÃO lança no caixa");
const { error: cmE4 } = await a.from("cash_movements").insert(cmv({ amount_cents: 0 }));
check(!!cmE4, "caixa: valor zero é recusado");
const { error: cmE5 } = await a.from("cash_movements").insert(cmv({ method: "cheque" }));
check(!!cmE5, "caixa: forma de pagamento inválida é recusada");
const { data: patB } = await b.from("patients").insert({ clinic_id: clinicB, full_name: "Paciente B caixa" }).select("id").single();
const { error: cmE6 } = await a.from("cash_movements").insert(cmv({ patient_id: patB.id }));
check(!!cmE6, "caixa: paciente de outra clínica é recusado");
const { data: cmDel } = await a.from("cash_movements").delete().eq("id", cm1.id).select("id");
check(!cmDel || cmDel.length === 0, "caixa: NINGUÉM apaga lançamento (nem o dono)");
const { error: cmE7 } = await a.from("cash_movements").update({ amount_cents: 9999 }).eq("id", cm1.id);
check(!!cmE7, "caixa: valor do lançamento não pode ser alterado");
const { error: cmE8 } = await a.from("cash_movements").update({ reversed_at: new Date().toISOString() }).eq("id", cm1.id);
check(!!cmE8, "caixa: estorno exige motivo");
const { error: cmE9 } = await a.from("cash_movements").update({ reversed_at: new Date().toISOString(), reversal_reason: "Lançado errado" }).eq("id", cm1.id);
check(!cmE9, "caixa: dono estorna com motivo");
const { error: cmE10 } = await a.from("cash_movements").update({ reversed_at: null, reversal_reason: null }).eq("id", cm1.id);
check(!!cmE10, "caixa: estorno não volta atrás");

const { error: cdE1 } = await a.from("cash_days").insert({ clinic_id: clinicA, day: "2026-12-01", opening_cents: 10000 });
check(!cdE1, "caixa: dono abre o caixa do dia");
const { error: cdE2 } = await a.from("cash_days").insert({ clinic_id: clinicA, day: "2026-12-01", opening_cents: 0 });
check(!!cdE2, "caixa: um registro por dia");
const { error: cdE3 } = await a.from("cash_days").update({ counted_cents: 10000, closed_at: new Date().toISOString() }).eq("clinic_id", clinicA).eq("day", "2026-12-01");
check(!cdE3, "caixa: dono fecha o dia");
const { error: cdE4 } = await a.from("cash_days").update({ opening_cents: 1 }).eq("clinic_id", clinicA).eq("day", "2026-12-01");
check(!!cdE4, "caixa: dia fechado não muda");
const { data: cdB } = await b.from("cash_days").select("id").eq("clinic_id", clinicA);
check((cdB?.length ?? 0) === 0, "caixa: B NÃO vê fechamentos da clínica A");

const { data: instRows } = await a.from("installments").select("id").eq("budget_id", budgetId).limit(1);
const { data: cr1, error: crE1 } = await a.from("cash_receipts").insert({ clinic_id: clinicA, source_type: "installment", source_id: instRows[0].id, professional_id: pro1.id }).select("id").single();
check(!crE1 && cr1, "caixa: dono liga dentista a uma parcela existente");
const { error: crE2 } = await a.from("cash_receipts").insert({ clinic_id: clinicA, source_type: "treatment", source_id: crypto.randomUUID() });
check(!!crE2, "caixa: recebimento com origem inexistente é recusado");
const { error: crE3 } = await b.from("cash_receipts").insert({ clinic_id: clinicB, source_type: "installment", source_id: instRows[0].id });
check(!!crE3, "caixa: B NÃO liga recebimento de parcela da clínica A");

const { data: cru1, error: cruE1 } = await a.from("commission_rules").insert({ clinic_id: clinicA, professional_id: pro1.id, procedure_key: "", percent: 30.5, lab_cost_percent: 10 }).select("id").single();
check(!cruE1 && cru1, "comissão: dono define % padrão do dentista (2 casas)");
const { error: cruE2 } = await a.from("commission_rules").insert({ clinic_id: clinicA, professional_id: pro1.id, procedure_key: "", percent: 20 });
check(!!cruE2, "comissão: regra padrão é única por dentista");
const { error: cruE3 } = await a.from("commission_rules").insert({ clinic_id: clinicA, professional_id: pro1.id, procedure_key: "Implante", percent: 101 });
check(!!cruE3, "comissão: % acima de 100 é recusado");
const { error: cruE4 } = await a.from("commission_rules").insert({ clinic_id: clinicA, professional_id: pro1.id, procedure_key: "Implante", percent: 40 });
check(!cruE4, "comissão: override por procedimento");
const { data: cruB } = await b.from("commission_rules").select("id").eq("clinic_id", clinicA);
check((cruB?.length ?? 0) === 0, "comissão: B NÃO vê regras da clínica A");
const { error: cruE5 } = await b.from("commission_rules").insert({ clinic_id: clinicA, professional_id: pro1.id, procedure_key: "X", percent: 10 });
check(!!cruE5, "comissão: B NÃO cria regra na clínica A");
const { data: cruR } = await rcp.from("commission_rules").select("id").eq("clinic_id", clinicA);
check((cruR?.length ?? 0) === 0, "comissão: recepção NÃO lê regras");
const { error: cruE6 } = await a.from("commission_rules").insert({ clinic_id: clinicB, professional_id: pro1.id, procedure_key: "Y", percent: 10 });
check(!!cruE6, "comissão: dono A NÃO cria regra na clínica B");

const { data: cpo, error: cpoE1 } = await a.from("commission_payouts").insert({ clinic_id: clinicA, professional_id: pro1.id, professional_name: "Dra. Agenda", period_from: "2026-12-01", period_to: "2026-12-31", amount_cents: 1500 }).select("id").single();
check(!cpoE1 && cpo, "comissão: dono registra pagamento");
const { data: cpoUp } = await a.from("commission_payouts").update({ amount_cents: 1 }).eq("id", cpo.id).select("id");
const { data: cpoNow } = await a.from("commission_payouts").select("amount_cents").eq("id", cpo.id).single();
check((cpoUp?.length ?? 0) === 0 && cpoNow?.amount_cents === 1500, "comissão: pagamento não pode ser alterado");
const { data: cpoDel } = await a.from("commission_payouts").delete().eq("id", cpo.id).select("id");
check(!cpoDel || cpoDel.length === 0, "comissão: NINGUÉM apaga pagamento");
const { data: cpoB } = await b.from("commission_payouts").select("id").eq("clinic_id", clinicA);
check((cpoB?.length ?? 0) === 0, "comissão: B NÃO vê pagamentos da clínica A");
const { error: cpiE1 } = await a.from("commission_payout_items").insert({ clinic_id: clinicA, payout_id: cpo.id, source_type: "installment", source_id: crypto.randomUUID(), amount_cents: 100 });
check(!!cpiE1, "comissão: item com recebimento inexistente é recusado");
const { error: cpiE2 } = await a.from("commission_payout_items").insert({ clinic_id: clinicA, payout_id: cpo.id, source_type: "installment", source_id: instRows[0].id, amount_cents: 100 });
check(!cpiE2, "comissão: item de recebimento real entra no pagamento");
const { error: cpiE3 } = await a.from("commission_payout_items").insert({ clinic_id: clinicA, payout_id: cpo.id, source_type: "installment", source_id: instRows[0].id, amount_cents: 100 });
check(!!cpiE3, "comissão: o mesmo recebimento NÃO entra em dois pagamentos");

}
// Convênios e faturamento (migration 20261116000007): isolamento entre clínicas, integridade e só-dono-apaga
const { data: insA, error: insE1 } = await a.from("insurers").insert({ clinic_id: clinicA, name: "Convênio A" }).select("id").single();
check(!insE1 && insA, "A cadastra convênio na clínica A");
const { data: insB } = await b.from("insurers").insert({ clinic_id: clinicB, name: "Convênio B" }).select("id").single();
const { data: insSee } = await b.from("insurers").select("id").eq("clinic_id", clinicA);
check((insSee?.length ?? 0) === 0, "B NÃO enxerga convênios da clínica A");
const { error: insDup } = await a.from("insurers").insert({ clinic_id: clinicA, name: "  convênio a " });
check(!!insDup, "nome de convênio repetido na mesma clínica é recusado");
const { error: insBad } = await a.from("insurers").insert({ clinic_id: clinicA, name: "Prazo ruim", payment_days: 999 });
check(!!insBad, "prazo de pagamento fora de 0 a 365 é recusado");
const { error: insX } = await a.from("insurer_prices").insert({ clinic_id: clinicA, insurer_id: insB.id, procedure_key: "x", procedure_name: "X", price_cents: 100 });
check(!!insX, "A NÃO cria valor de repasse apontando para convênio da clínica B");
const { error: insP } = await a.from("insurer_prices").insert({ clinic_id: clinicA, insurer_id: insA.id, procedure_key: "limpeza", procedure_name: "Limpeza", price_cents: 8000 });
check(!insP, "A cria valor de repasse no próprio convênio");
const { error: insPn } = await a.from("insurer_prices").insert({ clinic_id: clinicA, insurer_id: insA.id, procedure_key: "neg", procedure_name: "Negativo", price_cents: -1 });
check(!!insPn, "valor de repasse negativo é recusado");
const { error: patIns } = await a.from("patients").update({ insurer_id: insB.id }).eq("id", pat.id);
check(!!patIns, "A NÃO vincula paciente a convênio da clínica B");
const { error: patIns2 } = await a.from("patients").update({ insurer_id: insA.id, insurance_card: "123456" }).eq("id", pat.id);
check(!patIns2, "A vincula o paciente ao próprio convênio, com carteirinha");
const { data: bb1, error: bbE } = await a.from("billing_batches").insert({ clinic_id: clinicA, insurer_id: insA.id, year: 2026, month: 11 }).select("id").single();
check(!bbE && bb1, "A cria lote de faturamento");
const { error: bbX } = await a.from("billing_batches").insert({ clinic_id: clinicA, insurer_id: insB.id, year: 2026, month: 11 });
check(!!bbX, "A NÃO cria lote para convênio da clínica B");
const { error: bbM } = await a.from("billing_batches").insert({ clinic_id: clinicA, insurer_id: insA.id, year: 2026, month: 13 });
check(!!bbM, "mês fora de 1 a 12 é recusado");
const { data: bi1, error: biE } = await a.from("billing_items").insert({ clinic_id: clinicA, batch_id: bb1.id, patient_id: pat.id, procedure_name: "Limpeza", performed_on: "2026-11-10", billed_cents: 8000 }).select("id").single();
check(!biE && bi1, "A cria item no lote");
const { error: biOver } = await a.from("billing_items").update({ paid_cents: 7000, gloss_cents: 2000 }).eq("id", bi1.id);
check(!!biOver, "pago + glosa acima do faturado é recusado");
const { error: biOk } = await a.from("billing_items").update({ paid_cents: 6000, gloss_cents: 2000, gloss_reason: "Sem cobertura", status: "partial" }).eq("id", bi1.id);
check(!biOk, "A registra pagamento parcial com glosa e motivo");
const { data: convPatB } = await b.from("patients").insert({ clinic_id: clinicB, full_name: "Paciente B" }).select("id").single();
const { error: biPat } = await a.from("billing_items").insert({ clinic_id: clinicA, batch_id: bb1.id, patient_id: convPatB.id, procedure_name: "X", performed_on: "2026-11-10", billed_cents: 100 });
check(!!biPat, "A NÃO fatura paciente da clínica B");
const { data: bbSee } = await b.from("billing_batches").select("id").eq("clinic_id", clinicA);
const { data: biSee } = await b.from("billing_items").select("id").eq("clinic_id", clinicA);
check((bbSee?.length ?? 0) === 0 && (biSee?.length ?? 0) === 0, "B NÃO enxerga lotes nem itens da clínica A");
const { data: insMove } = await a.from("insurers").update({ clinic_id: clinicB }).eq("id", insA.id).select("id");
check(!insMove || insMove.length === 0, "A NÃO move convênio para a clínica B");
// Papel que não é dono (dentista/recepção) lê e escreve, mas não apaga: coberto pelo teste de papéis do bloco de prótese (mesma regra has_role owner).

// Acesso vencido → só leitura
await admin.from("access_grants").update({ expires_at: new Date(Date.now() - 1000).toISOString(), starts_at: new Date(Date.now() - 86400000).toISOString() }).eq("clinic_id", clinicA);
{
  const { data: vIns } = await a.from("insurers").select("id").eq("clinic_id", clinicA);
  check((vIns?.length ?? 0) >= 1, "acesso vencido: A ainda LÊ convênios");
  const { error: vE1 } = await a.from("insurers").insert({ clinic_id: clinicA, name: "Após vencer" });
  check(!!vE1, "acesso vencido: A NÃO cadastra convênio");
  const { data: vU } = await a.from("billing_items").update({ paid_cents: 0, gloss_cents: 0, status: "pending" }).eq("id", bi1.id).select("id");
  check(!vU || vU.length === 0, "acesso vencido: A NÃO altera item de faturamento");
  const { data: vD } = await a.from("billing_batches").delete().eq("id", bb1.id).select("id");
  check(!vD || vD.length === 0, "acesso vencido: A NÃO exclui lote");
}
const { data: readOk } = await a.from("patients").select("id").eq("clinic_id", clinicA);
check(readOk?.length === 2, "acesso vencido: A ainda LÊ os pacientes");
const { error: e9 } = await a.from("patients").insert({ clinic_id: clinicA, full_name: "Novo após vencer" });
check(!!e9, "acesso vencido: A NÃO consegue cadastrar");
const { data: expNotes } = await a.from("clinical_notes").select("id").eq("clinic_id", clinicA);
check(expNotes?.length === 1, "acesso vencido: A ainda LÊ as notas de evolução");
const { data: expRec } = await a.from("anamnesis_records").select("id").eq("clinic_id", clinicA);
check((expRec?.length ?? 0) >= 1, "acesso vencido: A ainda LÊ as anamneses");
const { data: expDraftUp } = await a.from("anamnesis_records").update({ status: "completed" }).eq("id", draftRev.id).select("id");
check(!expDraftUp || expDraftUp.length === 0, "acesso vencido: A NÃO conclui rascunho de anamnese");
const { data: expDraftDel } = await a.from("anamnesis_records").delete().eq("id", draftRev.id).select("id");
check(!expDraftDel || expDraftDel.length === 0, "acesso vencido: A NÃO exclui rascunho de anamnese");
const { error: x1 } = await a.from("clinical_notes").insert({ clinic_id: clinicA, patient_id: pat.id, body: "Nova após vencer" });
check(!!x1, "acesso vencido: A NÃO cria nota de evolução");
const { data: x2 } = await a.from("clinical_notes").update({ body: "Editada após vencer" }).eq("id", note.id).select("id");
check(!x2 || x2.length === 0, "acesso vencido: A NÃO edita nota de evolução");
const { data: x3 } = await a.from("clinical_notes").delete().eq("id", note.id).select("id");
check(!x3 || x3.length === 0, "acesso vencido: A NÃO exclui nota de evolução");
const { error: x4 } = await a.from("anamnesis_records").insert({ clinic_id: clinicA, patient_id: pat.id, template_name: "x", answers: [] });
check(!!x4, "acesso vencido: A NÃO preenche anamnese");
const { error: x5 } = await a.from("anamnesis_templates").insert({ clinic_id: clinicA, name: "Após vencer", questions: [] });
check(!!x5, "acesso vencido: A NÃO cria modelo de anamnese");

const { data: expRx } = await a.from("prescriptions").select("id").eq("clinic_id", clinicA);
check((expRx?.length ?? 0) >= 2, "acesso vencido: A ainda LÊ as receitas");
const { data: expCert } = await a.from("certificates").select("id").eq("clinic_id", clinicA);
check((expCert?.length ?? 0) >= 1, "acesso vencido: A ainda LÊ os atestados");
const { error: xd1 } = await a.rpc("save_prescription", { p_id: null, p_clinic: clinicA, p_patient: pat.id, p_issued_on: null, p_notes: null, p_prof_name: null, p_prof_cro: null, p_prof_cro_uf: null, p_items: [item("Após vencer")] });
check(!!xd1, "acesso vencido: A NÃO emite receita");
const { error: xd2 } = await a.from("certificates").insert({ clinic_id: clinicA, patient_id: pat.id, kind: "days", amount: 1 });
check(!!xd2, "acesso vencido: A NÃO emite atestado");
const { data: xd3 } = await a.from("certificates").update({ amount: 5 }).eq("id", cert.id).select("id");
check(!xd3 || xd3.length === 0, "acesso vencido: A NÃO edita atestado");
const { data: xd4 } = await a.from("certificates").delete().eq("id", cert.id).select("id");
check(!xd4 || xd4.length === 0, "acesso vencido: A NÃO exclui atestado");
const { error: xd5 } = await a.from("medications").insert({ clinic_id: clinicA, name: "Após vencer" });
check(!!xd5, "acesso vencido: A NÃO cria medicamento");
const { error: xd6 } = await a.from("prescription_templates").insert({ clinic_id: clinicA, name: "Após vencer", items: [item("x")] });
check(!!xd6, "acesso vencido: A NÃO cria modelo de receita");

const { error: xh1 } = await mkHof(a, clinicA, pat.id, hofItem());
check(!!xh1, "acesso vencido: A NÃO cria orçamento de HOF");
const { data: expHof } = await a.from("plan_items").select("id").eq("id", hofRow.id);
check(expHof?.length === 1, "acesso vencido: A ainda LÊ o item de HOF");
const { data: xh2 } = await a.from("plan_items").update({ hof_regions: ["nariz"] }).eq("id", hofRow.id).select("id");
check(!xh2 || xh2.length === 0, "acesso vencido: A NÃO altera item de HOF");

// Extras da B1 com acesso vencido
const { error: xe1 } = await a.from("custom_documents").insert(doc);
check(!!xe1, "acesso vencido: A NÃO cria documento personalizado");
const { data: expCd } = await a.from("custom_documents").select("id").eq("clinic_id", clinicA);
check((expCd?.length ?? 0) >= 1, "acesso vencido: A ainda LÊ os documentos personalizados");
const { data: xe2 } = await a.from("custom_documents").delete().eq("id", cd.id).select("id");
check(!xe2 || xe2.length === 0, "acesso vencido: A NÃO exclui documento personalizado");
const { error: xe3 } = await a.storage.from(bucket).upload(`${clinicA}/${pat.id}/${uid()}.pdf`, pdf(), { contentType: "application/pdf" });
check(!!xe3, "acesso vencido: A NÃO envia arquivo");
const { data: xe4 } = await a.storage.from(bucket).download(pathA);
check(!!xe4, "acesso vencido: A ainda BAIXA arquivos");
const { data: xe5 } = await a.storage.from(bucket).remove([pathA]);
check(!xe5 || xe5.length === 0, "acesso vencido: A NÃO exclui arquivo");
const { data: xe6 } = await a.from("medications").update({ unit: "x" }).eq("clinic_id", clinicA).select("id");
check(!xe6 || xe6.length === 0, "acesso vencido: A NÃO edita medicamento");
const { data: xe7 } = await a.from("prescription_templates").update({ name: "Após vencer 2" }).eq("id", tplRx.id).select("id");
check(!xe7 || xe7.length === 0, "acesso vencido: A NÃO renomeia modelo");

// Vendas com acesso vencido: lê, não escreve
const { data: expOpps } = await a.from("opportunities").select("id").eq("clinic_id", clinicA);
check((expOpps?.length ?? 0) >= 3, "acesso vencido: A ainda LÊ as oportunidades");
const { data: expStages } = await a.from("sales_stages").select("id").eq("clinic_id", clinicA);
check(expStages?.length === 4, "acesso vencido: A ainda LÊ as etapas");
const { data: expEv } = await a.from("opportunity_events").select("id").eq("opportunity_id", man.id);
check((expEv?.length ?? 0) >= 3, "acesso vencido: A ainda LÊ comentários e histórico");
const { error: xv1 } = await a.from("opportunities").insert({ clinic_id: clinicA, patient_id: pat.id, stage_id: stg("open"), title: "Após vencer" });
check(!!xv1, "acesso vencido: A NÃO cria oportunidade");
const { data: xv2 } = await a.from("opportunities").update({ stage_id: stg("won") }).eq("id", man.id).select("id");
check(!xv2 || xv2.length === 0, "acesso vencido: A NÃO move oportunidade");
const { data: xv2b } = await a.from("opportunities").update({ title: "Alterada após vencer" }).eq("id", man.id).select("id");
check(!xv2b || xv2b.length === 0, "acesso vencido: A NÃO edita oportunidade");
const { error: xv3 } = await a.from("opportunity_events").insert({ clinic_id: clinicA, opportunity_id: man.id, kind: "comment", body: "Após vencer" });
check(!!xv3, "acesso vencido: A NÃO comenta");
const { error: xv4 } = await a.from("sales_stages").insert({ clinic_id: clinicA, name: "Após vencer", position: 8 });
check(!!xv4, "acesso vencido: A NÃO cria etapa");
const { data: xv5 } = await a.from("sales_stages").update({ name: "Renomeada após vencer" }).eq("id", stg("open")).select("id");
check(!xv5 || xv5.length === 0, "acesso vencido: A NÃO renomeia etapa");
const { error: xv7 } = await a.from("sales_goals").upsert({ clinic_id: clinicA, month: "2026-11-01", goal_cents: 1 });
check(!!xv7, "acesso vencido: A NÃO altera a meta");
const { data: xv8 } = await a.from("opportunities").delete().eq("id", man.id).select("id");
check(!xv8 || xv8.length === 0, "acesso vencido: A NÃO exclui oportunidade");

// Prótese com acesso vencido: lê, não escreve
const { data: expPj } = await a.from("prosthesis_jobs").select("id").eq("clinic_id", clinicA);
check((expPj?.length ?? 0) >= 1, "acesso vencido: A ainda LÊ os serviços de prótese");
const { data: expLb } = await a.from("laboratories").select("id").eq("clinic_id", clinicA);
check((expLb?.length ?? 0) >= 1, "acesso vencido: A ainda LÊ os laboratórios");
const { data: expPe } = await a.from("prosthesis_events").select("id").eq("job_id", pj.id);
check((expPe?.length ?? 0) >= 3, "acesso vencido: A ainda LÊ comentários e histórico do serviço");
const { error: xp1 } = await a.from("prosthesis_jobs").insert(job({ description: "Após vencer" }));
check(!!xp1, "acesso vencido: A NÃO cria serviço de prótese");
const { data: xp2 } = await a.from("prosthesis_jobs").update({ stage: "done" }).eq("id", pj.id).select("id");
check(!xp2 || xp2.length === 0, "acesso vencido: A NÃO move serviço de prótese");
const { data: xp3 } = await a.from("prosthesis_jobs").update({ description: "Alterado após vencer" }).eq("id", pj.id).select("id");
check(!xp3 || xp3.length === 0, "acesso vencido: A NÃO edita serviço de prótese");
const { error: xp4 } = await a.from("prosthesis_events").insert({ clinic_id: clinicA, job_id: pj.id, kind: "comment", body: "Após vencer" });
check(!!xp4, "acesso vencido: A NÃO comenta no serviço");
const { error: xp5 } = await a.from("laboratories").insert({ clinic_id: clinicA, name: "Após vencer" });
check(!!xp5, "acesso vencido: A NÃO cadastra laboratório");
const { data: xp6 } = await a.from("laboratories").update({ name: "Renomeado após vencer" }).eq("id", lab1.id).select("id");
check(!xp6 || xp6.length === 0, "acesso vencido: A NÃO edita laboratório");
const { data: xp7 } = await a.from("prosthesis_jobs").delete().eq("id", pj.id).select("id");
check(!xp7 || xp7.length === 0, "acesso vencido: A NÃO exclui serviço de prótese");

// Agenda por profissional com acesso vencido: lê, não escreve
const { data: expPro } = await a.from("professionals").select("id").eq("clinic_id", clinicA);
check((expPro?.length ?? 0) >= 2, "acesso vencido: A ainda LÊ os profissionais");
const { data: expBl } = await a.from("time_blocks").select("id").eq("clinic_id", clinicA);
check((expBl?.length ?? 0) >= 2, "acesso vencido: A ainda LÊ os bloqueios");
const { error: xg1 } = await a.from("professionals").insert({ clinic_id: clinicA, name: "Após vencer" });
check(!!xg1, "acesso vencido: A NÃO cadastra profissional");
const { data: xg2 } = await a.from("professionals").update({ name: "Renomeado após vencer" }).eq("id", pro1.id).select("id");
check(!xg2 || xg2.length === 0, "acesso vencido: A NÃO edita profissional");
const { data: xg3 } = await a.from("professionals").delete().eq("id", pro1.id).select("id");
check(!xg3 || xg3.length === 0, "acesso vencido: A NÃO exclui profissional");
const { error: xg4 } = await a.from("time_blocks").insert(blk({ date: "2026-12-10" }));
check(!!xg4, "acesso vencido: A NÃO cria bloqueio");
const { data: xg5 } = await a.from("time_blocks").delete().eq("id", bl1.id).select("id");
check(!xg5 || xg5.length === 0, "acesso vencido: A NÃO remove bloqueio");
const { data: xg6 } = await a.from("appointments").update({ status: "in_service", professional_id: pro2.id }).eq("id", ap1.id).select("id");
check(!xg6 || xg6.length === 0, "acesso vencido: A NÃO muda status nem profissional do agendamento");

// Limpeza
await admin.from("clinics").delete().in("id", [clinicA, clinicB]);
const { count: leftover } = await admin.from("opportunities").select("id", { count: "exact", head: true }).in("clinic_id", [clinicA, clinicB]);
const { count: leftStages } = await admin.from("sales_stages").select("id", { count: "exact", head: true }).in("clinic_id", [clinicA, clinicB]);
const { count: leftPj } = await admin.from("prosthesis_jobs").select("id", { count: "exact", head: true }).in("clinic_id", [clinicA, clinicB]);
const { count: leftLab } = await admin.from("laboratories").select("id", { count: "exact", head: true }).in("clinic_id", [clinicA, clinicB]);
check(leftPj === 0 && leftLab === 0, "limpeza: excluir a clínica apaga serviços de prótese, laboratórios e histórico em cascata");
const { count: leftPro } = await admin.from("professionals").select("id", { count: "exact", head: true }).in("clinic_id", [clinicA, clinicB]);
const { count: leftBlk } = await admin.from("time_blocks").select("id", { count: "exact", head: true }).in("clinic_id", [clinicA, clinicB]);
check(leftPro === 0 && leftBlk === 0, "limpeza: excluir a clínica apaga profissionais e bloqueios em cascata");
check(leftover === 0 && leftStages === 0, "limpeza: excluir a clínica apaga etapas, oportunidades, comentários e metas em cascata");
await admin.storage.from(bucket).remove([pathA, pathC]).catch(() => {});
for (const u of [a, b, c, f, rcp]) { const { data: { user } } = await u.auth.getUser(); await admin.auth.admin.deleteUser(user.id); }
console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
