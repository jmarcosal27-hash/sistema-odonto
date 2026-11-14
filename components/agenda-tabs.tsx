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
    <nav aria-label="Seções da agenda" className="flex justify-center">
      <ul className="inline-flex flex-wrap justify-center rounded-lg sm:rounded-pill bg-surface-sidebar p-1 gap-1">
        {TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={path === href ? "page" : undefined}
              className={cx("inline-flex items-center gap-1.5 rounded-pill h-8 px-4 text-sm font-semibold", path === href ? "bg-surface shadow-card" : "text-muted hover:text-text")}>
              <Icon aria-hidden className="size-4" />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
