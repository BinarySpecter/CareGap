"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { apiUrl } from "@/lib/api";
import { formatMinutes, formatNumber, formatPercent } from "@/lib/format";
import type { MetaResponse, OverviewResponse } from "@/lib/types";
import { useApiData } from "@/lib/use-api";

export function LiveProblemStats() {
  const meta = useApiData<MetaResponse>(apiUrl("/api/v1/meta"));
  const service = meta.data?.default_service ?? "maternal_health";
  const threshold = meta.data?.default_threshold_minutes ?? 15;
  const serviceLabel =
    meta.data?.services.find((item) => item.id === service)?.label ??
    "Maternal health";
  const { data, error, loading } = useApiData<OverviewResponse>(
    apiUrl("/api/v1/overview", {
      service,
      threshold_minutes: threshold,
    }),
  );

  if (loading && !data) {
    return (
      <div className="mt-10 grid gap-px border-y border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="bg-[var(--paper)] px-0 py-6 sm:px-6">
            <div className="skeleton h-2.5 w-24" />
            <div className="skeleton mt-4 h-10 w-40" />
            <div className="skeleton mt-3 h-2.5 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-10 border-y border-[var(--rule)] py-5">
        <p className="mono text-[9px] uppercase tracking-[0.1em] text-[var(--critical)]">
          Live evidence unavailable
        </p>
        <p className="mt-2 max-w-[64ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
          {error ??
            "The analysis API is not running. The methodology and limitations remain available below."}
        </p>
        <Link href="/app/methodology" className="link-dashed mt-3">
          Read the methodology
        </Link>
      </div>
    );
  }

  const outside =
    data.summary.total_population - data.summary.covered_population;

  return (
    <div className="mt-10">
      <div className="grid gap-px border-y border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3">
        <div className="bg-[var(--paper)] py-6 sm:px-6 sm:pl-0">
          <p className="mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Outside a {threshold}-minute {serviceLabel.toLowerCase()} threshold ·{" "}
            {data.dataset.short_name}
          </p>
          <p className="serif mt-3 text-[clamp(2.6rem,2rem+2.6vw,4.4rem)] leading-none tracking-[-0.03em] text-[var(--gap)]">
            {formatNumber(outside)}
          </p>
          <p className="mt-2 text-[11px] text-[var(--ink-2)]">
            modelled people, {formatPercent(100 - data.summary.coverage_percent)} of{" "}
            {formatNumber(data.summary.total_population)}
          </p>
        </div>
        <div className="bg-[var(--paper)] py-6 sm:px-6">
          <p className="mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Population areas beyond the threshold
          </p>
          <p className="serif mt-3 whitespace-nowrap text-[clamp(2.6rem,2rem+2.6vw,4.4rem)] leading-none tracking-[-0.03em] text-[var(--ink)]">
            {data.summary.wards_over_threshold}
            <span className="mono ml-2 align-middle text-[10px] text-[var(--ink-3)]">
              / {data.summary.wards_total}
            </span>
          </p>
          <p className="mt-2 text-[11px] text-[var(--ink-2)]">
            population areas where the nearest suitable facility is over{" "}
            {threshold} minutes
          </p>
        </div>
        <div className="bg-[var(--paper)] py-6 sm:px-6">
          <p className="mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Population-weighted median travel time
          </p>
          <p className="serif mt-3 whitespace-nowrap text-[clamp(2.2rem,1.7rem+2.2vw,4rem)] leading-none tracking-[-0.03em] text-[var(--ink)]">
            {formatMinutes(data.summary.weighted_median_travel_time)}
          </p>
          <p className="mt-2 text-[11px] text-[var(--ink-2)]">
            estimated nearest-facility time across {data.summary.areas_with_population} populated areas
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="mono text-[8.5px] uppercase leading-relaxed tracking-[0.08em] text-[var(--ink-3)]">
          Computed live from the same deterministic API · {data.routing.label} ·{" "}
          {data.dataset.is_synthetic
            ? "synthetic data"
            : `Census ${data.dataset.population.reference_year ?? "2011"} population · OSM facilities`}
        </p>
        <Link
          href="/app/explore"
          className="arrow-link shrink-0 text-[var(--signal)]"
        >
          Inspect the gap distribution
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
