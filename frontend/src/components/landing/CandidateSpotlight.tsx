"use client";

import { ArrowRight, CircleAlert, Crosshair } from "lucide-react";
import Link from "next/link";

import { apiUrl } from "@/lib/api";
import { formatNumber, formatPercent, formatSignedMinutes } from "@/lib/format";
import type { RecommendationsResponse } from "@/lib/types";
import { useApiData } from "@/lib/use-api";

const COMPONENTS = [
  { key: "coverage_component", label: "New coverage" },
  { key: "equity_component", label: "Equity gain" },
  { key: "travel_component", label: "Minutes saved" },
] as const;

export function CandidateSpotlight() {
  const { data, error } = useApiData<RecommendationsResponse>(
    apiUrl("/api/v1/recommendations", {
      service: "primary_care",
      threshold_minutes: 30,
      intervention_type: "primary_care_clinic",
      equity_weight: 0.35,
      limit: 1,
      set_size: 1,
      strategy: "equity_weighted",
    }),
  );
  const candidate = data?.candidates[0];

  return (
    <div className="dark-plate p-4 sm:p-5">
      <div className="relative z-[1]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <span className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/50">
            Engine sample / primary care / 30 min
          </span>
          <span className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--paper)]/35">
            Equity weight 0.35
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 py-5">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--critical)]" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-medium text-[var(--paper)]">
                The candidate engine is unavailable
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--paper)]/55">
                {error}
              </p>
              <Link href="/app/recommendations" className="link-dashed mt-3 !border-white/25 text-[10.5px] text-[var(--paper)]/75">
                Open the ranking workspace
              </Link>
            </div>
          </div>
        )}

        {!data && !error && (
          <div className="space-y-3 py-5">
            <div className="skeleton h-3 w-36" />
            <div className="skeleton h-10 w-3/4" />
            <div className="skeleton h-2.5 w-full" />
            <div className="skeleton h-2.5 w-5/6" />
            <div className="grid grid-cols-3 gap-3 pt-3">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          </div>
        )}

        {candidate && data && (
          <>
            <div className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/38">
                    Candidate 01 · population-area centroid
                  </p>
                  <h3 className="serif mt-1.5 text-[clamp(1.6rem,1.2rem+1vw,2.2rem)] leading-none text-[var(--paper)]">
                    {candidate.area_name}
                  </h3>
                  <p className="mt-1 text-[10px] text-[var(--paper)]/45">
                    {candidate.quadrant} quadrant · primary care clinic
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--gap)]/60 text-[var(--gap-soft)]">
                  <Crosshair className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/38">
                  Newly covered within {data.threshold_minutes} min
                </p>
                <p className="serif mt-2 text-[clamp(2.4rem,2rem+2vw,3.6rem)] leading-none text-[var(--paper)]">
                  {formatNumber(candidate.metrics.newly_covered_population)}
                  <span className="mono ml-2 align-middle text-[9px] text-[var(--paper)]/35">
                    people
                  </span>
                </p>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--paper)]/50">
                  {candidate.explanation}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-px bg-white/10">
                {[
                  {
                    label: "Coverage after",
                    value: formatPercent(candidate.metrics.coverage_after_percent),
                  },
                  {
                    label: "Mean time change",
                    value: formatSignedMinutes(
                      candidate.metrics.mean_travel_time_change_minutes,
                    ),
                  },
                  {
                    label: "Wards still out",
                    value: String(
                      data.recommended_set.remaining_wards_over_threshold,
                    ),
                  },
                ].map((item) => (
                  <div key={item.label} className="bg-[var(--field)] px-3 py-3">
                    <dt className="mono text-[7.5px] uppercase tracking-[0.1em] text-[var(--paper)]/35">
                      {item.label}
                    </dt>
                    <dd className="mono mt-2 text-[12px] text-[var(--paper)]">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4">
                <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--paper)]/38">
                  Score components
                </p>
                <div className="mt-2.5 space-y-2">
                  {COMPONENTS.map((component) => {
                    const value = candidate.score_breakdown[component.key];
                    return (
                      <div key={component.key} className="flex items-center gap-3">
                        <span className="w-[90px] shrink-0 text-[9.5px] text-[var(--paper)]/50">
                          {component.label}
                        </span>
                        <span className="h-[3px] flex-1 bg-white/10">
                          <span
                            className="block h-full bg-[var(--signal-bright)]"
                            style={{ width: `${Math.round(value * 100)}%` }}
                          />
                        </span>
                        <span className="mono w-8 text-right text-[9px] text-[var(--paper)]/55">
                          {value.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-col justify-between gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center">
                <p className="mono text-[7.5px] uppercase leading-relaxed tracking-[0.07em] text-[var(--paper)]/30">
                  Live API result · not an observed outcome · greedy heuristic
                </p>
                <Link
                  href="/app/recommendations"
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--signal-bright)] hover:text-[var(--paper)]"
                >
                  Open the full ranking
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
