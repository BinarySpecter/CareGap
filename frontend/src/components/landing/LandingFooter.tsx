import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/ui/Logo";

const GROUPS = [
  {
    label: "Workspace",
    links: [
      { href: "/app", label: "Overview" },
      { href: "/app/explore", label: "Explore gaps" },
      { href: "/app/simulator", label: "Intervention simulator" },
      { href: "/app/recommendations", label: "Recommended locations" },
    ],
  },
  {
    label: "Evidence",
    links: [
      { href: "/app/analytics", label: "Impact analytics" },
      { href: "/app/data-sources", label: "Data sources" },
      { href: "/app/methodology", label: "Methodology" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--rule)] bg-[var(--paper)]">
      <div className="page-gutter">
        <div className="content-max py-10">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Logo />
              <p className="measure-narrow mt-4 text-[12px] leading-relaxed text-[var(--ink-2)]">
                CareGap is a decision-support platform for healthcare
                accessibility, intervention simulation, and explainable facility
                planning. The initial pilot covers the National Capital Territory
                of Delhi.
              </p>
              <p className="mono mt-4 max-w-[46ch] text-[9px] uppercase leading-relaxed tracking-[0.08em] text-[var(--ink-3)]">
                No patient-identifiable data. Census 2011 ward populations,
                OpenStreetMap facilities, modelled travel times. Not a clinical
                or diagnostic system.
              </p>
            </div>
            {GROUPS.map((group) => (
              <div key={group.label} className="lg:col-span-2">
                <p className="mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  {group.label}
                </p>
                <ul className="mt-3 space-y-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[11.5px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="lg:col-span-3">
              <p className="mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                Design record
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
                Design research references Halden Clinical Equipment, the
                Footnote system, GEO/LAB, and Mirador from the InstaLanding
                library. Their principles informed this original implementation.
              </p>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
                InstaLanding design library: MIT. Halden lineage: 8B Reflow
                template, MIT. No third-party code or assets are redistributed.
              </p>
              <Link
                href="/app/methodology#design"
                className="mt-4 inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-4 hover:decoration-[var(--ink)]"
              >
                Read the design record
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-[var(--rule)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              © 2026 CareGap project · Private demonstration build
            </p>
            <div className="flex items-center gap-4">
              <Link
                href="/app/data-sources"
                className="mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                Data register
              </Link>
              <Link
                href="/app/methodology"
                className="mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                Limitations
              </Link>
            </div>
          </div>
        </div>

        <div className="content-max overflow-hidden border-t border-[var(--rule)] py-6">
          <p className="display select-none text-[clamp(4rem,13vw,12rem)] leading-[0.78] tracking-[-0.04em] text-[var(--ink)]">
            CareGap<span className="text-[var(--gap)]">.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
