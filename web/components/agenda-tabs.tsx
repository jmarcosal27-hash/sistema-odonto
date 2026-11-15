"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckCheck, RotateCcw, Hourglass } from "lucide-react";
import { cx } from "./ui";

const TABS = [
  { href: "/agenda", label: "Calendário", icon: CalendarDays },
  { href: "/agenda/confirmar", label: "Confirmar", icon: CheckCheck },
  { href: "/agenda/retornos", label: "Retornos", icon: RotateCcw },
  { href: "/agenda/espera", label: "Espera", icon: Hourglass },
];

export function AgendaTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Seções da agenda" className="sm:flex sm:justify-center">
      <ul className="grid grid-cols-4 rounded-pill bg-surface-300 p-1 gap-1 sm:inline-flex">
        {TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={path === href ? "page" : undefined}
              className={cx("flex items-center justify-center gap-1.5 whitespace-nowrap rounded-pill h-9 px-1 text-[13px] sm:px-4 sm:text-sm font-semibold", path === href ? "bg-surface-200 shadow-sm" : "text-ink-muted hover:text-ink")}>
              <Icon aria-hidden className="hidden size-4 sm:block" />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
