import "server-only";
import Stripe from "stripe";

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");
  if (process.env.NODE_ENV !== "production" && !key.startsWith("sk_test_")) throw new Error("Use a chave de TESTE do Stripe fora de produção.");
  return new Stripe(key);
}

/** Plano vendido: acesso anual, pagamento único (sem renovação automática). */
export const PLAN = { name: "Anual", days: 365 };
