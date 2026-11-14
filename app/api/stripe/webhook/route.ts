import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, PLAN } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

// Stripe → nós. Assinatura verificada, evento registrado uma vez só
// (Stripe repete entregas), e a liberação de acesso é idempotente pelo id da sessão.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "assinatura ausente" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (dup) return NextResponse.json({ error: "falha ao registrar" }, { status: 500 }); // Stripe tenta de novo

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Stripe.Checkout.Session;
      const clinic = s.metadata?.clinic_id ?? s.client_reference_id;
      // Pix/boleto chegam como "completed" ainda não pagos; liberamos no async_payment_succeeded.
      if (clinic && s.payment_status === "paid") {
        const { error } = await admin.rpc("grant_access", { p_clinic: clinic, p_plan: PLAN.name, p_days: PLAN.days, p_session: s.id });
        if (error) throw error;
      }
    }
    // checkout.session.async_payment_failed: nada a liberar; o cliente vê o aviso no Stripe.
  } catch {
    await admin.from("stripe_events").delete().eq("id", event.id); // permite reprocessar no retry
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
