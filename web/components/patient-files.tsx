"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { api, isReadOnly } from "@/lib/store";
import { REMOTE } from "@/lib/supabase/client";
import { dateBR } from "@/lib/format";
import { fileSize } from "@/lib/files";
import type { Db } from "@/lib/types";
import { Button, Card } from "./ui";
import { useAction } from "./toast";

/** Radiografias, fotos e PDFs do paciente. Na nuvem ficam em bucket privado e abrem por link temporário de 60 s. */
export function PatientFiles({ db, patientId }: { db: Db; patientId: string }) {
  const run = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = isReadOnly(db);
  const files = db.patientFiles.filter((f) => f.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const f of Array.from(list)) await run(() => api.patientFiles.add(patientId, f), `${f.name} enviado.`);
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  // Abrir em nova aba exige abrir a janela no clique, antes do await, para o navegador não bloquear.
  const open = async (id: string) => {
    const w = window.open("", "_blank");
    const url = await run(() => api.patientFiles.url(id));
    if (!url) { w?.close(); return; }
    if (w) { w.opener = null; w.location.href = url; }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Arquivos</h3>
        <Button size="sm" variant="ghost" disabled={readOnly || busy} loading={busy} onClick={() => input.current?.click()}><Upload className="size-4" />Enviar arquivo</Button>
        <input ref={input} type="file" multiple hidden aria-label="Escolher arquivos do paciente" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => void upload(e.target.files)} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        PNG, JPG, WebP ou PDF, até {REMOTE ? "10 MB" : "1 MB (demonstração: o arquivo fica neste navegador)"} cada.
        {REMOTE && " Ficam em armazenamento privado da clínica e só dono, dentista e recepção veem."}
      </p>
      {!files.length ? <p className="mt-3 text-sm text-ink-muted">Nenhum arquivo ainda. Envie radiografias, fotos ou exames em PDF.</p> : (
        <ul className="mt-2 divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {f.mime === "application/pdf" ? <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" /> : <ImageIcon aria-hidden className="size-4 shrink-0 text-ink-muted" />}
                <span className="min-w-0 break-all"><span className="font-semibold">{f.name}</span><span className="text-ink-muted"> · {fileSize(f.sizeBytes)} · {dateBR(f.createdAt)}</span></span>
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => void open(f.id)} aria-label={`Abrir ${f.name}`}>Abrir</Button>
                <Button size="sm" variant="ghost" disabled={readOnly} aria-label={`Excluir ${f.name}`}
                  onClick={() => window.confirm(`Excluir "${f.name}"? Não dá para desfazer.`) && void run(() => api.patientFiles.remove(f.id), "Arquivo excluído.")}><Trash2 className="size-3.5" />Excluir</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
