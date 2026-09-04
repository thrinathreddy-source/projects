"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  FolderOpen,
  CreditCard,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Generate", icon: Sparkles },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Nav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  const items = isAdmin
    ? [...ITEMS, { href: "/admin", label: "Admin", icon: ShieldCheck } as const]
    : ITEMS;

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
