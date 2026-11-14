"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid, Stethoscope, FileText, ClipboardCheck, Users, CalendarDays, BarChart3, Tags,
  Settings, CircleHelp, Sun, Moon, Monitor, Menu, X, LogOut,
} from "lucide-react";
import { cx } from "./ui";
import { ToastProvider } from "./toast";
import { HelpModal } from "./help-modal";
import { Onboarding } from "./onboarding";
import { useDb, api, isReadOnly } from "@/lib/store";
import { APP_NAME } from "@/lib/brand";

const NAV = [
  [{ href: "/", label: "Início", icon: LayoutGrid }],
  [
    { href: "/plano", label: "Plano de tratamento", icon: Stethoscope },
    { href: "/orcamentos", label: "Orçamentos", icon: FileText },
    { href: "/atendimentos", label: "Atendimentos", icon: ClipboardCheck },
  ],
  [
    { href: "/pacientes", label: "Pacientes", icon: Users },
    { href: "/agenda", label: "Agenda", icon: CalendarDays },
  ],
  [
    { href: "/financeiro", label: "Financeiro", icon: BarChart3 },
    { href: "/tabela", label: "Tabela de preços", icon: Tags },
  ],
];

const TITLES: [string, string][] = [
  ["/plano", "Plano de tratamento"], ["/orcamentos", "Orçamentos"], ["/atendimentos", "Atendimentos"],
  ["/pacientes", "Pacientes"], ["/agenda", "Agenda"], ["/financeiro", "Financeiro"],
  ["/tabela", "Tabela de preços"], ["/ajustes/conta", "Sua assinatura"], ["/ajustes", "Ajustes"],
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const db = useDb();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const theme = db?.profile.theme ?? "system";

  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  if (path.endsWith("/imprimir")) return <ToastProvider>{children}</ToastProvider>;
  const title = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "Início";
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  const nav = (
    <nav aria-label="Principal" className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-4">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent text-on-accent font-bold">{APP_NAME[0]}</span>
        <span className="font-bold">{APP_NAME}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {NAV.map((group, gi) => (
          <ul key={gi} className={cx("space-y-1 py-2", gi > 0 && "border-t border-border-input/20")}>
            {group.map(({ href, label, icon: Icon }) => {
              const active = isActive(path, href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined}
                    className={cx("flex items-center gap-3 rounded-md px-3 h-10 text-sm transition",
                      active ? "bg-surface font-semibold shadow-card" : "hover:bg-surface/60")}>
                    <Icon aria-hidden className="size-[18px]" />{label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <div className="px-2 py-3 border-t border-border-input/20">
        <Link href="/ajustes" className="flex items-center gap-3 rounded-md px-3 h-10 text-sm hover:bg-surface/60">
          <Settings aria-hidden className="size-[18px]" />Ajustes
        </Link>
        <button type="button" onClick={() => alertLogout()} className="flex w-full items-center gap-3 rounded-md px-3 h-10 text-sm text-muted hover:bg-surface/60">
          <LogOut aria-hidden className="size-[18px]" />Sair
        </button>
      </div>
    </nav>
  );

  return (
    <ToastProvider>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">Pular para o conteúdo</a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="hidden lg:block sticky top-0 h-dvh bg-surface-sidebar">{nav}</aside>

        {drawer && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setDrawer(false)}>
            <aside className="h-full w-72 max-w-[85vw] bg-surface-sidebar" onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label="Fechar menu" onClick={() => setDrawer(false)} className="absolute left-[min(18rem,85vw)] top-3 ml-2 rounded-pill bg-surface p-2"><X className="size-5" /></button>
              {nav}
            </aside>
          </div>
        )}

        <div className="min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-2 bg-bg/90 backdrop-blur px-4 lg:px-8 h-16">
            <button type="button" aria-label="Abrir menu" onClick={() => setDrawer(true)} className="lg:hidden rounded-pill p-2 hover:bg-surface-sidebar"><Menu className="size-5" /></button>
            <h1 className="text-lg font-semibold truncate flex-1">{title}</h1>
            <IconBtn label={`Tema: ${theme === "system" ? "do sistema" : theme === "light" ? "claro" : "escuro"}. Trocar`}
              onClick={() => db && api.account.updateProfile({ theme: nextTheme })}><ThemeIcon className="size-5" /></IconBtn>
            <IconBtn label="Ajuda" onClick={() => setHelp(true)}><CircleHelp className="size-5" /></IconBtn>
            <Link href="/ajustes" aria-label="Ajustes" className="rounded-pill p-2 hover:bg-surface-sidebar"><Settings className="size-5" /></Link>
          </header>

          {db && isReadOnly(db) && (
            <div role="status" className="mx-4 lg:mx-8 mb-2 rounded-md bg-surface-warning-subtle px-4 py-2 text-sm">
              Seu acesso venceu. Tudo continua visível, mas para registrar algo novo é preciso <Link href="/ajustes/conta" className="font-semibold underline">renovar</Link>.
            </div>
          )}
          {db && !db.profile.onboardingDone && path === "/" && (
            <div className="mx-4 lg:mx-8 mb-2 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
              <div className="flex-1 min-w-48">
                <p className="text-sm font-semibold">Deixe o sistema com a sua cara</p>
                <p className="text-xs text-muted">Quatro perguntas rápidas e você já sai montando o primeiro plano.</p>
              </div>
              <button type="button" onClick={() => setOnboard(true)} className="rounded-pill bg-accent text-on-accent h-9 px-4 text-sm font-semibold">Começar</button>
              <button type="button" aria-label="Dispensar" onClick={() => api.account.updateProfile({ onboardingDone: true })} className="rounded-pill p-2 text-muted hover:bg-surface-sidebar"><X className="size-4" /></button>
            </div>
          )}

          <main id="conteudo" className="flex-1 px-4 lg:px-8 pb-12 pt-2 w-full max-w-6xl mx-auto">{children}</main>
        </div>
      </div>
      <HelpModal open={help} onClose={() => setHelp(false)} onStartTour={() => { setHelp(false); setOnboard(true); }} />
      <Onboarding open={onboard} onClose={() => setOnboard(false)} />
    </ToastProvider>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded-pill p-2 hover:bg-surface-sidebar">{children}</button>;
}

function alertLogout() {
  // Sem auth real ainda (replica-backend). Volta para o início.
  window.location.href = "/";
}
