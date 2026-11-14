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
const { error: up1 } = await c.rpc("update_my_profile", { p_professional_name: "Dra. Teste", p_cro: "CRO-SP 1", p_theme: "dark" });
const { data: prof } = await admin.from("clinic_members").select("professional_name,theme,role").eq("user_id", cUser.id).eq("clinic_id", clinicA).single();
check(!up1 && prof?.professional_name === "Dra. Teste" && prof?.theme === "dark" && prof?.role === "dentist", "update_my_profile muda nome/CRO/tema e nada além");
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

// Limpeza
await admin.from("clinics").delete().in("id", [clinicA, clinicB]);
for (const u of [a, b, c]) { const { data: { user } } = await u.auth.getUser(); await admin.auth.admin.deleteUser(user.id); }
console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
