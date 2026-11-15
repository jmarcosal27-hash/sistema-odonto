"use client";

import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import type { Professional } from "@/lib/types";
import { PROFESSIONAL_COLORS } from "@/lib/agenda";
import { api } from "@/lib/store";
import { Badge, Button, Field, Input, Modal, cx } from "./ui";
import { useAction, useToast } from "./toast";

/** Cadastro dos profissionais (dentistas ou cadeiras) da agenda. Só o dono abre. */
export function ProfessionalsDialog({ professionals, onClose }: { professionals: Professional[]; onClose: () => void }) {
  const run = useAction();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null); // id, ou "new"
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROFESSIONAL_COLORS[professionals.length % PROFESSIONAL_COLORS.length]);
  const [active, setActive] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const edit = (p?: Professional) => {
    setEditing(p?.id ?? "new"); setName(p?.name ?? ""); setActive(p?.active ?? true); setTried(false);
    setColor(p?.color ?? PROFESSIONAL_COLORS[professionals.length % PROFESSIONAL_COLORS.length]);
  };
  const save = async () => {
    setTried(true);
    if (!name.trim()) return;
    try {
      await api.professionals.save({ id: editing && editing !== "new" ? editing : undefined, name, color, active });
      toast("Profissional salvo.");
      setEditing(null);
    } catch (e) { toast(e instanceof Error ? e.message : "Não foi possível salvar.", "error"); }
  };

  return (
    <Modal open onClose={onClose} title="Profissionais" subtitle="Cada profissional ganha uma coluna na agenda do dia."
      footer={<><span /><Button variant="ghost" onClick={onClose}>Fechar</Button></>}>
      <ul className="space-y-2">
        {professionals.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
            <span aria-hidden className="size-4 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            {!p.active && <Badge>Inativo</Badge>}
            {confirmDel === p.id ? (
              <>
                <span className="text-xs text-ink-muted">Os agendamentos ficam, sem profissional.</span>
                <Button size="sm" variant="danger" onClick={async () => { await run(() => api.professionals.remove(p.id), "Profissional excluído."); setConfirmDel(null); }}>Excluir</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>Manter</Button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => edit(p)} aria-label={`Editar ${p.name}`} className="grid size-10 place-items-center rounded-pill hover:bg-surface-300"><Pencil aria-hidden className="size-4" /></button>
                <button type="button" onClick={() => setConfirmDel(p.id)} aria-label={`Excluir ${p.name}`} className="grid size-10 place-items-center rounded-pill text-danger hover:bg-danger-soft"><Trash2 aria-hidden className="size-4" /></button>
              </>
            )}
          </li>
        ))}
        {!professionals.length && <li className="text-sm text-ink-muted">Nenhum profissional ainda. Sem profissionais, a agenda usa uma coluna só.</li>}
      </ul>

      {editing === null
        ? <Button className="mt-4" variant="secondary" onClick={() => edit()}>Novo profissional</Button>
        : (
          <form className="mt-4 space-y-3 rounded-md border border-border-strong p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <p className="text-sm font-semibold">{editing === "new" ? "Novo profissional" : "Editar profissional"}</p>
            <Field label="Nome" error={tried && !name.trim() ? "Informe o nome." : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Dra. Ana ou Cadeira 2" />}
            </Field>
            <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-1">
              {PROFESSIONAL_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                  className={cx("grid size-10 place-items-center rounded-pill border-2", color === c ? "border-ink" : "border-transparent")}>
                  <span className="grid size-6 place-items-center rounded-full text-white" style={{ background: c }}>{color === c && <Check aria-hidden className="size-4" />}</span>
                </button>
              ))}
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativo (aparece na agenda e no formulário)</label>
            <div className="flex gap-2"><Button type="submit">Salvar</Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button></div>
          </form>
        )}
    </Modal>
  );
}
