"use client";

import { useState } from "react";
import Link from "next/link";
import { useDb, api } from "@/lib/store";
import { Button, Card, Field, Input, PageSkeleton, Segmented, cx } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { Profile } from "@/lib/types";
import { maskCpf } from "@/lib/format";
import { logoFromFile } from "@/lib/files";

const COLORS = ["#6d4fd8", "#0f766e", "#8a5a00", "#b42318", "#1f1b2e"];

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
        <ul className="inline-flex rounded-pill bg-surface-300 p-1 gap-1">
          <li><Link href="/ajustes" aria-current="page" className="inline-flex h-8 items-center rounded-pill bg-surface-200 px-4 text-sm font-semibold shadow-sm">Ajustes</Link></li>
          <li><Link href="/ajustes/conta" className="inline-flex h-8 items-center rounded-pill px-4 text-sm font-semibold text-ink-muted">Assinatura</Link></li>
        </ul>
      </nav>

      <Card className="space-y-4">
        <h2 className="font-semibold">Seu perfil</h2>
        {!p.professionalName && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">Sem nome, o orçamento impresso sai sem identificação.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome profissional">{(id) => <Input id={id} value={p.professionalName ?? ""} onChange={(e) => set({ professionalName: e.target.value })} placeholder="Ex.: Dra. Camila Rocha" />}</Field>
          <Field label="CRO (opcional)">{(id) => <Input id={id} value={p.cro ?? ""} onChange={(e) => set({ cro: e.target.value })} />}</Field>
          <Field label="UF do CRO" hint="Obrigatória para receitas e atestados.">{(id, d) => <Input id={id} aria-describedby={d} maxLength={2} value={p.croUf ?? ""} onChange={(e) => set({ croUf: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="SP" autoCapitalize="characters" />}</Field>
          <Field label="CPF (opcional)">{(id) => <Input id={id} inputMode="numeric" autoComplete="off" value={maskCpf(p.cpf ?? "")} onChange={(e) => set({ cpf: e.target.value.replace(/D/g, "").slice(0, 11) })} />}</Field>
          <Field label="Data de nascimento (opcional)">{(id) => <Input id={id} type="date" value={p.birthDate ?? ""} onChange={(e) => set({ birthDate: e.target.value })} />}</Field>
          <Field label="Contato no documento" className="sm:col-span-2">{(id) => <Input id={id} value={p.contact ?? ""} onChange={(e) => set({ contact: e.target.value })} placeholder="Telefone e endereço do consultório" />}</Field>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Onde você atende</span>
          <Segmented label="Onde você atende" value={p.workMode} onChange={(v) => set({ workMode: v })}
            options={[{ value: "solo", label: "Consultório próprio" }, { value: "in_clinic", label: "Em clínica de terceiros" }, { value: "owns_clinic", label: "Clínica com equipe" }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-muted">Cor do orçamento impresso</span>
          <div className="flex gap-3" role="radiogroup" aria-label="Cor do documento">
            {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={p.pdfColor === c} aria-label={c} onClick={() => set({ pdfColor: c })} style={{ background: c }} className={cx("size-9 rounded-full ring-offset-2", p.pdfColor === c && "ring-2 ring-ink")} />)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-muted">Logo nos documentos impressos (opcional)</span>
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL pequeno */}
            {p.logo ? <img src={p.logo} alt="Logo atual da clínica" className="h-14 w-auto max-w-32 rounded-md border border-border bg-white object-contain p-1" /> : <span className="text-sm text-ink-muted">Sem logo.</span>}
            <label className="inline-flex h-10 cursor-pointer items-center rounded-pill bg-surface-300 px-4 text-sm font-semibold focus-within:outline focus-within:outline-2">
              Escolher imagem
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                try { set({ logo: await logoFromFile(f) }); } catch (err) { toast(err instanceof Error ? err.message : "Não foi possível usar a imagem.", "error"); }
              }} />
            </label>
            {p.logo && <Button type="button" size="sm" variant="ghost" onClick={() => set({ logo: undefined })}>Remover</Button>}
          </div>
          <p className="text-xs text-ink-muted">Só o dono da clínica troca o logo. Ele é reduzido para caber no documento.</p>
        </div>
        <div className="flex justify-end"><Button disabled={!dirty} onClick={async () => { try { await api.account.updateProfile(draft); setDraft({}); toast("Ajustes salvos."); } catch (e) { toast(e instanceof Error ? e.message : "Não foi possível salvar.", "error"); } }}>Salvar</Button></div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Aparência</h2>
        <Segmented label="Tema" value={db.profile.theme} onChange={(v) => api.account.updateProfile({ theme: v })} options={[{ value: "system", label: "Do sistema" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} />
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Especialidades</h2><p className="text-sm text-ink-muted">{db.profile.activeSpecialtyIds.length} ativas</p></div>
        <Link href="/tabela" className="text-sm font-semibold text-brand">Escolher em Tabela de preços</Link>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Seus dados</h2>
        <p className="text-sm text-ink-muted">Os dados são seus. Baixe uma cópia completa quando quiser.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download("meus-dados.json", api.account.exportJson(), "application/json")}>Baixar tudo (JSON)</Button>
          <Link href="/pacientes" className="inline-flex h-10 items-center rounded-pill bg-surface-300 px-4 text-sm font-semibold">Exportar pacientes (planilha)</Link>
        </div>
        <details className="rounded-md bg-surface-300 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Dados de exemplo</summary>
          <p className="mt-2 text-ink-muted">Esta versão de testes guarda tudo neste navegador e começa com pacientes fictícios.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.confirm("Apagar tudo e começar do zero? Não dá para desfazer.") && api.account.reset(false)}>Começar do zero</Button>
            <Button size="sm" variant="ghost" onClick={() => window.confirm("Substituir tudo pelos dados de exemplo?") && api.account.reset(true)}>Restaurar exemplos</Button>
          </div>
        </details>
      </Card>
    </div>
  );
}
