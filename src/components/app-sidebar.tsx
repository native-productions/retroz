"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Sun,
  Type,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

const COLLAPSED_KEY = "retroz.sidebar.collapsed";
const GROUPS_KEY = "retroz.sidebar.groups";

const WIDTH_EXPANDED = 268;
const WIDTH_COLLAPSED = 68;

/** Shared easing + duration for the sidebar's own motion. */
const MOTION = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

type NavIcon = typeof LayoutDashboard;
type NavLink = { kind: "link"; href: string; label: string; icon: NavIcon };
type NavFolder = {
  kind: "folder";
  id: string;
  label: string;
  children: NavLink[];
};
type NavEntry = NavLink | NavFolder;

const NAV: NavEntry[] = [
  { kind: "link", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { kind: "link", href: "/workflows", label: "Workflow", icon: WorkflowIcon },
  {
    kind: "folder",
    id: "master",
    label: "Master",
    children: [
      { kind: "link", href: "/fonts", label: "Fonts", icon: Type },
      { kind: "link", href: "/skills", label: "Skills", icon: Sparkles },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeGroups(groups: Record<string, boolean>) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // storage unavailable — open state simply won't persist
  }
  return groups;
}

export function AppSidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    {},
  );

  React.useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    setOpenGroups(readGroups());
    setMounted(true);
  }, []);

  // Navigating into a folder's page opens that folder. It stays open until the
  // user closes it, so this never fights a deliberate collapse on the same page.
  React.useEffect(() => {
    const owner = NAV.find(
      (entry): entry is NavFolder =>
        entry.kind === "folder" &&
        entry.children.some((child) => isActive(pathname, child.href)),
    );
    if (!owner) return;
    setOpenGroups((prev) =>
      prev[owner.id] ? prev : writeGroups({ ...prev, [owner.id]: true }),
    );
  }, [pathname]);

  function setCollapsedState(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable — collapse state simply won't persist
    }
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => writeGroups({ ...prev, [id]: !prev[id] }));
  }

  const dark = mounted && theme === "dark";

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col border-r-2 border-border bg-surface/70 backdrop-blur md:flex",
        mounted && `transition-[width] ${MOTION} motion-reduce:transition-none`,
      )}
      style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
    >
      <div
        className={cn(
          "flex border-b-2 border-border p-3",
          collapsed ? "flex-col items-center gap-2" : "items-center gap-2",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/retroz-mark.png"
          alt=""
          draggable={false}
          className={cn(
            "shrink-0 select-none object-contain",
            collapsed ? "size-10" : "size-9",
          )}
        />
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold leading-none tracking-tight">
              Retroz
            </p>
            <p className="mt-1.5 truncate font-mono text-[9px] uppercase leading-none tracking-[0.06em] text-fg-muted">
              Your productivity assistant
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsedState(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2.5">
        {NAV.map((entry) =>
          entry.kind === "link" ? (
            <NavItem
              key={entry.href}
              item={entry}
              active={isActive(pathname, entry.href)}
              collapsed={collapsed}
            />
          ) : (
            <NavFolderItem
              key={entry.id}
              folder={entry}
              collapsed={collapsed}
              pathname={pathname}
              open={Boolean(openGroups[entry.id])}
              onToggle={() => toggleGroup(entry.id)}
            />
          ),
        )}
      </nav>

      {/* bottom: settings → theme → user */}
      <div className="flex flex-col gap-1 border-t-2 border-border p-2.5">
        <NavItem
          item={{
            kind: "link",
            href: "/settings",
            label: "Settings",
            icon: Settings,
          }}
          active={isActive(pathname, "/settings")}
          collapsed={collapsed}
        />

        <button
          type="button"
          onClick={() => setTheme(dark ? "light" : "dark")}
          title={dark ? "Light mode" : "Dark mode"}
          className={cn(
            "flex items-center rounded-[var(--radius-retro)] px-3 py-2 text-sm text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
            collapsed ? "justify-center px-0" : "gap-3",
          )}
        >
          {dark ? (
            <Sun className="size-4 shrink-0" />
          ) : (
            <Moon className="size-4 shrink-0" />
          )}
          {collapsed ? null : mounted && dark ? "Light mode" : "Dark mode"}
        </button>

        <div
          className={cn(
            "flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 p-2",
            collapsed && "justify-center",
          )}
        >
          <div className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-border bg-accent font-display text-xs font-bold text-accent-fg">
            {(userName ?? "Y").charAt(0).toUpperCase()}
          </div>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {userName ?? "You"}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded-[4px] text-fg-muted outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  item,
  active,
  collapsed,
}: {
  item: NavLink;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center rounded-[var(--radius-retro)] border-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
        collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
        active
          ? "border-border bg-secondary text-secondary-fg shadow-hard-sm"
          : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : item.label}
    </Link>
  );
}

/**
 * A nav entry that owns child routes. Expanded, it is an accordion folder; on
 * the collapsed rail there is no room for a tree, so it opens its children in a
 * flyout menu instead.
 */
function NavFolderItem({
  folder,
  collapsed,
  pathname,
  open,
  onToggle,
}: {
  folder: NavFolder;
  collapsed: boolean;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const hasActiveChild = folder.children.some((child) =>
    isActive(pathname, child.href),
  );

  if (collapsed) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            title={folder.label}
            aria-label={folder.label}
            className={cn(
              "relative grid place-items-center rounded-[var(--radius-retro)] border-2 p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
              hasActiveChild
                ? "border-border bg-surface-2 text-fg shadow-hard-sm"
                : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
              "data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
            )}
          >
            <Folder className="size-4" />
            {hasActiveChild ? (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            align="start"
            sideOffset={10}
            className="retro-card z-50 min-w-[10rem] p-1 shadow-hard-lg"
          >
            <DropdownMenu.Label className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
              {folder.label}
            </DropdownMenu.Label>
            {folder.children.map((child) => (
              <DropdownMenu.Item key={child.href} asChild>
                <Link
                  href={child.href}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg",
                    isActive(pathname, child.href)
                      ? "font-semibold text-fg"
                      : "text-fg-muted",
                  )}
                >
                  <child.icon className="size-4 shrink-0" />
                  {child.label}
                </Link>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  const regionId = `nav-folder-${folder.id}`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={regionId}
        className={cn(
          "flex items-center gap-3 rounded-[var(--radius-retro)] border-2 border-transparent px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
          open || hasActiveChild ? "text-fg" : "text-fg-muted",
        )}
      >
        {open ? (
          <FolderOpen className="size-4 shrink-0 text-accent" />
        ) : (
          <Folder className="size-4 shrink-0" />
        )}
        <span className="flex-1 text-left">{folder.label}</span>
        {!open && hasActiveChild ? (
          <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        ) : null}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-fg-muted",
            `transition-transform ${MOTION} motion-reduce:transition-none`,
            open && "rotate-90",
          )}
        />
      </button>

      <div
        id={regionId}
        role="group"
        aria-label={folder.label}
        className={cn(
          "grid",
          `transition-[grid-template-rows] ${MOTION} motion-reduce:transition-none`,
        )}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "mt-1 flex flex-col gap-1 border-l border-border-soft pl-2.5 ml-[1.375rem]",
              `transition-opacity ${MOTION} motion-reduce:transition-none`,
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {folder.children.map((child) => {
              const active = isActive(pathname, child.href);
              const Icon = child.icon;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  tabIndex={open ? undefined : -1}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-retro)] border-2 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                    active
                      ? "border-border bg-surface-2 font-semibold text-fg shadow-hard-sm"
                      : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      active && "text-accent",
                    )}
                  />
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
