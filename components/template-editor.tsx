"use client";

import { useState } from "react";
import type { MessageTemplate } from "@/lib/types";
import { api } from "@/lib/store";
import { Modal, Button, Field, Textarea } from "./ui";
import { useToast } from "./toast";

export function TemplateEditor({ template, onClose }: { template: MessageTemplate; onClose: () => void }) {
  const [body, setBody] = useState(template.body);
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title={template.kind === "confirmation" ? "Mensagem de confirmação" : "Mensagem de retorno"}
      subtitle="Use {nome}, {data} e {hora} — são trocados pelos dados de cada paciente."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={body.trim().length < 5} onClick={async () => { await api.account.updateTemplate({ kind: template.kind, body }); toast("Mensagem salva."); onClose(); }}>Salvar</Button></>}>
      <Field label="Texto">{(id) => <Textarea id={id} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
    </Modal>
  );
}

export function fill(body: string, vars: { nome: string; data?: string; hora?: string }) {
  return body.replaceAll("{nome}", vars.nome).replaceAll("{data}", vars.data ?? "").replaceAll("{hora}", vars.hora ?? "a combinar");
}
