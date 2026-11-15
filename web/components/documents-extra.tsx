"use client";

import { ask } from "./confirm";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/store";
import { todayISO } from "@/lib/format";
import type { CustomDocument, Db, Medication } from "@/lib/types";
import { Badge, Button, ErrorNote, Field, Input, Modal, Segmented, Textarea, Toggle } from "./ui";
import { useAction } from "./toast";
import { DOCUMENT_NOTICE } from "./documents";

/** Documento de texto livre: título e corpo próprios, impresso como minuta. */
export function CustomDocumentForm({ patientId, doc, onClose }: { patientId: string; doc?: CustomDocument; onClose: () => void }) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [body, setBody] = useState(doc?.body ?? "");
  const [issuedOn, setIssuedOn] = useState(doc?.issuedOn ?? todayISO());
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setTried(true);
    if (!title.trim() || !body.trim() || !issuedOn) return;
    setSaving(true); setError(null);
    try { await api.customDocuments.save({ id: doc?.id, patientId, issuedOn, title, body }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); setSaving(false); }
  };

  return (
    <Modal open wide onClose={onClose} title={doc ? "Editar documento" : "Novo documento"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">{DOCUMENT_NOTICE}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Título" className="sm:col-span-2" error={tried && !title.trim() ? "Informe o título." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Declaração de comparecimento" />}
          </Field>
          <Field label="Data" error={tried && !issuedOn ? "Informe a data." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}
          </Field>
        </div>
        <Field label="Texto" hint={`${body.length}/10000`} error={tried && !body.trim() ? "Escreva o texto do documento." : undefined}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={10} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Editar e excluir medicamentos e modelos de receita da clínica. A permissão final é do banco (dono ou autor). */
export function MedicationsManager({ db, readOnly, onClose }: { db: Db; readOnly: boolean; onClose: () => void }) {
  const run = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <Modal open wide onClose={onClose} title="Medicamentos e modelos" subtitle="Excluir daqui não altera receitas já emitidas."
      footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="space-y-6">
        <section aria-labelledby="meds-h">
          <h3 id="meds-h" className="font-semibold">Medicamentos da clínica</h3>
          {!db.medications.length ? <p className="mt-2 text-sm text-ink-muted">Nenhum ainda. Os nomes que você usar numa receita aparecem aqui.</p> : (
            <ul className="mt-2 divide-y divide-border">
              {db.medications.map((m) => editing === m.id
                ? <li key={m.id} className="py-3"><MedicationEdit med={m} onDone={() => setEditing(null)} /></li>
                : (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="min-w-0 break-words">
                      <span className="font-semibold">{m.name}</span>{" "}
                      {m.controlled && <Badge tone="warning">Controlado</Badge>}
                      <span className="block text-ink-muted">{[m.route === "internal" ? "Uso interno" : "Uso externo", m.unit, m.defaultPosology].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing(m.id)} aria-label={`Editar ${m.name}`}><Pencil className="size-3.5" />Editar</Button>
                      <Button size="sm" variant="ghost" disabled={readOnly} aria-label={`Excluir ${m.name}`}
                        onClick={() => void ask({ title: `Excluir "${m.name}"?`, body: "O medicamento sai da lista. Receitas já emitidas não mudam.", confirmLabel: "Excluir", danger: true }).then((ok) => { if (ok) void run(() => api.medications.remove(m.id), "Medicamento excluído."); })}><Trash2 className="size-3.5" />Excluir</Button>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tpl-h">
          <h3 id="tpl-h" className="font-semibold">Modelos de receita</h3>
          {!db.prescriptionTemplates.length ? <p className="mt-2 text-sm text-ink-muted">Nenhum modelo. Salve um pela tela de nova receita.</p> : (
            <ul className="mt-2 divide-y divide-border">
              {db.prescriptionTemplates.map((t) => renaming === t.id
                ? <li key={t.id} className="py-3"><TemplateRename id={t.id} name={t.name} onDone={() => setRenaming(null)} /></li>
                : (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="min-w-0 break-words"><span className="font-semibold">{t.name}</span><span className="block text-ink-muted">{t.items.map((i) => i.name).join(", ")}</span></span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setRenaming(t.id)} aria-label={`Renomear ${t.name}`}><Pencil className="size-3.5" />Renomear</Button>
                      <Button size="sm" variant="ghost" disabled={readOnly} aria-label={`Excluir modelo ${t.name}`}
                        onClick={() => void ask({ title: `Excluir o modelo "${t.name}"?`, body: "Não dá para desfazer.", confirmLabel: "Excluir", danger: true }).then((ok) => { if (ok) void run(() => api.prescriptionTemplates.remove(t.id), "Modelo excluído."); })}><Trash2 className="size-3.5" />Excluir</Button>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function MedicationEdit({ med, onDone }: { med: Medication; onDone: () => void }) {
  const run = useAction();
  const [name, setName] = useState(med.name);
  const [unit, setUnit] = useState(med.unit ?? "");
  const [posology, setPosology] = useState(med.defaultPosology ?? "");
  const [route, setRoute] = useState(med.route);
  const [controlled, setControlled] = useState(med.controlled);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await run(() => api.medications.update(med.id, { name, route, controlled, unit, defaultPosology: posology }).then(() => true), "Medicamento salvo.");
    setSaving(false);
    if (ok) onDone();
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Nome" className="sm:col-span-2" error={!name.trim() ? "Informe o nome." : undefined}>{(id, d) => <Input id={id} aria-describedby={d} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Unidade">{(id) => <Input id={id} maxLength={30} value={unit} onChange={(e) => setUnit(e.target.value)} />}</Field>
      </div>
      <Field label="Posologia padrão">{(id) => <Textarea id={id} rows={2} maxLength={500} value={posology} onChange={(e) => setPosology(e.target.value)} />}</Field>
      <div className="flex flex-wrap items-center gap-4">
        <Segmented label="Uso" size="sm" value={route} onChange={setRoute} options={[{ value: "internal", label: "Uso interno" }, { value: "external", label: "Uso externo" }]} />
        <Toggle label="Controlado" checked={controlled} onChange={setControlled} />
      </div>
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button><Button size="sm" loading={saving} onClick={save}>Salvar</Button></div>
    </div>
  );
}

function TemplateRename({ id, name: initial, onDone }: { id: string; name: string; onDone: () => void }) {
  const run = useAction();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ok = await run(() => api.prescriptionTemplates.rename(id, name).then(() => true), "Modelo renomeado.");
    setSaving(false);
    if (ok) onDone();
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Nome do modelo" className="flex-1">{(fid) => <Input id={fid} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button><Button size="sm" loading={saving} disabled={name.trim().length < 2} onClick={save}>Salvar</Button></div>
    </div>
  );
}
