"use client";

import { useState } from "react";
import { Plus, Percent } from "lucide-react";
import { useDb, api, allProcedures, DEFAULT_RECALL_MONTHS } from "@/lib/store";
import { HOF_SPECIALTY_ID, SPECIALTIES } from "@/lib/catalog";
import { HOF_SUGGESTED_PRICES } from "@/lib/hof";
import { money, parseMoney } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Kpi, Modal, PageSkeleton, Segmented, Select, Toggle, cx } from "@/components/ui";
import { useAction } from "@/components/toast";

export default function Page() {
  const db = useDb();
  const run = useAction();
  const [tab, setTab] = useState<"prices" | "specialties">("prices");
  const [spec, setSpec] = useState("geral");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newProc, setNewProc] = useState(false);
  const [adjust, setAdjust] = useState(false);
  if (!db) return <PageSkeleton />;

  const procs = allProcedures(db);
  const active = SPECIALTIES.filter((s) => db.profile.activeSpecialtyIds.includes(s.id));
  const n = q.trim().toLowerCase();
  const shown = procs.filter((p) => (n ? p.name.toLowerCase().includes(n) && db.profile.activeSpecialtyIds.includes(p.specialtyId) : p.specialtyId === spec));
  const groups = shown.reduce<Record<string, typeof shown>>((acc, p) => { (acc[p.group] ??= []).push(p); return acc; }, {});
  const priced = procs.filter((p) => db.prices[p.id] !== undefined).length;

  // Preço sugerido de HOF: vale até a clínica definir o próprio.
  const suggested = (p: (typeof procs)[number]) => (p.specialtyId === HOF_SPECIALTY_ID && db.prices[p.id] === undefined ? HOF_SUGGESTED_PRICES[p.name] : undefined);
  const savePrice = async (id: string) => {
    await run(() => api.catalog.setPrice(id, draft.trim() ? parseMoney(draft) : undefined));
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted"><Badge tone="info">Opcional</Badge> Preço padrão agiliza o plano de tratamento. Sem preço aqui, você digita o valor na hora.</p>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Procedimentos disponíveis" value={procs.filter((p) => db.profile.activeSpecialtyIds.includes(p.specialtyId)).length} sub={`${active.length} especialidades ativas`} />
        <Kpi label="Com preço padrão" value={priced} sub={priced ? "usados automaticamente no plano" : "nenhum ainda"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: "prices", label: "Procedimentos e preços" }, { value: "specialties", label: "Especialidades" }]} />
        <div className="flex-1" />
        {tab === "prices" && <>
          <Button variant="secondary" size="sm" disabled={!priced} onClick={() => setAdjust(true)}><Percent className="size-4" />Reajustar</Button>
          <Button size="sm" onClick={() => setNewProc(true)}><Plus className="size-4" />Procedimento</Button>
        </>}
      </div>

      {tab === "specialties" ? (
        <Card className="divide-y divide-border p-0">
          {SPECIALTIES.map((s) => (
            <div key={s.id} className="px-5 py-3">
              <Toggle checked={db.profile.activeSpecialtyIds.includes(s.id)} label={s.name} hint={`${procs.filter((p) => p.specialtyId === s.id).length} procedimentos`}
                onChange={(v) => api.account.updateProfile({ activeSpecialtyIds: v ? [...db.profile.activeSpecialtyIds, s.id] : db.profile.activeSpecialtyIds.filter((x) => x !== s.id) })} />
            </div>
          ))}
        </Card>
      ) : (
        <>
          <Input aria-label="Buscar procedimento" placeholder="Buscar procedimento em todas as especialidades" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            {!n && (
              <>
                <Select aria-label="Especialidade" value={spec} onChange={(e) => setSpec(e.target.value)} className="md:hidden">{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                <nav aria-label="Especialidades" className="hidden md:block">
                  <ul className="rounded-lg bg-surface-200 p-2 shadow-sm space-y-0.5">
                    {active.map((s) => (
                      <li key={s.id}><button type="button" aria-current={spec === s.id ? "true" : undefined} onClick={() => setSpec(s.id)}
                        className={cx("flex w-full justify-between rounded-md px-3 py-2 text-left text-sm", spec === s.id ? "bg-brand-soft font-semibold" : "hover:bg-surface-300")}>
                        <span>{s.name}</span><span className="text-ink-muted">{procs.filter((p) => p.specialtyId === s.id).length}</span></button></li>
                    ))}
                  </ul>
                </nav>
              </>
            )}
            <Card className={cx("min-w-0", n && "md:col-span-2")}>
              {!shown.length && <p className="text-sm text-ink-muted">Nada encontrado.</p>}
              {Object.entries(groups).map(([g, list]) => (
                <section key={g} className="mb-4 last:mb-0">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-1">{g}</h3>
                  <ul className="divide-y divide-border">
                    {list.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <span className="text-sm">{p.name}{p.custom && <span className="ml-2 text-xs text-ink-muted">(seu)</span>}</span>
                        <span className="flex items-center gap-3">
                        <Select aria-label={`Retorno após ${p.name}`} title="Quando o paciente deve voltar depois deste procedimento" className="h-8 w-36 text-xs"
                          value={db.recallMonths[p.id] ?? ""} onChange={(e) => api.catalog.setRecallMonths(p.id, e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Retorno: {DEFAULT_RECALL_MONTHS} meses</option>
                          {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>Retorno: {m} {m === 1 ? "mês" : "meses"}</option>)}
                        </Select>
                        {editing === p.id ? (
                          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); savePrice(p.id); }}>
                            <Input autoFocus aria-label={`Preço de ${p.name}`} inputMode="decimal" className="w-28 h-8" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0,00" />
                            <Button size="sm" type="submit">Salvar</Button>
                            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancelar</Button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => { setEditing(p.id); const cur = db.prices[p.id] ?? suggested(p); setDraft(cur !== undefined ? (cur / 100).toFixed(2).replace(".", ",") : ""); }}
                            className={cx("text-sm font-semibold tabular-nums", db.prices[p.id] !== undefined ? "text-ink" : "text-brand")}>
                            {db.prices[p.id] !== undefined ? money(db.prices[p.id]) : suggested(p) !== undefined ? <>{money(suggested(p)!)} <span className="text-xs font-normal text-ink-muted">(sugerido)</span></> : "+ Definir preço"}
                          </button>
                        )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </Card>
          </div>
        </>
      )}
      {newProc && <NewProcedure onClose={() => setNewProc(false)} defaultSpec={spec} />}
      {adjust && <AdjustPrices count={priced} onClose={() => setAdjust(false)} />}
    </div>
  );
}

function NewProcedure({ onClose, defaultSpec }: { onClose: () => void; defaultSpec: string }) {
  const run = useAction();
  const [name, setName] = useState("");
  const [spec, setSpec] = useState(defaultSpec);
  const [price, setPrice] = useState("");
  return (
    <Modal open onClose={onClose} title="Novo procedimento"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={name.trim().length < 3} onClick={async () => {
        const id = await run(() => api.catalog.createCustomProcedure(name.trim(), spec), "Procedimento criado.");
        if (id && parseMoney(price)) await api.catalog.setPrice(id, parseMoney(price));
        onClose();
      }}>Criar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Especialidade">{(id) => <Select id={id} value={spec} onChange={(e) => setSpec(e.target.value)}>{SPECIALTIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        <Field label="Preço padrão (opcional)">{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />}</Field>
      </div>
    </Modal>
  );
}

function AdjustPrices({ count, onClose }: { count: number; onClose: () => void }) {
  const run = useAction();
  const [pct, setPct] = useState("10");
  const n = Number(pct.replace(",", "."));
  return (
    <Modal open onClose={onClose} title="Reajustar preços" subtitle={`Aplica a mesma porcentagem aos ${count} procedimentos com preço.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!Number.isFinite(n) || n === 0 || n < -90} onClick={async () => { await run(() => api.catalog.adjustAllPrices(n), "Preços reajustados."); onClose(); }}>Aplicar {Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n}%` : ""}</Button></>}>
      <Field label="Porcentagem" hint="Use número negativo para reduzir.">{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />}</Field>
    </Modal>
  );
}
