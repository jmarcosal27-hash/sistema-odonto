// Cria um usuário de teste já confirmado no projeto do .env.local (precisa da service role).
// Uso: node scripts/criar-usuario-teste.mjs <email> <senha>
// Só para ambiente de desenvolvimento: nunca aponte para um projeto com dados reais.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const [email, password] = process.argv.slice(2);
if (!email || !password) { console.error("Uso: node scripts/criar-usuario-teste.mjs <email> <senha>"); process.exit(1); }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error("Falhou:", error.message); process.exit(1); }
console.log("Usuário criado e confirmado:", data.user.email);
