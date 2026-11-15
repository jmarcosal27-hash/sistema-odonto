"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckCheck, RotateCcw, Hourglass } from "lucide-react";
import { cx } from "./ui";

const TABS = [
  { href: "/agenda", label: "Calendário", icon: CalendarDays },
  { href: "/agenda/confirmar", label: "Confirmar", icon: CheckCheck },
  { href: "/agenda/retornos", label: "Retornos", icon: RotateCcw },
  { href: "/agenda/espera", label: "Lista de espera", icon: Hourglass },
];

export function AgendaTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Seções da agenda" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:flex sm:justify-center sm:px-0">
      <ul className="inline-flex min-w-max rounded-pill bg-surface-300 p-1 gap-1">
        {TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={path === href ? "page" : undefined}
              className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill h-9 px-4 text-sm font-semibold", path === href ? "bg-surface-200 shadow-sm" : "text-ink-muted hover:text-ink")}>
              <Icon aria-hidden className="size-4" />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
