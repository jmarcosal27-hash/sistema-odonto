"use client";

import Link from "next/link";
import { useDb, isReadOnly } from "@/lib/store";
import { dateBR } from "@/lib/format";
import { Button, Card, PageSkeleton, Badge } from "@/components/ui";

export default function Page() {
  const db = useDb();
  if (!db) return <PageSkeleton />;
  const a = db.access;
  const left = Math.max(0, Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86400000));
  const expired = isReadOnly(db);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Ajustes" className="flex justify-center">
        <ul className="inline-flex rounded-pill bg-surface-sidebar p-1 gap-1">
          <li><Link href="/ajustes" className="inline-flex h-8 items-center rounded-pill px-4 text-sm font-semibold text-muted">Ajustes</Link></li>
          <li><Link href="/ajustes/conta" aria-current="page" className="inline-flex h-8 items-center rounded-pill bg-surface px-4 text-sm font-semibold shadow-card">Assinatura</Link></li>
        </ul>
      </nav>

      <section className="rounded-lg bg-text p-6 text-surface">
        <p className="text-sm opacity-80">Sua assinatura</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xl font-bold">Plano {a.plan}</p><p className="text-sm opacity-80">{expired ? "Vencido — modo consulta" : "Ativo · sem renovação automática"}</p></div>
          <div className="text-right"><p className="text-sm opacity-80">Vale até</p><p className="text-xl font-bold">{dateBR(a.expiresAt)}</p><p className="text-sm opacity-80">{left} dias restantes</p></div>
        </div>
      </section>

      <Card className="space-y-3">
        <h2 className="font-semibold">Como funciona</h2>
        <ul className="list-disc pl-5 text-sm text-muted space-y-1">
          <li>Pagamento único por período. Nada é cobrado automaticamente no cartão.</li>
          <li>Ao vencer, nada é apagado: você continua entrando e consultando tudo, só não registra coisas novas.</li>
          <li>Renovando antes do fim, o tempo novo é somado ao que falta.</li>
        </ul>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted">Início</dt><dd>{dateBR(a.startsAt)}</dd></div>
          <div><dt className="text-xs text-muted">Situação</dt><dd>{expired ? <Badge tone="danger">Vencido</Badge> : <Badge tone="success">Ativo</Badge>}</dd></div>
        </dl>
        <Button disabled title="Pagamento entra no /replica-backend (Stripe Checkout)">Renovar (em breve)</Button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Acesso</h2>
        <p className="text-sm">Entrou como <span className="font-semibold">{a.email}</span></p>
        <p className="text-xs text-muted">Login, troca de senha e saída de outros aparelhos chegam com a autenticação real (próxima etapa).</p>
      </Card>
    </div>
  );
}
