"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { CircleAlert, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "bg-transparent text-brand border-border-strong hover:bg-brand-soft",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-danger text-on-brand hover:brightness-95",
  soft: "bg-brand-soft text-ink hover:bg-surface-300",
};
// Alturas do design system: md 44px (toque), sm 36px (tabelas), lg 48px.
const sizes = { sm: "h-9 px-4 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-12 px-6 text-base" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: keyof typeof sizes; loading?: boolean; pill?: boolean;
}>(function Button({ variant = "primary", size = "md", loading, pill, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 border-2 border-transparent font-semibold whitespace-nowrap transition-colors duration-150 disabled:bg-surface-300 disabled:text-ink-muted disabled:border-transparent disabled:hover:bg-surface-300 disabled:cursor-not-allowed", pill ? "rounded-pill" : "rounded-md", variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading && <span aria-hidden className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
});

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string }) {
  const id = useId();
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      {children(id, descId)}
      {error ? <p id={descId} className="flex items-start gap-1.5 text-sm font-semibold text-danger"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p>
        : hint && <p id={descId} className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

const width = (c?: string) => (c && /(^|\s)(w-|flex-1)/.test(c) ? "" : "w-full");
const inputBase = "rounded-md border-[1.5px] bg-surface-100 px-4 text-base text-ink transition-colors duration-150 placeholder:text-ink-muted focus-visible:border-brand disabled:bg-surface-300 disabled:text-ink-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cx(inputBase, width(className), /(^|\s)h-/.test(className ?? "") ? "" : "h-11", invalid ? "border-danger" : "border-border-strong", className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputBase, width(className), "h-11 border-border-strong", className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, "w-full py-2 min-h-24 border-border-strong", className)} {...rest} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent"; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-300 text-ink-muted",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-brand-soft text-ink",
    accent: "bg-brand-soft text-brand",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-pill px-3 h-6 text-xs font-semibold tracking-[0.04em] whitespace-nowrap", tones[tone])}>{children}</span>;
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </label>
      <button
        id={id} type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative inline-flex h-6 w-11 shrink-0 rounded-pill transition-colors duration-150 disabled:opacity-50", checked ? "bg-brand" : "bg-border-strong")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-surface-100 shadow-sm transition-all duration-150", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-pill bg-surface-300 p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("rounded-pill font-semibold transition-colors duration-150", size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
            value === o.value ? "bg-surface-100 text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-lg border border-border bg-surface-200 p-5 shadow-sm", className)}>{children}</As>;
}

export function Kpi({ label, value, sub, tone = "surface", valueClass }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "surface" | "success" | "info" | "warning" | "accent"; valueClass?: string }) {
  const bg = { surface: "border border-border bg-surface-200 shadow-sm", success: "bg-success-soft", info: "bg-brand-soft", warning: "bg-warning-soft", accent: "bg-brand-soft" }[tone];
  return (
    <div className={cx("rounded-lg p-4 min-w-0", bg)}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cx("mt-1 text-[22px] leading-7 font-bold truncate", valueClass)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-4">
      <p className="font-semibold">{title}</p>
      {body && <p className="text-sm text-ink-muted max-w-md">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-surface-300", className)} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Carregando" className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && node) {
        const f = Array.from(node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"));
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-ink/60 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx("w-full max-h-[92vh] flex flex-col rounded-t-lg sm:rounded-lg border border-border bg-surface-200 shadow-md", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <button data-close type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-muted transition-colors duration-150 hover:bg-surface-300"><X aria-hidden className="size-5" /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{ini}</span>;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{message}</p>;
}
