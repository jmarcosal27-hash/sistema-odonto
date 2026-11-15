"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid, Stethoscope, FileText, ClipboardCheck, Users, CalendarDays, BarChart3, Tags,
  Settings, CircleHelp, Search, Sun, Moon, Monitor, Menu, X, LogOut, TrendingUp, Handshake, FlaskConical, Wallet, IdCard,
} from "lucide-react";
import { cx } from "./ui";
import { ToastProvider } from "./toast";
import { HelpModal } from "./help-modal";
import { Onboarding } from "./onboarding";
import { useDb, api, isReadOnly, useRemoteState } from "@/lib/store";
import { REMOTE, supabaseBrowser } from "@/lib/supabase/client";
import { CreateClinic } from "./create-clinic";
import { CommandPalette } from "./command-palette";
import { ConfirmHost } from "./confirm";
import { Logo, LogoIcon } from "./logo";

// Ordem do Simples Dental: Inteligência, Pacientes, Agenda, Vendas, Financeiro, Prótese. `sub` = item recuado sob o anterior.
type NavItem = { href: string; label: string; icon: typeof LayoutGrid; sub?: boolean };
const NAV: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutGrid },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/plano", label: "Plano de tratamento", icon: Stethoscope, sub: true },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText, sub: true },
  { href: "/atendimentos", label: "Atendimentos", icon: ClipboardCheck, sub: true },
  { href: "/vendas", label: "Vendas", icon: Handshake },
  { href: "/financeiro", label: "Financeiro", icon: BarChart3 },
  { href: "/caixa", label: "Caixa", icon: Wallet },
  { href: "/convenios", label: "Convênios", icon: IdCard },
  { href: "/protese", label: "Controle de prótese", icon: FlaskConical },
  { href: "/indicadores", label: "Indicadores", icon: TrendingUp },
];

// Barra inferior do celular: o que a recepção e o dentista abrem o dia inteiro.
const TABS: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutGrid },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/caixa", label: "Caixa", icon: Wallet },
];

