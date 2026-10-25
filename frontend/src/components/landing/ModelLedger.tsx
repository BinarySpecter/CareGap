"use client";

import { ArrowUpRight, Check, Minus, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { apiUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MetaResponse } from "@/lib/types";
import { useApiData } from "@/lib/use-api";

type StatusTone = "modelled" | "estimate" | "synthetic" | "excluded" | "not-modelled";

const STATUS_LABEL: Record<StatusTone, string> = {
  modelled: "Modelled",
  estimate: "Estimate",
  synthetic: "Synthetic",
  excluded: "Excluded",
  "not-modelled": "Not modelled",
};

function Status({ tone }: { tone: StatusTone }) {
  const base =
    "mono inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-1 text-[7.5px] uppercase tracking-[0.08em]";
  if (tone === "modelled") {
    return (
      <span className={`${base} border-[var(--signal)]/25 bg-[var(--signal-soft)] text-[var(--signal-deep)]`}>
        <Check className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
        {STATUS_LABEL[tone]}
      </span>
    );
  }
  if (tone === "estimate" || tone === "synthetic") {
    return (
      <span className={`${base} border-[var(--gap)]/25 bg-[var(--gap-soft)]/55 text-[#7d4b0e]`}>
        <TriangleAlert className="h-2.5 w-2.5" strokeWidth={1.8} aria-hidden="true" />
        {STATUS_LABEL[tone]}
      </span>
    );
  }
  if (tone === "excluded") {
    return (
      <span className={`${base} border-[var(--positive)]/25 bg-[#dcebe2] text-[var(--positive)]`}>
        <Check className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
        {STATUS_LABEL[tone]}
      </span>
    );
  }
  return (
    <span className={`${base} border-[var(--rule)] bg-[var(--paper-2)] text-[var(--ink-3)]`}>
      <Minus className="h-2.5 w-2.5" strokeWidth={1.8} aria-hidden="true" />
      {STATUS_LABEL[tone]}
    </span>
  );
}

export function ModelLedger() {
  const { data, error } = useApiData<MetaResponse>(apiUrl("/api/v1/meta"));
  const counts = data?.dataset.counts;

  const rows: Array<{ item: string; detail: string; status: StatusTone }> = [
    {
      item: "Population denominator",
      detail: counts
        ? `${counts.areas} synthetic population areas · ${counts.population?.toLocaleString("en-IN")} people`
        : "Area-level synthetic population only; no individual records.",
      status: "synthetic",
    },
    {
      item: "Mapped facilities",
      detail: counts
        ? `${counts.facilities} fictional facilities with modelled service suitability`
        : "Fictional facility inventory with mapped service tags.",
      status: "synthetic",
    },
    {
      item: "Travel time",
      detail: data?.routing.label ?? "Synthetic street-grid shortest paths",
      status: "estimate",
    },
    {
      item: "Coverage definition",
      detail: "Nearest mapped facility offering the selected service, within the threshold",
      status: "modelled",
    },
    {
      item: "Capacity, staffing, queues",
      detail: "Not represented. Faster travel does not guarantee treatment.",
      status: "not-modelled",
    },
    {
      item: "Opening hours, cost, quality",
      detail: "Not represented. Access is not the same as effective or respectful care.",
      status: "not-modelled",
    },
    {
      item: "Health outcomes & causality",
      detail: "No outcome claim. The model measures modelled access, not health improvement.",
      status: "not-modelled",
    },
    {
      item: "Live traffic & real roads",
      detail: "No live feeds. The demo road network is synthetic.",
      status: "not-modelled",
    },
    {
      item: "Patient-identifiable data",
      detail: "None collected or required. The dataset is area-level and synthetic.",
      status: "excluded",
    },
  ];

  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SectionLabel index="04">The model boundary</SectionLabel>
          <h2 className="display mt-4 max-w-[720px] text-[clamp(2.4rem,1.85rem+2.5vw,4.2rem)]">
            A useful model states what it <em>cannot</em> see.
          </h2>
          <p className="measure mt-5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
            CareGap separates measured geography from operational reality. This
            ledger is part of the product, not small print: coverage is a
            travel-time proxy, not proof that a service is staffed, available,
            affordable, or good.
          </p>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <div className="border-t border-[var(--rule-strong)] pt-4">
            <p className="mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Dataset
            </p>
            <p className="mt-2 text-[12px] font-medium text-[var(--ink)]">
              {data?.dataset.name ?? "CareGap Synthetic Demo District"}
            </p>
            <dl className="mt-3 space-y-2">
              {[
                ["Seed", data ? String(data.dataset.seed ?? "—") : "—"],
                ["Generated", formatDate(data?.dataset.generated_at)],
                ["Projection", data?.dataset.geography.projected_crs ?? "EPSG:32643"],
                ["API", data ? `v${data.api_version}` : "—"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-1.5"
                >
                  <dt className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {label}
                  </dt>
                  <dd className="mono text-[9.5px] text-[var(--ink-2)]">{value}</dd>
                </div>
              ))}
            </dl>
            {error && (
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--critical)]">
                Dataset metadata is unavailable. The analysis API may be offline.
              </p>
            )}
            <Link href="/app/data-sources" className="link-dashed mt-4 text-[10.5px]">
              Open the full data register
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-10 overflow-hidden border-y border-[var(--rule-strong)]">
        <div className="mono grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2 text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)] sm:grid-cols-[56px_1fr_170px]">
          <span className="hidden sm:block">Row</span>
          <span>Boundary</span>
          <span className="text-right sm:text-left">Status</span>
        </div>
        {rows.map((row, index) => (
          <div
            key={row.item}
            className="grid grid-cols-[1fr_auto] items-start gap-4 border-b border-[var(--rule)] px-3 py-3.5 last:border-b-0 sm:grid-cols-[56px_1fr_170px] sm:items-center"
          >
            <span className="mono hidden text-[8.5px] text-[var(--ink-3)] sm:block">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-[12px] font-medium text-[var(--ink)]">{row.item}</p>
              <p className="mt-0.5 max-w-[76ch] text-[10.5px] leading-relaxed text-[var(--ink-3)]">
                {row.detail}
              </p>
            </div>
            <div className="sm:justify-self-start">
              <Status tone={row.status} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="max-w-[90ch] text-[10px] leading-relaxed text-[var(--ink-3)]">
          Missing facilities in the mapped inventory are not evidence that care
          is absent. Data completeness is a first-order limitation of any
          accessibility map.
        </p>
        <Link href="/app/methodology" className="link-dashed shrink-0 text-[10.5px]">
          Read the full method
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
