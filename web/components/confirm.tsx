"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal } from "./ui";

/** Pedido de confirmação. `typeToConfirm` exige digitar a palavra (para ações que apagam tudo). */
export type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  typeToConfirm?: string;
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };
let push: ((p: Pending) => void) | null = null;

/** Abre o diálogo de confirmação do sistema (no lugar do window.confirm). Resolve true se a pessoa confirmar. */
export function ask(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) { resolve(window.confirm(req.body ? `${req.title}\n\n${req.body}` : req.title)); return; }
    push({ ...req, resolve });
  });
}

/** Montado uma vez no Shell. */
export function ConfirmHost() {
  const [cur, setCur] = useState<Pending | null>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    push = (p) => { setTyped(""); setCur(p); };
    return () => { push = null; };
  }, []);
  if (!cur) return null;
  const done = (ok: boolean) => { cur.resolve(ok); setCur(null); };
  const blocked = !!cur.typeToConfirm && typed.trim().toUpperCase() !== cur.typeToConfirm.toUpperCase();
  return (
    <Modal open onClose={() => done(false)} title={cur.title}
      footer={<>
        <Button variant="secondary" onClick={() => done(false)}>{cur.cancelLabel ?? "Cancelar"}</Button>
        <Button variant={cur.danger ? "danger" : "primary"} disabled={blocked} onClick={() => done(true)}>{cur.confirmLabel ?? "Confirmar"}</Button>
      </>}>
      {cur.body && <p className="text-[15px] leading-6 text-ink">{cur.body}</p>}
      {cur.typeToConfirm && (
        <label className="mt-4 block">
          <span className="text-sm font-medium">Para confirmar, digite <strong className="font-semibold">{cur.typeToConfirm}</strong></span>
          <Input className="mt-1.5" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !blocked) done(true); }} />
        </label>
      )}
    </Modal>
  );
}