const TITLES: [string, string][] = [
  ["/indicadores", "Indicadores"], ["/atendimentos/parados", "Tratamentos parados"], ["/plano", "Plano de tratamento"], ["/orcamentos", "Orçamentos"], ["/vendas", "Vendas"], ["/protese", "Controle de prótese"], ["/atendimentos", "Atendimentos"],
  ["/pacientes", "Pacientes"], ["/agenda", "Agenda"], ["/financeiro", "Financeiro"], ["/caixa", "Caixa"], ["/convenios", "Convênios"],
  ["/tabela", "Tabela de preços"], ["/ajustes/conta", "Sua assinatura"], ["/ajustes", "Ajustes"],
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const db = useDb();
  const remote = useRemoteState();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [helpQ, setHelpQ] = useState<string>();
  const [onboard, setOnboard] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState(false);
  const theme = db?.profile.theme ?? "system";

  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => { setMounted(true); }, []);
  // Atalhos: Ctrl/Cmd+K abre a busca geral; "/" foca a busca da tela (ou abre a geral); "?" abre a ajuda (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
      else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "/") {
        e.preventDefault();
        // Na tela com busca própria, "/" foca essa busca; nas demais, abre a busca geral.
        const field = document.querySelector<HTMLInputElement>('#conteudo input[type="search"], #conteudo input[aria-label^="Buscar"]');
        if (field) { field.focus(); field.select(); } else setSearch(true);
      }
      else if (!typing && e.key === "?") { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  if (path.endsWith("/imprimir") || path.startsWith("/entrar") || path.startsWith("/auth") || path === "/privacidade" || path === "/termos") return <ToastProvider>{children}</ToastProvider>;
  if (remote?.status === "no-clinic") return <ToastProvider><CreateClinic email={remote.email} /></ToastProvider>;
  if (remote?.status === "error") return <ToastProvider><main className="grid min-h-dvh place-items-center p-6 text-center"><div className="space-y-3"><p className="font-semibold">{remote.message}</p><a href="/entrar" className="font-semibold text-brand">Entrar de novo</a></div></main></ToastProvider>;
  const todayLong = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const patientId = path.match(/^\/pacientes\/([^/]+)$/)?.[1];
  const title = (mounted && patientId && db?.patients.find((p) => p.id === patientId)?.fullName) || (TITLES.find(([p]) => path.startsWith(p))?.[1] ?? (path === "/" ? "Início" : "SmileOS"));
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  const nav = (
    <nav aria-label="Principal" className="flex flex-col h-full">
      <div className="px-3 pt-4 pb-3"><Logo width={136} onDark /></div>
      <div className="flex-1 overflow-y-auto px-2">
        <ul className="space-y-0.5 py-2">
          {NAV.map((it) => <li key={it.href}><NavLink it={it} path={path} /></li>)}
        </ul>
      </div>
      <div className="mx-2 px-0 py-3 border-t border-rail-line space-y-0.5">
        <NavLink it={{ href: "/ajustes", label: "Ajustes", icon: Settings }} path={path} />
        <NavLink it={{ href: "/tabela", label: "Tabela de preços", icon: Tags, sub: true }} path={path} />
        <button type="button" onClick={() => { setDrawer(false); setHelp(true); }} className="flex w-full items-center gap-3 rounded-md px-3 h-11 text-sm text-rail-ink transition-colors duration-150 hover:bg-rail-hover">
          <CircleHelp aria-hidden className="size-[18px]" />Como funciona
        </button>
        <button type="button" onClick={() => logout()} className="flex w-full items-center gap-3 rounded-md px-3 h-11 text-sm text-rail-muted transition-colors duration-150 hover:bg-rail-hover hover:text-rail-ink">
          <LogOut aria-hidden className="size-[18px]" />Sair
        </button>
      </div>
    </nav>
  );

  return (
    <ToastProvider>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-surface-200 focus:px-4 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-md">Pular para o conteúdo</a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="hidden lg:block sticky top-0 h-dvh border-r border-rail-line bg-rail text-rail-ink">{nav}</aside>

        {drawer && (
          <div className="lg:hidden fixed inset-0 z-40 bg-brand-ink/60" onClick={() => setDrawer(false)}>
            <aside className="h-full w-72 max-w-[85vw] bg-rail text-rail-ink" onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label="Fechar menu" onClick={() => setDrawer(false)} className="absolute left-[min(18rem,85vw)] top-3 ml-2 grid size-11 place-items-center rounded-pill bg-surface-200 shadow-sm"><X aria-hidden className="size-5" /></button>
              {nav}
            </aside>
          </div>
        )}

        <div className="min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-paper/85 px-4 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-paper lg:px-8">
            <div className="mx-auto flex max-w-[68rem] items-center gap-2 py-2.5 lg:py-3.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setDrawer(true)} className="lg:hidden grid size-11 place-items-center rounded-pill transition-colors duration-150 hover:bg-surface-300"><Menu aria-hidden className="size-5" /></button>
            <LogoIcon size={32} className="lg:hidden shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 flex items-baseline gap-3">
              <h1 className="text-xl lg:text-[28px] lg:leading-9 font-semibold tracking-[-0.025em] truncate">{title}</h1>
              <p className="hidden md:block min-w-0 truncate text-sm text-ink-muted first-letter:uppercase">{[todayLong, mounted && db?.profile.clinicName].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" onClick={() => setSearch(true)} aria-label="Buscar paciente, tela ou ação (Ctrl+K)" aria-keyshortcuts="Control+K"
              className="hidden md:inline-flex h-10 w-64 items-center gap-2 rounded-md border border-border bg-surface-100 px-3 text-sm text-ink-muted transition-colors duration-150 hover:border-border-strong">
              <Search aria-hidden className="size-4" /><span className="flex-1 text-left">Buscar paciente…</span><kbd className="rounded-sm border border-border px-1.5 text-[11px]">Ctrl K</kbd>
            </button>
            <button type="button" aria-label="Buscar" onClick={() => setSearch(true)} className="md:hidden grid size-11 place-items-center rounded-pill transition-colors duration-150 hover:bg-surface-300"><Search aria-hidden className="size-5" /></button>
            <IconBtn className="hidden sm:grid" label={`Tema: ${theme === "system" ? "do sistema" : theme === "light" ? "claro" : "escuro"}. Trocar`}
              onClick={() => db && api.account.updateProfile({ theme: nextTheme })}><ThemeIcon className="size-5" /></IconBtn>
            <IconBtn label="Ajuda" onClick={() => setHelp(true)}><CircleHelp className="size-5" /></IconBtn>
            </div>
          </header>

          {db && isReadOnly(db) && (
            <div role="status" className="mx-4 lg:mx-auto lg:w-[calc(100%-4rem)] lg:max-w-[68rem] mt-4 rounded-lg bg-warning-soft px-4 py-2.5 text-sm">
              Seu acesso venceu. Tudo continua visível, mas para registrar algo novo é preciso <Link href="/ajustes/conta" className="font-semibold underline">renovar</Link>.
            </div>
          )}
          {db && !db.profile.onboardingDone && path === "/" && (
            <div className="mx-4 lg:mx-auto lg:w-[calc(100%-4rem)] lg:max-w-[68rem] mt-4 relative flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-200 py-3 pl-4 pr-14">
              <div className="flex-1 min-w-48">
                <p className="text-sm font-semibold">Deixe o sistema com a sua cara</p>
                <p className="text-xs text-ink-muted">Quatro perguntas rápidas e você já sai montando o primeiro plano.</p>
              </div>
              <button type="button" onClick={() => setOnboard(true)} className="rounded-md bg-brand text-on-brand h-11 px-5 text-sm font-semibold transition-colors duration-150 hover:bg-brand-hover">Começar</button>
              <button type="button" aria-label="Dispensar" onClick={() => api.account.updateProfile({ onboardingDone: true })} className="absolute right-1.5 top-1.5 sm:top-1/2 sm:-translate-y-1/2 grid size-11 place-items-center rounded-pill text-ink-muted transition-colors duration-150 hover:bg-surface-300"><X aria-hidden className="size-4" /></button>
            </div>
          )}

          <main id="conteudo" key={path} className="so-enter flex-1 px-4 lg:px-8 pb-28 lg:pb-12 pt-5 lg:pt-7 w-full max-w-6xl mx-auto">{children}</main>
        </div>
      </div>
      <nav aria-label="Atalhos" className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-200/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {TABS.map((it) => {
            const on = isActive(path, it.href);
            const Icon = it.icon;
            return (
              <li key={it.href}>
                <Link href={it.href} aria-current={on ? "page" : undefined} className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors duration-150", on ? "text-brand" : "text-ink-muted hover:text-ink")}>
                  <span className={cx("grid h-7 w-12 place-items-center rounded-pill transition-colors duration-150", on && "bg-brand-soft")}><Icon aria-hidden className="size-5" /></span>{it.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setDrawer(true)} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[12px] font-medium text-ink-muted hover:text-ink">
              <span className="grid h-7 w-12 place-items-center"><Menu aria-hidden className="size-5" /></span>Mais
            </button>
          </li>
        </ul>
      </nav>
      <CommandPalette open={search} onClose={() => setSearch(false)} onHelp={(q) => { setHelpQ(q); setHelp(true); }} />
      <ConfirmHost />
      <HelpModal open={help} path={path} question={helpQ} onClose={() => { setHelp(false); setHelpQ(undefined); }} onStartTour={() => { setHelp(false); setOnboard(true); }} />
      <Onboarding open={onboard} onClose={() => setOnboard(false)} />
    </ToastProvider>
  );
}

function NavLink({ it, path }: { it: NavItem; path: string }) {
  const active = isActive(path, it.href);
  const Icon = it.icon;
  return (
    <Link href={it.href} aria-current={active ? "page" : undefined}
      className={cx("flex items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150", it.sub ? "ml-6 h-10 text-[13px]" : "h-11",
        active ? "bg-rail-active font-semibold text-brand-ink" : it.sub ? "text-rail-muted hover:bg-rail-hover hover:text-rail-ink" : "text-rail-ink hover:bg-rail-hover")}>
      {!it.sub && <Icon aria-hidden className={cx("size-[18px]", active ? "text-brand-violet" : "text-rail-muted")} />}{it.label}
    </Link>
  );
}

function IconBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`${className ?? "grid"} size-11 place-items-center rounded-pill transition-colors duration-150 hover:bg-surface-300`}>{children}</button>;
}

async function logout() {
  if (REMOTE) await supabaseBrowser().auth.signOut({ scope: "local" });
  window.location.href = REMOTE ? "/entrar" : "/";
}
