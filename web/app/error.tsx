"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui";

/** Erro inesperado numa tela: explica, deixa tentar de novo e oferece a saída para o Início. Os dados não se perdem. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-xl font-semibold tracking-[-0.015em]">Esta tela não abriu</h2>
      <p className="mt-2 text-[15px] leading-6 text-ink-muted">Algo deu errado ao carregar. Seus dados continuam guardados. Tente de novo; se repetir, volte ao Início e avise o suporte.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Tentar de novo</Button>
        <Link href="/" className="inline-flex h-11 items-center rounded-md border border-border-strong/70 px-5 text-[15px] font-semibold hover:bg-surface-300">Ir para o Início</Link>
      </div>
    </div>
  );
}
