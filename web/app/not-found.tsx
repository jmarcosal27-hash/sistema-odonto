import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-xl font-semibold tracking-[-0.015em]">Página não encontrada</h2>
      <p className="mt-2 text-[15px] leading-6 text-ink-muted">O endereço pode ter mudado ou o registro foi removido. Use a busca (Ctrl K) para achar um paciente.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-md bg-brand px-5 text-[15px] font-semibold text-on-brand hover:bg-brand-hover">Ir para o Início</Link>
    </div>
  );
}
