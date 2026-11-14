import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// Inicia a compra (ou renovação) do acesso anual da clínica do usuário logado.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });

  const { data: member } = await sb.from("clinic_members").select("clinic_id, role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member) return NextResponse.json({ error: "Crie sua clínica primeiro." }, { status: 400 });
  if (member.role !== "owner") return NextResponse.json({ error: "Só o dono da clínica pode comprar ou renovar." }, { status: 403 });

  const price = process.env.STRIPE_PRICE_ANNUAL;
  if (!price) return NextResponse.json({ error: "Pagamento ainda não configurado." }, { status: 503 });

  const origin = new URL(req.url).origin;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity: 1 }],
    customer_email: user.email,
    client_reference_id: member.clinic_id,
    metadata: { clinic_id: member.clinic_id },
    payment_intent_data: { metadata: { clinic_id: member.clinic_id } },
    success_url: `${origin}/ajustes/conta?pagamento=ok`,
    cancel_url: `${origin}/ajustes/conta?pagamento=cancelado`,
  });
  return NextResponse.json({ url: session.url });
}
