import { APP_NAME } from "@/lib/brand";

export const metadata = { title: "Privacidade" };

// RASCUNHO para revisão jurídica antes do lançamento (replica-launch).
export default function Privacidade() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-6">
      <h1 className="text-xl font-bold">Política de privacidade — {APP_NAME}</h1>
      <p className="rounded-md bg-warning-soft px-3 py-2">Rascunho. Precisa de revisão jurídica antes do lançamento.</p>
      <p>A clínica é a <strong>controladora</strong> dos dados dos pacientes que cadastra; nós somos a <strong>operadora</strong> que guarda e processa esses dados para a clínica (LGPD).</p>
      <h2 className="font-semibold">Quem processa dados para nós</h2>
      <ul className="list-disc pl-5">
        <li>Supabase — banco de dados, login e arquivos.</li>
        <li>Vercel — hospedagem do sistema.</li>
        <li>Stripe — pagamento da assinatura (não guardamos dados de cartão).</li>
        <li>WhatsApp (Meta) — só quando a clínica envia mensagens aos pacientes.</li>
      </ul>
      <h2 className="font-semibold">Seus direitos</h2>
      <p>Você pode baixar todos os dados (Ajustes › Seus dados) e excluir a conta a qualquer momento (Assinatura › Excluir minha conta). A exclusão apaga os dados de verdade.</p>
    </main>
  );
}
