"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/theme-provider";
import {
  LayoutDashboard,
  Workflow,
  Sparkles,
  Type,
  Settings,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "retroz.sidebar.collapsed";

type NavEntry = { href: string; label: string; icon: typeof LayoutDashboard };

const NAV_TOP: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workflows", label: "Workflow", icon: Workflow },
];
const NAV_MASTER: NavEntry[] = [
  { href: "/fonts", label: "Fonts", icon: Type },
  { href: "/skills", label: "Skills", icon: Sparkles },
];

const EASE = "cubic-bezier(0.23,1,0.32,1)";

export function AppSidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const dark = mounted && theme === "dark";

  return (
    <aside
      className="hidden md:flex shrink-0 flex-col border-r-2 border-border bg-surface/70 backdrop-blur"
      style={{ width: collapsed ? 68 : 236, transition: `width 240ms ${EASE}` }}
    >
      {/* brand + collapse toggle */}
      <div
        className={cn(
          "flex items-center border-b-2 border-border p-3",
          collapsed ? "justify-center" : "gap-2",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/retroz-mark.png"
          alt="Retroz"
          draggable={false}
          className={cn(
            "select-none object-contain",
            collapsed ? "size-10" : "h-9 w-auto max-w-[140px]",
          )}
        />
        {!collapsed ? <div className="flex-1" /> : null}
        {!collapsed ? (
          <button
            onClick={toggleCollapsed}
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1">
        {NAV_TOP.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}

        <SectionLabel collapsed={collapsed}>Master</SectionLabel>
        {NAV_MASTER.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}

        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            className="mt-1 grid place-items-center rounded-[var(--radius-retro)] p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        ) : null}
      </nav>

      {/* bottom: settings → theme → user */}
      <div className="flex flex-col gap-1 border-t-2 border-border p-2.5">
        <NavItem
          item={{ href: "/settings", label: "Settings", icon: Settings }}
          active={isActive("/settings")}
          collapsed={collapsed}
        />

        <button
          onClick={() => setTheme(dark ? "light" : "dark")}
          title={dark ? "Light mode" : "Dark mode"}
          className={cn(
            "flex items-center rounded-[var(--radius-retro)] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-[0.98]",
            collapsed ? "justify-center px-0" : "gap-3",
          )}
        >
          {dark ? (
            <Sun className="size-4 shrink-0" />
          ) : (
            <Moon className="size-4 shrink-0" />
          )}
          {!collapsed ? (mounted && dark ? "Light mode" : "Dark mode") : null}
        </button>

        <div
          className={cn(
            "flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 p-2",
            collapsed && "justify-center",
          )}
        >
          <div className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-border bg-accent text-accent-fg font-display text-xs font-bold">
            {(userName ?? "Y").charAt(0).toUpperCase()}
          </div>
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {userName ?? "You"}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-fg-muted transition-colors hover:text-danger active:scale-95"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (collapsed) {
    return <div className="mx-2 my-1.5 h-0.5 rounded bg-border" />;
  }
  return (
    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-fg-muted/70 font-mono">
      {children}
    </p>
  );
}

function NavItem({
  item,
  active,
  collapsed,
}: {
  item: NavEntry;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-[var(--radius-retro)] border-2 text-sm font-medium transition-colors active:scale-[0.98]",
        collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
        active
          ? "border-border bg-secondary text-secondary-fg shadow-hard-sm"
          : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed ? item.label : null}
    </Link>
  );
}
