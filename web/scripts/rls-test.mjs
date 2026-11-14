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

// Acesso vencido → só leitura
await admin.from("access_grants").update({ expires_at: new Date(Date.now() - 1000).toISOString(), starts_at: new Date(Date.now() - 86400000).toISOString() }).eq("clinic_id", clinicA);
const { data: readOk } = await a.from("patients").select("id").eq("clinic_id", clinicA);
check(readOk?.length === 2, "acesso vencido: A ainda LÊ os pacientes");
const { error: e9 } = await a.from("patients").insert({ clinic_id: clinicA, full_name: "Novo após vencer" });
check(!!e9, "acesso vencido: A NÃO consegue cadastrar");
const { data: expNotes } = await a.from("clinical_notes").select("id").eq("clinic_id", clinicA);
check(expNotes?.length === 1, "acesso vencido: A ainda LÊ as notas de evolução");
const { data: expRec } = await a.from("anamnesis_records").select("id").eq("clinic_id", clinicA);
check(expRec?.length === 1, "acesso vencido: A ainda LÊ as anamneses");
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

// Limpeza
await admin.from("clinics").delete().in("id", [clinicA, clinicB]);
await admin.storage.from(bucket).remove([pathA, pathC]).catch(() => {});
for (const u of [a, b, c, f]) { const { data: { user } } = await u.auth.getUser(); await admin.auth.admin.deleteUser(user.id); }
console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
