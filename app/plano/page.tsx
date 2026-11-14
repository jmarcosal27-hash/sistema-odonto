"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { useDb, api, planTotal } from "@/lib/store";
import { ADULT_LOWER, ADULT_UPPER, CHILD_LOWER, CHILD_UPPER, PHASES } from "@/lib/catalog";
import { money, parseMoney, age, dateBR } from "@/lib/format";
import type { PlanItem, ToothCondition, Phase } from "@/lib/types";
import { Button, Card, Segmented, PageSkeleton, Select, Input, Empty } from "@/components/ui";
import { Odontogram } from "@/components/odontogram";
import { ToothDialog } from "@/components/tooth-dialog";
import { PatientPicker } from "@/components/patient-picker";
import { PatientForm } from "@/components/patient-form";
import { useAction } from "@/components/toast";

type Region = "all" | "ur" | "ul" | "ll" | "lr";

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><PlanEditor /></Suspense>;
}

function PlanEditor() {
  const db = useDb();
  const router = useRouter();
  const params = useSearchParams();
  const run = useAction();
  const [patientId, setPatientId] = useState<string | undefined>(params.get("paciente") ?? undefined);
  const [kind, setKind] = useState<"adult" | "child">("adult");
  const [region, setRegion] = useState<Region>("all");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [marks, setMarks] = useState<Record<number, ToothCondition[]>>({});
  const [tooth, setTooth] = useState<number | undefined>();
  const [dialog, setDialog] = useState(false);
  const [newPatient, setNewPatient] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const dirty = items.length > 0 || Object.keys(marks).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const patient = db?.patients.find((p) => p.id === patientId);
  const [upper, lower] = useMemo(() => {
    const U = kind === "adult" ? ADULT_UPPER : CHILD_UPPER, L = kind === "adult" ? ADULT_LOWER : CHILD_LOWER;
    const half = U.length / 2;
    if (region === "ur") return [U.slice(0, half), []];
    if (region === "ul") return [U.slice(half), []];
    if (region === "lr") return [[], L.slice(0, half)];
    if (region === "ll") return [[], L.slice(half)];
    return [U, L];
  }, [kind, region]);

  if (!db) return <PageSkeleton />;
  const total = planTotal(items);
  const undefinedCount = items.filter((i) => i.priceCents === undefined).length;

  const openTooth = (n?: number) => { setTooth(n); setDialog(true); };
  const updateItem = (id: string, patch: Partial<PlanItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const generate = async () => {
    setTried(true);
    if (!patientId || !items.length) return;
    setSaving(true);
    const budgetId = await run(async () => {
      const planId = await api.plans.save({ patientId, kind, validityDays: 30, items });
      return api.plans.saveAsBudget(planId);
    }, "Orçamento gerado.");
    setSaving(false);
    if (budgetId) { setItems([]); setMarks({}); router.push(`/orcamentos?abrir=${budgetId}`); }
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Dentição</span>
          <Segmented label="Dentição" value={kind} onChange={(v) => { setKind(v); setRegion("all"); }} options={[{ value: "adult", label: "Permanente" }, { value: "child", label: "Decídua" }]} />
        </div>
        <PatientPicker patients={db.patients} value={patientId} onChange={setPatientId} onCreate={(name) => setNewPatient(name)} invalid={tried && !patientId} />
        {patient && <p className="text-xs text-muted md:pb-3">{age(patient.birthDate) !== undefined ? `${age(patient.birthDate)} anos · ` : ""}{patient.phone ?? "sem telefone"}</p>}
      </Card>
      {tried && !patientId && <p role="alert" className="text-sm text-danger">Escolha ou cadastre o paciente antes de gerar o orçamento.</p>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">Odontograma</h2>
            <p className="text-xs text-muted">Clique num dente ou navegue com as setas do teclado.</p>
          </div>
          <Segmented size="sm" label="Região" value={region} onChange={setRegion}
            options={[{ value: "all", label: "Boca toda" }, { value: "ur", label: "Sup. direita" }, { value: "ul", label: "Sup. esquerda" }, { value: "ll", label: "Inf. esquerda" }, { value: "lr", label: "Inf. direita" }]} />
        </div>
        <Odontogram upper={upper} lower={lower} marks={marks} selected={dialog ? tooth : undefined} onSelect={openTooth} />
      </Card>

      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4 shadow-pop">
        <div>
          <p className="text-xs text-muted">Total do plano · vale por 30 dias</p>
          <p className="text-[22px] font-bold text-success tabular-nums">{money(total)}</p>
          {undefinedCount > 0 && <p className="text-xs text-warning">{undefinedCount} {undefinedCount === 1 ? "item" : "itens"} sem valor</p>}
        </div>
        <Button size="lg" onClick={generate} loading={saving} disabled={!items.length}>Gerar orçamento</Button>
      </div>

      <section aria-labelledby="itens" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="itens" className="font-semibold">Itens do plano</h2>
          <div className="flex gap-2">
            <Button variant="soft" size="sm" onClick={() => openTooth(undefined)}><Plus className="size-4" />Item sem dente</Button>
            {dirty && <Button variant="secondary" size="sm" onClick={() => { if (confirmClear()) { setItems([]); setMarks({}); } }}><Trash2 className="size-4" />Limpar</Button>}
          </div>
        </div>
        {!items.length && <Card><Empty title="Nenhum item ainda" body="Clique num dente do odontograma para registrar o que encontrou e escolher o tratamento." /></Card>}
        {PHASES.map((ph, idx) => {
          const list = items.filter((i) => i.phase === ph.id);
          if (!list.length) return null;
          return (
            <div key={ph.id} className={`rounded-lg p-4 ${ph.tint}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-surface text-xs">{idx + 1}</span>{ph.label}</h3>
                <span className="font-semibold tabular-nums">{money(planTotal(list))}</span>
              </div>
              <p className="text-xs text-muted ml-8">{ph.hint}</p>
              <ul className="mt-3 space-y-2">
                {list.map((it) => (
                  <li key={it.id} className="grid gap-2 rounded-md bg-surface p-3 sm:grid-cols-[1fr_140px_150px_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{it.procedureName}</p>
                      <p className="text-xs text-muted">{it.tooth ? `Dente ${it.tooth}` : "Geral"}</p>
                    </div>
                    <Input aria-label={`Valor de ${it.procedureName}`} inputMode="decimal" placeholder="Valor"
                      defaultValue={it.priceCents !== undefined ? (it.priceCents / 100).toFixed(2).replace(".", ",") : ""}
                      onBlur={(e) => updateItem(it.id, { priceCents: parseMoney(e.target.value) })} />
                    <Select aria-label="Etapa" value={it.phase} onChange={(e) => updateItem(it.id, { phase: e.target.value as Phase })}>
                      {PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </Select>
                    <button type="button" aria-label={`Remover ${it.procedureName}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
                      className="justify-self-end rounded-pill p-2 text-muted hover:bg-surface-sidebar hover:text-danger"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {patient && db.budgets.some((b) => b.patientId === patient.id) && (
        <p className="text-xs text-muted">Este paciente já tem {db.budgets.filter((b) => b.patientId === patient.id).length} orçamento(s). Gerar outro cria uma segunda opção — o primeiro não é alterado. Último em {dateBR(db.budgets.filter((b) => b.patientId === patient.id).at(-1)!.presentedAt)}.</p>
      )}

      <ToothDialog
        db={db} tooth={tooth} open={dialog} onClose={() => setDialog(false)}
        conditions={tooth ? marks[tooth] ?? [] : []}
        onConditions={(c) => tooth && setMarks((m) => ({ ...m, [tooth]: c }))}
        onAdd={(item) => { setItems((xs) => [...xs, item]); setDialog(false); }}
      />
      {newPatient !== null && (
        <PatientForm open initial={{ fullName: newPatient }} onClose={() => setNewPatient(null)} onSaved={(id) => setPatientId(id)} />
      )}
    </div>
  );
}

function confirmClear() {
  return window.confirm("Apagar todos os itens deste plano? Isso não pode ser desfeito.");
}
