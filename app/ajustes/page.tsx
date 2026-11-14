"use client";

import { useState } from "react";
import Link from "next/link";
import { useDb, api } from "@/lib/store";
import { Button, Card, Field, Input, PageSkeleton, Segmented, cx } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { Profile } from "@/lib/types";

const COLORS = ["#3D63D6", "#1F7A52", "#8F5F16", "#B3404A", "#16262B"];

export default function Page() {
  const db = useDb();
  const toast = useToast();
  const [draft, setDraft] = useState<Partial<Profile>>({});
  if (!db) return <PageSkeleton />;
  const p = { ...db.profile, ...draft };
  const set = (x: Partial<Profile>) => setDraft((d) => ({ ...d, ...x }));
  const dirty = Object.keys(draft).length > 0;

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Ajustes" className="flex justify-center">
        <ul className="inline-flex rounded-pill bg-surface-sidebar p-1 gap-1">
          <li><Link href="/ajustes" aria-current="page" className="inline-flex h-8 items-center rounded-pill bg-surface px-4 text-sm font-semibold shadow-card">Ajustes</Link></li>
          <li><Link href="/ajustes/conta" className="inline-flex h-8 items-center rounded-pill px-4 text-sm font-semibold text-muted">Assinatura</Link></li>
        </ul>
      </nav>

      <Card className="space-y-4">
        <h2 className="font-semibold">Seu perfil</h2>
        {!p.professionalName && <p className="rounded-md bg-surface-warning-subtle px-3 py-2 text-sm">Sem nome, o orçamento impresso sai sem identificação.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome profissional">{(id) => <Input id={id} value={p.professionalName ?? ""} onChange={(e) => set({ professionalName: e.target.value })} placeholder="Ex.: Dra. Camila Rocha" />}</Field>
          <Field label="CRO (opcional)">{(id) => <Input id={id} value={p.cro ?? ""} onChange={(e) => set({ cro: e.target.value })} />}</Field>
          <Field label="Contato no documento" className="sm:col-span-2">{(id) => <Input id={id} value={p.contact ?? ""} onChange={(e) => set({ contact: e.target.value })} placeholder="Telefone e endereço do consultório" />}</Field>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Onde você atende</span>
          <Segmented label="Onde você atende" value={p.workMode} onChange={(v) => set({ workMode: v })}
            options={[{ value: "solo", label: "Consultório próprio" }, { value: "in_clinic", label: "Em clínica de terceiros" }, { value: "owns_clinic", label: "Clínica com equipe" }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Cor do orçamento impresso</span>
          <div className="flex gap-3" role="radiogroup" aria-label="Cor do documento">
            {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={p.pdfColor === c} aria-label={c} onClick={() => set({ pdfColor: c })} style={{ background: c }} className={cx("size-9 rounded-full ring-offset-2", p.pdfColor === c && "ring-2 ring-text")} />)}
          </div>
        </div>
        <div className="flex justify-end"><Button disabled={!dirty} onClick={async () => { await api.account.updateProfile(draft); setDraft({}); toast("Ajustes salvos."); }}>Salvar</Button></div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Aparência</h2>
        <Segmented label="Tema" value={db.profile.theme} onChange={(v) => api.account.updateProfile({ theme: v })} options={[{ value: "system", label: "Do sistema" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} />
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Especialidades</h2><p className="text-sm text-muted">{db.profile.activeSpecialtyIds.length} ativas</p></div>
        <Link href="/tabela" className="text-sm font-semibold text-accent">Escolher em Tabela de preços</Link>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Seus dados</h2>
        <p className="text-sm text-muted">Os dados são seus. Baixe uma cópia completa quando quiser.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download("meus-dados.json", api.account.exportJson(), "application/json")}>Baixar tudo (JSON)</Button>
          <Link href="/pacientes" className="inline-flex h-10 items-center rounded-pill bg-surface-sidebar px-4 text-sm font-semibold">Exportar pacientes (planilha)</Link>
        </div>
        <details className="rounded-md bg-surface-sidebar p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Dados de exemplo</summary>
          <p className="mt-2 text-muted">Esta versão de testes guarda tudo neste navegador e começa com pacientes fictícios.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.confirm("Apagar tudo e começar do zero? Não dá para desfazer.") && api.account.reset(false)}>Começar do zero</Button>
            <Button size="sm" variant="ghost" onClick={() => window.confirm("Substituir tudo pelos dados de exemplo?") && api.account.reset(true)}>Restaurar exemplos</Button>
          </div>
        </details>
      </Card>
    </div>
  );
}
