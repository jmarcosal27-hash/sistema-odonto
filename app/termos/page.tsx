import { APP_NAME } from "@/lib/brand";

export const metadata = { title: "Termos de uso" };

// RASCUNHO para revisão jurídica antes do lançamento (replica-launch).
export default function Termos() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-6">
      <h1 className="text-xl font-bold">Termos de uso — {APP_NAME}</h1>
      <p className="rounded-md bg-surface-warning-subtle px-3 py-2">Rascunho. Precisa de revisão jurídica antes do lançamento.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>O acesso é vendido por período (anual), com pagamento único e sem renovação automática.</li>
        <li>Garantia de 7 dias: o valor é devolvido se pedido nesse prazo.</li>
        <li>Quando o período acaba, os dados continuam disponíveis para consulta; novos registros ficam bloqueados até a renovação.</li>
        <li>A clínica é responsável pelo conteúdo clínico que registra e pelo consentimento dos pacientes.</li>
      </ul>
    </main>
  );
}
