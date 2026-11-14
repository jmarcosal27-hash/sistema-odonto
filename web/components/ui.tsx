"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-95 active:brightness-90",
  secondary: "bg-surface text-text border border-border-input hover:bg-surface-sidebar",
  ghost: "text-accent hover:bg-surface-sidebar",
  danger: "bg-danger text-on-accent hover:brightness-95",
  soft: "bg-surface-sidebar text-text hover:brightness-95",
};
const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: keyof typeof sizes; loading?: boolean;
}>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded-pill font-semibold whitespace-nowrap transition disabled:opacity-45 disabled:cursor-not-allowed", variants[variant], sizes[size], className)}
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
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={cx("text-xs font-medium", error ? "text-danger" : "text-muted")}>{label}</label>
      {children(id, descId)}
      {(error || hint) && <p id={descId} className={cx("text-xs", error ? "text-danger" : "text-muted")}>{error ?? hint}</p>}
    </div>
  );
}

const width = (c?: string) => (c && /(^|\s)(w-|flex-1)/.test(c) ? "" : "w-full");
const inputBase = "rounded-md border bg-surface px-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-surface-sidebar disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cx(inputBase, width(className), /(^|\s)h-/.test(className ?? "") ? "" : "h-10", invalid ? "border-danger border-2" : "border-border-input", className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputBase, width(className), "h-10 border-border-input", className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, "w-full py-2 min-h-20 border-border-input", className)} {...rest} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent"; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-sidebar text-muted",
    success: "bg-surface-success-subtle text-success",
    warning: "bg-surface-warning-subtle text-warning",
    danger: "bg-surface-warning-subtle text-danger",
    info: "bg-surface-info-subtle text-text",
    accent: "bg-surface-accent-subtle text-text",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-pill px-2.5 h-6 text-xs font-semibold whitespace-nowrap", tones[tone])}>{children}</span>;
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
      <button
        id={id} type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative inline-flex h-6 w-11 shrink-0 rounded-pill transition disabled:opacity-50", checked ? "bg-accent" : "bg-border-input")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-pill bg-surface-sidebar p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("rounded-pill font-semibold transition", size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm",
            value === o.value ? "bg-surface text-text shadow-card" : "text-muted hover:text-text")}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-lg bg-surface p-5 shadow-card", className)}>{children}</As>;
}

export function Kpi({ label, value, sub, tone = "surface", valueClass }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "surface" | "success" | "info" | "warning" | "accent"; valueClass?: string }) {
  const bg = { surface: "bg-surface shadow-card", success: "bg-surface-success-subtle", info: "bg-surface-info-subtle", warning: "bg-surface-warning-subtle", accent: "bg-surface-accent-subtle" }[tone];
  return (
    <div className={cx("rounded-lg p-4 min-w-0", bg)}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cx("mt-1 text-[22px] leading-7 font-bold truncate", valueClass)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-4">
      <p className="font-semibold">{title}</p>
      {body && <p className="text-sm text-muted max-w-md">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-surface-sidebar", className)} />;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx("w-full max-h-[92vh] flex flex-col rounded-t-lg sm:rounded-lg bg-surface shadow-pop", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button data-close type="button" onClick={onClose} aria-label="Fechar" className="rounded-pill p-1.5 text-muted hover:bg-surface-sidebar"><X className="size-5" /></button>
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
  return <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-success-subtle text-sm font-bold text-success">{ini}</span>;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-md bg-surface-warning-subtle px-3 py-2 text-sm text-danger">{message}</p>;
}
