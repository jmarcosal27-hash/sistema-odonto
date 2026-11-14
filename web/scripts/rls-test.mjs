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

// Acesso vencido → só leitura
await admin.from("access_grants").update({ expires_at: new Date(Date.now() - 1000).toISOString(), starts_at: new Date(Date.now() - 86400000).toISOString() }).eq("clinic_id", clinicA);
const { data: readOk } = await a.from("patients").select("id").eq("clinic_id", clinicA);
check(readOk?.length === 1, "acesso vencido: A ainda LÊ os pacientes");
const { error: e9 } = await a.from("patients").insert({ clinic_id: clinicA, full_name: "Novo após vencer" });
check(!!e9, "acesso vencido: A NÃO consegue cadastrar");

// Limpeza
await admin.from("clinics").delete().in("id", [clinicA, clinicB]);
for (const c of [a, b]) { const { data: { user } } = await c.auth.getUser(); await admin.auth.admin.deleteUser(user.id); }
console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
