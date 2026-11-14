import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, PLAN } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stripe → nós. Assinatura verificada. Não guardamos "evento já visto": a liberação de
// acesso (grant_access) é idempotente pelo id da sessão de checkout, então repetir a entrega
// é seguro e uma falha no meio nunca deixa o evento marcado como processado.
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

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Stripe.Checkout.Session;
      const clinic = s.metadata?.clinic_id ?? s.client_reference_id;
      // Pix/boleto chegam como "completed" ainda não pagos; liberamos no async_payment_succeeded.
      if (s.mode !== "payment" || s.payment_status !== "paid") return NextResponse.json({ received: true, ignored: "não pago ou modo diferente" });
      const admin = supabaseAdmin();
      // Clínica inválida ou inexistente: responde 200 para o Stripe não repetir para sempre.
      if (!clinic || !UUID.test(clinic)) return NextResponse.json({ received: true, ignored: "clínica inválida" });
      const { data: exists, error: findErr } = await admin.from("clinics").select("id").eq("id", clinic).maybeSingle();
      if (findErr) throw findErr;
      if (!exists) return NextResponse.json({ received: true, ignored: "clínica inexistente" });
      const { error } = await admin.rpc("grant_access", { p_clinic: clinic, p_plan: PLAN.name, p_days: PLAN.days, p_session: s.id });
      if (error) throw error;
    }
    // checkout.session.async_payment_failed: nada a liberar; o cliente vê o aviso no Stripe.
  } catch {
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 }); // Stripe tenta de novo
  }
  return NextResponse.json({ received: true });
}
