import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/ui/Logo";

const LINKS = [
  { href: "#problem", label: "Why access" },
  { href: "#workspace", label: "Workspace" },
  { href: "#engine", label: "Intervention engine" },
  { href: "#method", label: "Method & data" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-[var(--rule)] shadow-md bg-[color-mix(in_srgb,var(--paper)_93%,transparent)] backdrop-blur-[4px]">
      <div className="page-gutter">
        <div className="content-max flex h-[64px] items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo />
            <span className="mono hidden border-l border-[var(--rule)] pl-5 text-[8.5px] uppercase leading-[1.5] tracking-[0.13em] text-[var(--ink-3)] md:block">
              Healthcare access
              <br />
              intelligence
            </span>
          </div>
          <nav aria-label="Landing page navigation" className="hidden items-center gap-6 lg:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden xl:block">
              <span className="status-pill">
                <span className="status-dot font-semibold" aria-hidden="true" />
                Delhi pilot · 2011
              </span>
            </span>
            <Link href="/app" className="btn btn-primary btn-sm">
              Open workspace
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <nav
          aria-label="Landing section links"
          className="content-max flex items-center justify-between gap-3 overflow-x-auto border-t border-[var(--rule)] px-4 py-2 lg:hidden"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="mono shrink-0 text-[8.5px] uppercase tracking-[0.08em] text-[var(--ink-2)]"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
