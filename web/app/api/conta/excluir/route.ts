import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const body = z.object({ confirm: z.literal("EXCLUIR"), password: z.string().min(1).max(200) });

// Exclusão de verdade: apaga a clínica (se o usuário é o único dono) com todos os
// dados em cascata, e depois o usuário. Exigido pela LGPD e pela Apple.
// Exige a senha (um cookie de sessão roubado não basta) e confere todas as condições
// antes de apagar qualquer coisa, para nunca deixar a exclusão pela metade.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Digite EXCLUIR e informe sua senha." }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });

  // Confere a senha num cliente descartável, sem mexer na sessão atual.
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: pwError } = await check.auth.signInWithPassword({ email: user.email, password: parsed.data.password });
  if (pwError) return NextResponse.json({ error: "Senha incorreta." }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: owned, error: ownedError } = await admin.from("clinic_members").select("clinic_id").eq("user_id", user.id).eq("role", "owner").eq("status", "active");
  if (ownedError) return NextResponse.json({ error: "Falha ao verificar a clínica." }, { status: 500 });

  // 1) Verifica tudo; 2) só então apaga.
  for (const { clinic_id } of owned ?? []) {
    const { count, error } = await admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinic_id).eq("status", "active").neq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Falha ao verificar a equipe." }, { status: 500 });
    if (count) return NextResponse.json({ error: "Sua clínica tem outros membros. Transfira a propriedade ou remova-os antes de excluir a conta." }, { status: 409 });
  }
  for (const { clinic_id } of owned ?? []) {
    const { error } = await admin.from("clinics").delete().eq("id", clinic_id);
    if (error) return NextResponse.json({ error: "Falha ao apagar os dados da clínica." }, { status: 500 });
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Falha ao apagar o usuário." }, { status: 500 });
  await sb.auth.signOut();
  return NextResponse.json({ deleted: true });
}
