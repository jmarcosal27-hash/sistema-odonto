"use client";

import { ask } from "./confirm";
import { useState } from "react";
import Link from "next/link";
import { Pencil, Pill, Plus, Printer, Trash2 } from "lucide-react";
import { api, isReadOnly } from "@/lib/store";
import { dateBR, todayISO, uid } from "@/lib/format";
import type { Certificate, CustomDocument, Db, MedicationRoute, Prescription, PrescriptionItem } from "@/lib/types";
import { CID_OPTIONS, cidLabel } from "@/lib/cid";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Segmented, Select, Textarea, Toggle } from "./ui";
import { useAction } from "./toast";
import { CustomDocumentForm, MedicationsManager } from "./documents-extra";

export const DOCUMENT_NOTICE = "Minuta gerada pelo SmileOS. O texto e a conformidade com as normas do CFO, da vigilância sanitária e da LGPD são de responsabilidade do profissional e da clínica; revise antes de entregar.";
export const CONTROLLED_NOTICE = "Medicamento controlado: o SmileOS não gera receita de controle especial. Use só como rascunho e transcreva para o talonário oficial.";
export const CID_NOTICE = "O CID é dado de saúde sensível e só pode constar no atestado com o consentimento do paciente.";
const UNIT_SUGGESTIONS = ["caixa", "frasco", "comprimido", "cápsula", "tubo", "bisnaga", "ampola", "pacote", "envelope"];

export const certificateLabel = (c: Pick<Certificate, "kind" | "amount">) =>
  c.kind === "days" ? `${c.amount} ${c.amount === 1 ? "dia" : "dias"}` : `${c.amount} ${c.amount === 1 ? "hora" : "horas"}`;

type Entry = { type: "rx"; doc: Prescription } | { type: "cert"; doc: Certificate } | { type: "doc"; doc: CustomDocument };
const META = {
  rx: { label: "receita", badge: "Receita", tone: "info", path: "receitas", removed: "Receita excluída." },
  cert: { label: "atestado", badge: "Atestado", tone: "accent", path: "atestados", removed: "Atestado excluído." },
  doc: { label: "documento", badge: "Documento", tone: "neutral", path: "documentos", removed: "Documento excluído." },
} as const;

