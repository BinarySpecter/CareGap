"use client";

import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  ChartNoAxesCombined,
  Crosshair,
  Database,
  Map,
  Menu,
  ScanSearch,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/ui/Logo";
import { apiUrl } from "@/lib/api";
import { DatasetMetaProvider, datasetBadge } from "@/lib/dataset-context";
import { cn, formatNumber } from "@/lib/format";
import type { MetaResponse } from "@/lib/types";
import { useApiData } from "@/lib/use-api";

interface NavItem {
  href: string;
  label: string;
  index: string;
  icon: typeof Map;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/app", label: "Overview", index: "01", icon: Map },
      { href: "/app/explore", label: "Explore gaps", index: "02", icon: ScanSearch },
      { href: "/app/simulator", label: "Intervention simulator", index: "03", icon: Crosshair },
      { href: "/app/recommendations", label: "Recommended locations", index: "04", icon: Target },
      { href: "/app/analytics", label: "Impact analytics", index: "05", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Evidence",
    items: [
      { href: "/app/data-sources", label: "Data sources", index: "06", icon: Database },
      { href: "/app/methodology", label: "Methodology", index: "07", icon: BookOpenText },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function activeItem(pathname: string): NavItem | undefined {
  return [...ALL_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) =>
      item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href),
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const meta = useApiData<MetaResponse>(apiUrl("/api/v1/meta"));
  const current = activeItem(pathname);
  const datasetOpen = Boolean(meta.data);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] flex-col border-r border-white/10 bg-[var(--field)] text-[var(--paper)] lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Logo href="/" variant="dark" />
          <p className="mono-label mono-label--light mt-3 text-[8.5px]">
            Health access intelligence
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="mono-label mono-label--light px-3 pb-2 text-[8.5px]">
                {group.label}
              </p>
              <nav aria-label={`${group.label} navigation`} className="space-y-0.5">
                {group.items.map((item) => {
                  const active = current?.href === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-start gap-2.5 rounded-[3px] px-3 py-2.5 transition-colors",
                        active
                          ? "bg-white/[0.075] text-[var(--paper)]"
                          : "text-[var(--paper)]/58 hover:bg-white/[0.045] hover:text-[var(--paper)]/88",
                      )}
                    >
                      {active && (
                        <span className="absolute inset-y-1.5 left-0 w-[2px] bg-[var(--signal-bright)]" />
                      )}
                      <span className="mono mt-[3px] w-4 shrink-0 text-[8.5px] text-[var(--paper)]/35">
                        {item.index}
                      </span>
                      <Icon
                        className={cn(
                          "mt-[1px] h-4 w-4 shrink-0",
                          active
                            ? "text-[var(--signal-bright)]"
                            : "text-[var(--paper)]/40 group-hover:text-[var(--paper)]/60",
                        )}
                        strokeWidth={1.6}
                        aria-hidden="true"
                      />
                      <span className="text-[12.5px] font-medium leading-snug">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-[3px] border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  meta.error
                    ? "bg-[var(--critical)]"
                    : datasetOpen
                      ? "bg-[var(--signal-bright)]"
                      : "bg-[var(--gap)] pulse-dot",
                )}
                aria-hidden="true"
              />
              <span className="mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--paper)]/55">
                {meta.error
                  ? "API unavailable"
                  : datasetOpen
                    ? "Analysis API connected"
                    : "Connecting to API"}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--paper)]/62">
              {meta.data
                ? `${meta.data.dataset.short_name} · ${meta.data.dataset.counts.areas ?? "—"} areas · ${meta.data.dataset.counts.facilities ?? "—"} mapped facilities`
                : "Loading the active dataset."}
            </p>
            {meta.data && (
              <p className="mono mt-1.5 break-all text-[8px] uppercase tracking-[0.08em] text-[var(--paper)]/35">
                {meta.data.dataset.release ?? meta.data.dataset.id}
              </p>
            )}
            <Link
              href="/app/data-sources"
              className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--paper)]/72 hover:text-[var(--paper)]"
            >
              {meta.data?.dataset.is_synthetic
                ? "Synthetic demo data"
                : "Dataset provenance"}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
            {meta.data?.read_only && (
              <p className="mono mt-2 text-[8px] uppercase tracking-[0.1em] text-[var(--gap-soft)]">
                Read-only demo · mutations disabled
              </p>
            )}
          </div>
          <Link
            href="/"
            className="mt-3 flex items-center justify-between px-1 text-[10.5px] text-[var(--paper)]/42 hover:text-[var(--paper)]/72"
          >
            Public site
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <div className="lg:ml-[238px]">
        <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] backdrop-blur-[3px]">
          <div className="flex h-[58px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <button
                  ref={menuButtonRef}
                  type="button"
                  className="icon-btn"
                  aria-label="Open workspace navigation"
                  aria-expanded={menuOpen}
                  aria-controls="mobile-workspace-nav"
                  onClick={() => setMenuOpen(true)}
                >
                  <Menu className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
              <div className="lg:hidden">
                <Logo href="/" />
              </div>
              <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
                <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  Workspace
                </span>
                <span className="text-[var(--rule-strong)]" aria-hidden="true">
                  /
                </span>
                <span className="truncate text-[12.5px] font-medium text-[var(--ink)]">
                  {current?.label ?? "CareGap"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-2.5 py-1.5 sm:inline-flex">
                <span
                  className={cn(
                    "h-[5px] w-[5px] rounded-full",
                    meta.data?.dataset.is_synthetic
                      ? "bg-[var(--gap)]"
                      : "bg-[var(--signal)]",
                  )}
                  aria-hidden="true"
                />
                <span className="mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--ink-2)]">
                  {datasetBadge(meta.data)}
                </span>
              </span>
              <Link
                href="/app/methodology"
                className="hidden min-h-8 items-center gap-1.5 rounded-[3px] border border-[var(--rule)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink)] sm:inline-flex"
              >
                <Activity className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                Method
              </Link>
              <span className="hidden sm:inline-flex">
                <Link href="/app/simulator" className="btn btn-primary btn-sm">
                  <Crosshair className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                  New intervention
                </Link>
              </span>
            </div>
          </div>
        </header>

        <DatasetMetaProvider
          value={{ meta: meta.data, error: meta.error, loading: meta.loading }}
        >
          <main id="main-content">{children}</main>
        </DatasetMetaProvider>

        <footer className="border-t border-[var(--rule)] px-4 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-2 text-[10.5px] text-[var(--ink-3)] sm:flex-row sm:items-center">
            <p>
              CareGap decision support · Model estimates, not live traffic or observed care.
            </p>
            <div className="flex items-center gap-4">
              <span className="mono uppercase tracking-[0.1em]">
                {meta.data
                  ? `${formatNumber(meta.data.dataset.counts.population)} people · ${meta.data.dataset.short_name}`
                  : "Loading dataset"}
              </span>
              <Link href="/app/data-sources" className="hover:text-[var(--ink)]">
                Provenance
              </Link>
            </div>
          </div>
        </footer>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[var(--ink)]/55"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-workspace-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col bg-[var(--field)] text-[var(--paper)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <Logo href="/" variant="dark" />
              <button
                ref={closeButtonRef}
                type="button"
                className="grid h-9 w-9 place-items-center rounded-[3px] border border-white/15 text-[var(--paper)]/70 hover:text-[var(--paper)]"
                onClick={() => {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                }}
                aria-label="Close workspace navigation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-6">
                  <p className="mono-label mono-label--light px-3 pb-2 text-[8.5px]">
                    {group.label}
                  </p>
                  <nav aria-label={`${group.label} navigation`} className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = current?.href === item.href;
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex items-start gap-3 rounded-[3px] px-3 py-3",
                            active
                              ? "bg-white/[0.08] text-[var(--paper)]"
                              : "text-[var(--paper)]/62 hover:bg-white/[0.045] hover:text-[var(--paper)]",
                          )}
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                          <span className="text-[13px] font-medium">{item.label}</span>
                          <span className="mono ml-auto text-[8.5px] text-[var(--paper)]/30">
                            {item.index}
                          </span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 p-4">
              <Link href="/" className="flex items-center justify-between text-[11px] text-[var(--paper)]/55">
                Public site
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
