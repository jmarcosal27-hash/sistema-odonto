"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarPlus, Search, UserPlus, UserRound } from "lucide-react";
import { useDb } from "@/lib/store";
import { cx } from "./ui";

type Item = { id: string; label: string; hint?: string; href: string; icon: typeof Search; group: string };

const PAGES: [string, string][] = [
  ["Início", "/"], ["Agenda", "/agenda"], ["Confirmar consultas", "/agenda/confirmar"], ["Retornos", "/agenda/retornos"], ["Lista de espera", "/agenda/espera"],
  ["Pacientes", "/pacientes"], ["Plano de tratamento", "/plano"], ["Orçamentos", "/orcamentos"], ["Atendimentos", "/atendimentos"],
  ["Vendas", "/vendas"], ["Financeiro", "/financeiro"], ["Caixa e comissões", "/caixa"], ["Convênios", "/convenios"],
  ["Controle de prótese", "/protese"], ["Indicadores", "/indicadores"], ["Tabela de preços", "/tabela"], ["Ajustes", "/ajustes"],
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca global (Ctrl+K ou /): pacientes, telas e as duas ações mais comuns do balcão. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); setSel(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const n = norm(q.trim());
    const digits = q.replace(/\D/g, "");
    const actions: Item[] = [
      { id: "a-consulta", label: "Marcar consulta", href: "/agenda?nova=1", icon: CalendarPlus, group: "Ações" },
      { id: "a-paciente", label: "Novo paciente", href: "/pacientes?novo=1", icon: UserPlus, group: "Ações" },
    ].filter((a) => !n || norm(a.label).includes(n));
    const patients: Item[] = n ? (db?.patients ?? [])
      .filter((p) => !p.archived && (norm(p.fullName).includes(n) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) || (digits.length >= 3 && (p.cpf ?? "").replace(/\D/g, "").includes(digits))))
      .slice(0, 6)
      .map((p) => ({ id: p.id, label: p.fullName, hint: p.phone, href: `/pacientes/${p.id}`, icon: UserRound, group: "Pacientes" })) : [];
    const pages: Item[] = PAGES.filter(([l]) => !n || norm(l).includes(n)).slice(0, n ? 5 : 8)
      .map(([label, href]) => ({ id: href, label, href, icon: ArrowRight, group: "Ir para" }));
    return [...patients, ...actions, ...pages];
  }, [q, db]);

  useEffect(() => { setSel(0); }, [q]);
  if (!open) return null;

  const go = (it?: Item) => { if (!it) return; onClose(); router.push(it.href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[sel]); }
    else if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-brand-ink/45 backdrop-blur-[2px] px-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface-200 shadow-md">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            role="combobox" aria-expanded aria-controls="busca-lista" aria-activedescendant={items[sel] ? `busca-${items[sel].id}` : undefined}
            placeholder="Paciente (nome, telefone ou CPF), tela ou ação" aria-label="Buscar paciente, tela ou ação"
            className="h-14 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted" />
          <kbd className="hidden sm:inline rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-ink-muted">Esc</kbd>
        </div>
        <ul id="busca-lista" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
          {!items.length && <li className="px-3 py-8 text-center text-sm text-ink-muted">Nada encontrado para “{q}”. Tente parte do nome ou o telefone.</li>}
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={it.id + it.group}>
                {(i === 0 || items[i - 1].group !== it.group) && <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-muted">{it.group}</p>}
                <button id={`busca-${it.id}`} role="option" aria-selected={i === sel} type="button" onMouseMove={() => setSel(i)} onClick={() => go(it)}
                  className={cx("flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors duration-100", i === sel ? "bg-brand-soft text-ink" : "text-ink")}>
                  <Icon aria-hidden className={cx("size-4 shrink-0", i === sel ? "text-brand" : "text-ink-muted")} />
                  <span className="flex-1 truncate font-medium">{it.label}</span>
                  {it.hint && <span className="text-xs text-ink-muted tabular-nums">{it.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="hidden sm:flex gap-4 border-t border-border px-4 py-2 text-xs text-ink-muted"><span>↑↓ navegar</span><span>Enter abrir</span><span>Ctrl K abre de qualquer tela</span></p>
      </div>
    </div>
  );
}
