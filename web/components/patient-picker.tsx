"use client";

import { useId, useMemo, useState } from "react";
import type { Patient } from "@/lib/types";
import { cx } from "./ui";

/** Combobox acessível: busca por nome, telefone ou CPF. Opcionalmente oferece criar novo. */
export function PatientPicker({ patients, value, onChange, onCreate, label = "Paciente", invalid }: {
  patients: Patient[]; value?: string; onChange: (id: string | undefined) => void;
  onCreate?: (name: string) => void; label?: string; invalid?: boolean;
}) {
  const selected = patients.find((p) => p.id === value);
  const [q, setQ] = useState(selected?.fullName ?? "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const id = useId();

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return patients
      .filter((p) => !n || p.fullName.toLowerCase().includes(n) || (digits.length > 2 && ((p.phone ?? "").replace(/\D/g, "").includes(digits) || (p.cpf ?? "").replace(/\D/g, "").includes(digits))))
      .slice(0, 8);
  }, [q, patients]);

  const showCreate = !!onCreate && q.trim().length > 1 && !patients.some((p) => p.fullName.toLowerCase() === q.trim().toLowerCase());
  const total = results.length + (showCreate ? 1 : 0);

  const pick = (i: number) => {
    if (i < results.length) { onChange(results[i].id); setQ(results[i].fullName); }
    else if (showCreate) onCreate!(q.trim());
    setOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className={cx("text-xs font-medium", invalid ? "text-danger" : "text-muted")}>{label}</label>
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && total ? `${id}-opt-${hi}` : undefined} aria-invalid={invalid || undefined}
        value={q} placeholder="Busque por nome, telefone ou CPF" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); if (selected) onChange(undefined); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, total - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && open && total) { e.preventDefault(); pick(hi); }
          if (e.key === "Escape") setOpen(false);
        }}
        className={cx("h-10 w-full rounded-md border bg-surface px-3 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent",
          invalid ? "border-danger border-2" : "border-border-input")}
      />
      {open && total > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute top-full z-20 mt-1 w-full max-h-64 overflow-auto rounded-md bg-surface shadow-pop border border-border py-1">
          {results.map((p, i) => (
            <li key={p.id} id={`${id}-opt-${i}`} role="option" aria-selected={hi === i}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={cx("px-3 py-2 text-sm cursor-pointer", hi === i && "bg-surface-sidebar")}>
              <span className="font-medium">{p.fullName}</span>
              {p.phone && <span className="text-muted"> · {p.phone}</span>}
            </li>
          ))}
          {showCreate && (
            <li id={`${id}-opt-${results.length}`} role="option" aria-selected={hi === results.length}
              onMouseDown={(e) => { e.preventDefault(); pick(results.length); }}
              className={cx("px-3 py-2 text-sm cursor-pointer text-accent font-semibold", hi === results.length && "bg-surface-sidebar")}>
              + Cadastrar “{q.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