/** Documentos do paciente: receitas e atestados (minutas para imprimir e assinar à mão). */
export function Documents({ db, patientId }: { db: Db; patientId: string }) {
  const run = useAction();
  const [editing, setEditing] = useState<Entry | "rx" | "cert" | "doc" | null>(null);
  const [manage, setManage] = useState(false);
  const readOnly = isReadOnly(db);
  const entries: Entry[] = [
    ...db.prescriptions.filter((d) => d.patientId === patientId).map((doc): Entry => ({ type: "rx", doc })),
    ...db.certificates.filter((d) => d.patientId === patientId).map((doc): Entry => ({ type: "cert", doc })),
    ...db.customDocuments.filter((d) => d.patientId === patientId).map((doc): Entry => ({ type: "doc", doc })),
  ].sort((a, b) => b.doc.issuedOn.localeCompare(a.doc.issuedOn) || b.doc.createdAt.localeCompare(a.doc.createdAt));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Documentos</h3>
        <span className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing("rx")}><Plus className="size-4" />Nova receita</Button>
          <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing("cert")}><Plus className="size-4" />Novo atestado</Button>
          <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing("doc")}><Plus className="size-4" />Novo documento</Button>
          <Button size="sm" variant="ghost" onClick={() => setManage(true)}><Pill className="size-4" />Medicamentos e modelos</Button>
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{DOCUMENT_NOTICE}</p>
      {!entries.length ? (
        <p className="text-sm text-ink-muted mt-3">Nenhum documento ainda. Crie uma receita, um atestado ou um documento de texto livre para imprimir e assinar.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {entries.map((e) => {
            const { label, badge, tone, path, removed } = META[e.type];
            const href = `/${path}/${e.doc.id}/imprimir`;
            return (
              <li key={e.doc.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone}>{badge}</Badge>
                    <span className="font-semibold">{dateBR(e.doc.issuedOn)}</span>
                    {e.type === "rx" && e.doc.items.some((i) => i.controlled) && <Badge tone="warning">Controlado</Badge>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <Link href={href} target="_blank" aria-label={`Ver e imprimir ${label} de ${dateBR(e.doc.issuedOn)}`}
                      className="inline-flex h-9 items-center gap-1 rounded-md px-4 text-sm font-semibold text-brand hover:bg-brand-soft"><Printer className="size-3.5" />Ver/imprimir</Link>
                    <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing(e)} aria-label={`Editar ${label} de ${dateBR(e.doc.issuedOn)}`}><Pencil className="size-3.5" />Editar</Button>
                    <Button size="sm" variant="ghost" disabled={readOnly} aria-label={`Excluir ${label} de ${dateBR(e.doc.issuedOn)}`}
                      onClick={async () => {
                        if (!(await ask({ title: `Excluir esta ${label}?`, body: "Não dá para desfazer.", confirmLabel: "Excluir", danger: true }))) return;
                        void run(() => (e.type === "rx" ? api.prescriptions.remove(e.doc.id) : e.type === "cert" ? api.certificates.remove(e.doc.id) : api.customDocuments.remove(e.doc.id)), removed);
                      }}><Trash2 className="size-3.5" />Excluir</Button>
                  </span>
                </div>
                <p className="mt-1 break-words text-ink-muted">
                  {e.type === "rx"
                    ? e.doc.items.map((i) => i.name).join(", ")
                    : e.type === "cert"
                      ? `Afastamento de ${certificateLabel(e.doc)} a partir de ${dateBR(e.doc.startsOn)}`
                      : e.doc.title}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {(editing === "rx" || (typeof editing === "object" && editing?.type === "rx")) && (
        <PrescriptionForm db={db} patientId={patientId} rx={typeof editing === "object" && editing ? (editing.doc as Prescription) : undefined} onClose={() => setEditing(null)} />
      )}
      {(editing === "doc" || (typeof editing === "object" && editing?.type === "doc")) && (
        <CustomDocumentForm patientId={patientId} doc={typeof editing === "object" && editing ? (editing.doc as CustomDocument) : undefined} onClose={() => setEditing(null)} />
      )}
      {manage && <MedicationsManager db={db} readOnly={readOnly} onClose={() => setManage(false)} />}
      {(editing === "cert" || (typeof editing === "object" && editing?.type === "cert")) && (
        <CertificateForm patientId={patientId} cert={typeof editing === "object" && editing ? (editing.doc as Certificate) : undefined} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

type Row = { key: string; name: string; quantity: string; unit: string; posology: string; route: MedicationRoute; controlled: boolean };
const emptyRow = (): Row => ({ key: uid(), name: "", quantity: "", unit: "", posology: "", route: "internal", controlled: false });
const toRow = (i: Omit<PrescriptionItem, "id" | "medicationId">): Row => ({ key: uid(), name: i.name, quantity: i.quantity === undefined ? "" : String(i.quantity), unit: i.unit ?? "", posology: i.posology, route: i.route, controlled: i.controlled });

function PrescriptionForm({ db, patientId, rx, onClose }: { db: Db; patientId: string; rx?: Prescription; onClose: () => void }) {
  const [issuedOn, setIssuedOn] = useState(rx?.issuedOn ?? todayISO());
  const [notes, setNotes] = useState(rx?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(rx ? rx.items.map(toRow) : [emptyRow()]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const listId = `meds-${patientId}`;

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // Ao escolher um medicamento já usado pela clínica, completa só o que estiver em branco.
  const onName = (r: Row, name: string) => {
    const med = db.medications.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
    set(r.key, med
      ? { name, unit: r.unit || med.unit || "", posology: r.posology || med.defaultPosology || "", route: med.route, controlled: med.controlled || r.controlled }
      : { name });
  };
  const bad = (r: Row) => !r.name.trim() || !r.posology.trim() || (r.quantity !== "" && !(Number(r.quantity) > 0));
  const items = () => rows.map((r) => ({ name: r.name.trim(), quantity: r.quantity === "" ? undefined : Number(r.quantity), unit: r.unit.trim() || undefined, posology: r.posology.trim(), route: r.route, controlled: r.controlled }));

  const save = async () => {
    setTried(true);
    if (!issuedOn || !rows.length || rows.some(bad)) return;
    setSaving(true); setError(null);
    try { await api.prescriptions.save({ id: rx?.id, patientId, issuedOn, notes, items: items() }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); setSaving(false); }
  };
  const saveTemplate = async () => {
    setTried(true);
    if (rows.some(bad)) return;
    setSavingTemplate(true); setError(null);
    try { await api.prescriptionTemplates.save({ name: templateName, items: items() }); setTemplateName(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o modelo."); }
    setSavingTemplate(false);
  };

  return (
    <Modal open wide onClose={onClose} title={rx ? "Editar receita" : "Nova receita"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">{DOCUMENT_NOTICE}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Data da receita" error={tried && !issuedOn ? "Informe a data." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}
          </Field>
          {!rx && (
            <Field label="Começar de um modelo (opcional)">
              {(id) => (
                <Select id={id} value="" onChange={(e) => {
                  const t = db.prescriptionTemplates.find((x) => x.id === e.target.value);
                  if (t) setRows(t.items.map(toRow));
                }}>
                  <option value="">{db.prescriptionTemplates.length ? "Escolher modelo…" : "Nenhum modelo salvo ainda"}</option>
                  {db.prescriptionTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}
            </Field>
          )}
        </div>
        <datalist id={listId}>{db.medications.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        <datalist id="units-list">{UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}</datalist>

        <ol className="space-y-3">
          {rows.map((r, n) => (
            <li key={r.key} className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Item {n + 1}</span>
                {rows.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remover item ${n + 1}`}><Trash2 className="size-3.5" />Remover</Button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <Field label="Medicamento" className="sm:col-span-3" hint={n === 0 && !db.medications.length ? "Os nomes que você usar aparecem aqui nas próximas receitas." : undefined}
                  error={tried && !r.name.trim() ? "Informe o nome." : undefined}>
                  {(id, d) => <Input id={id} aria-describedby={d} list={listId} maxLength={120} value={r.name} onChange={(e) => onName(r, e.target.value)} autoComplete="off" />}
                </Field>
                <Field label="Quantidade" className="sm:col-span-1" error={tried && r.quantity !== "" && !(Number(r.quantity) > 0) ? "Maior que zero." : undefined}>
                  {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min="0" step="any" value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value })} />}
                </Field>
                <Field label="Unidade" className="sm:col-span-2">
                  {(id) => <Input id={id} list="units-list" maxLength={30} value={r.unit} onChange={(e) => set(r.key, { unit: e.target.value })} autoComplete="off" />}
                </Field>
              </div>
              <Field label="Posologia (como usar)" error={tried && !r.posology.trim() ? "Informe como usar." : undefined}>
                {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} maxLength={500} value={r.posology} onChange={(e) => set(r.key, { posology: e.target.value })} />}
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <Segmented label={`Uso do item ${n + 1}`} size="sm" value={r.route} onChange={(v) => set(r.key, { route: v })}
                  options={[{ value: "internal", label: "Uso interno" }, { value: "external", label: "Uso externo" }]} />
                <Toggle label="Controlado" checked={r.controlled} onChange={(v) => set(r.key, { controlled: v })} />
              </div>
              {r.controlled && <p role="note" className="rounded-md bg-warning-soft px-3 py-2 text-sm">{CONTROLLED_NOTICE}</p>}
            </li>
          ))}
        </ol>
        {rows.length < 30 && <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, emptyRow()])}><Plus className="size-4" />Adicionar medicamento</Button>}

        <Field label="Observações (opcional)">
          {(id) => <Textarea id={id} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end rounded-md bg-surface-300 p-3">
          <Field label="Salvar estes itens como modelo" className="flex-1">
            {(id) => <Input id={id} maxLength={120} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Nome do modelo" />}
          </Field>
          <Button type="button" variant="secondary" loading={savingTemplate} disabled={templateName.trim().length < 2} onClick={saveTemplate}>Salvar modelo</Button>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CertificateForm({ patientId, cert, onClose }: { patientId: string; cert?: Certificate; onClose: () => void }) {
  const [kind, setKind] = useState<Certificate["kind"]>(cert?.kind ?? "days");
  const [amount, setAmount] = useState(cert ? String(cert.amount) : "1");
  const [issuedOn, setIssuedOn] = useState(cert?.issuedOn ?? todayISO());
  const [startsOn, setStartsOn] = useState(cert?.startsOn ?? todayISO());
  const [cid, setCid] = useState(cert?.cid ?? "");
  const [consent, setConsent] = useState(cert?.cidConsent ?? false);
  const [purpose, setPurpose] = useState(cert?.purpose ?? "");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const max = kind === "days" ? 365 : 24;
  const n = Number(amount);
  const amountBad = !Number.isInteger(n) || n < 1 || n > max;
  const cidBad = !!cid.trim() && !consent;

  const save = async () => {
    setTried(true);
    if (amountBad || cidBad || !issuedOn || !startsOn) return;
    setSaving(true); setError(null);
    try { await api.certificates.save({ id: cert?.id, patientId, issuedOn, startsOn, kind, amount: n, cid, cidConsent: consent, purpose }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={cert ? "Editar atestado" : "Novo atestado"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">{DOCUMENT_NOTICE}</p>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Afastamento por</span>
          <Segmented label="Tipo de afastamento" value={kind} onChange={setKind} options={[{ value: "days", label: "Dias" }, { value: "hours", label: "Horas" }]} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={kind === "days" ? "Quantidade de dias" : "Quantidade de horas"} error={tried && amountBad ? `Informe um número inteiro de 1 a ${max}.` : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="numeric" min="1" max={max} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="A partir de" error={tried && !startsOn ? "Informe a data." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}
          </Field>
          <Field label="Data de emissão" error={tried && !issuedOn ? "Informe a data." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}
          </Field>
        </div>
        <Field label="CID (opcional)" hint={CID_NOTICE} error={tried && cidBad ? "Marque o consentimento do paciente ou apague o CID." : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} list="cid-list" maxLength={20} value={cid} onChange={(e) => setCid(e.target.value.toUpperCase())} placeholder="Digite o código ou parte do nome" autoComplete="off" />}
        </Field>
        <datalist id="cid-list">{CID_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</datalist>
        {!!cidLabel(cid) && <p className="-mt-2 text-sm text-ink-muted">{cid.trim()}: {cidLabel(cid)}</p>}
        {!!cid.trim() && <Toggle label="O paciente autorizou o CID no atestado" checked={consent} onChange={setConsent} />}
        <Field label="Finalidade ou observação (opcional)">
          {(id) => <Textarea id={id} rows={3} maxLength={1000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Ex.: apresentação ao empregador ou à escola" />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
