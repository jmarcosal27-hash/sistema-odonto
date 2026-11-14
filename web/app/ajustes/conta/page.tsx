"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDb, isReadOnly, useRemoteState } from "@/lib/store";
import { REMOTE, supabaseBrowser } from "@/lib/supabase/client";
import { dateBR } from "@/lib/format";
import { Button, Card, PageSkeleton, Badge, Modal, Field, Input, ErrorNote } from "@/components/ui";
import { useToast } from "@/components/toast";

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><Account /></Suspense>;
}

function Account() {
  const db = useDb();
  const remote = useRemoteState();
  const toast = useToast();
  const params = useSearchParams();
  const [buying, setBuying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!db) return <PageSkeleton />;
  const a = db.access;
  const left = Math.max(0, Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86400000));
  const expired = isReadOnly(db);
  const isOwner = remote?.status === "ready" ? remote.session.role === "owner" : true;
  const paid = params.get("pagamento");

  const buy = async () => {
    setBuying(true);
    const r = await fetch("/api/stripe/checkout", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (j.url) window.location.href = j.url;
    else { toast(j.error ?? "Não foi possível abrir o pagamento.", "error"); setBuying(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Ajustes" className="flex justify-center">
        <ul className="inline-flex rounded-pill bg-surface-300 p-1 gap-1">
          <li><Link href="/ajustes" className="inline-flex h-8 items-center rounded-pill px-4 text-sm font-semibold text-ink-muted">Ajustes</Link></li>
          <li><Link href="/ajustes/conta" aria-current="page" className="inline-flex h-8 items-center rounded-pill bg-surface-200 px-4 text-sm font-semibold shadow-sm">Assinatura</Link></li>
        </ul>
      </nav>

      {paid === "ok" && <p role="status" className="rounded-md bg-success-soft px-4 py-3 text-sm">Pagamento recebido. O acesso é atualizado em instantes (Pix pode levar alguns minutos).</p>}
      {paid === "cancelado" && <p role="status" className="rounded-md bg-surface-300 px-4 py-3 text-sm">Pagamento cancelado. Nada foi cobrado.</p>}

      <section className="rounded-lg bg-ink p-6 text-surface-100">
        <p className="text-sm opacity-80">Sua assinatura</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xl font-bold">Plano {a.plan}</p><p className="text-sm opacity-80">{expired ? "Vencido — modo consulta" : "Ativo · sem renovação automática"}</p></div>
          <div className="text-right"><p className="text-sm opacity-80">Vale até</p><p className="text-xl font-bold">{dateBR(a.expiresAt)}</p><p className="text-sm opacity-80">{left} dias restantes</p></div>
        </div>
      </section>

      <Card className="space-y-3">
        <h2 className="font-semibold">Como funciona</h2>
        <ul className="list-disc pl-5 text-sm text-ink-muted space-y-1">
          <li>Pagamento único por ano (cartão ou Pix). Nada é cobrado automaticamente — não existe assinatura para cancelar.</li>
          <li>Ao vencer, nada é apagado: a equipe continua entrando e consultando tudo, só não registra coisas novas.</li>
          <li>Renovando antes do fim, o ano novo é somado ao que falta.</li>
          <li>Garantia de 7 dias: pediu, devolvemos.</li>
        </ul>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-ink-muted">Início</dt><dd>{dateBR(a.startsAt)}</dd></div>
          <div><dt className="text-xs text-ink-muted">Situação</dt><dd>{expired ? <Badge tone="danger">Vencido</Badge> : <Badge tone="success">Ativo</Badge>}</dd></div>
        </dl>
        {REMOTE
          ? isOwner ? <Button onClick={buy} loading={buying}>{a.plan === "Teste" ? "Comprar o plano anual" : "Renovar por mais um ano"}</Button>
                    : <p className="text-sm text-ink-muted">Só o dono da clínica compra ou renova.</p>
          : <p className="text-sm text-ink-muted">No modo demonstração não há pagamento.</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Acesso</h2>
        <p className="text-sm">Entrou como <span className="font-semibold">{a.email}</span></p>
        {REMOTE && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={async () => { await supabaseBrowser().auth.signOut({ scope: "global" }); window.location.href = "/entrar"; }}>Sair de todos os aparelhos</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>Excluir minha conta</Button>
          </div>
        )}
      </Card>
      {deleting && <DeleteAccount onClose={() => setDeleting(false)} />}
    </div>
  );
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Excluir conta" subtitle="Apaga você e, se for o único dono, a clínica inteira com pacientes, agenda e financeiro. Não dá para desfazer."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" disabled={text !== "EXCLUIR" || !password} loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        const r = await fetch("/api/conta/excluir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: text, password }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) window.location.href = "/entrar"; else { setError(j.error ?? "Não foi possível excluir."); setBusy(false); }
      }}>Excluir para sempre</Button></>}>
      <div className="space-y-3">
        <ErrorNote message={error} />
        <p className="text-sm">Antes, baixe uma cópia em Ajustes › Seus dados.</p>
        <Field label="Digite EXCLUIR para confirmar">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />}</Field>
        <Field label="Sua senha">{(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>
      </div>
    </Modal>
  );
}
