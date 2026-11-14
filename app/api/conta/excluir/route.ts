import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const body = z.object({ confirm: z.literal("EXCLUIR") });

// Exclusão de verdade: apaga a clínica (se o usuário é o único dono) com todos os
// dados em cascata, e depois o usuário. Exigido pela LGPD e pela Apple.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Digite EXCLUIR para confirmar." }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: owned } = await admin.from("clinic_members").select("clinic_id").eq("user_id", user.id).eq("role", "owner").eq("status", "active");
  for (const { clinic_id } of owned ?? []) {
    const { count } = await admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinic_id).eq("status", "active").neq("user_id", user.id);
    if (count) return NextResponse.json({ error: "Sua clínica tem outros membros. Transfira a propriedade ou remova-os antes de excluir a conta." }, { status: 409 });
    const { error } = await admin.from("clinics").delete().eq("id", clinic_id);
    if (error) return NextResponse.json({ error: "Falha ao apagar os dados da clínica." }, { status: 500 });
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Falha ao apagar o usuário." }, { status: 500 });
  await sb.auth.signOut();
  return NextResponse.json({ deleted: true });
}
