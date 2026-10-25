import { ArrowUpRight, Info, MapPin } from "lucide-react";
import Link from "next/link";

import { accessBandFor } from "@/lib/access";
import { formatCoordinate, formatMinutes, formatNumber, formatPercent } from "@/lib/format";
import type { AreaProperties } from "@/lib/types";

interface AreaInspectorProps {
  area: AreaProperties;
  threshold: number;
  service: string;
  showLink?: boolean;
}

export function AreaInspector({
  area,
  threshold,
  service,
  showLink = true,
}: AreaInspectorProps) {
  const band = accessBandFor(area.travel_time_minutes, threshold);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Area inspector · {area.area_id}
          </p>
          <h2 className="serif mt-1.5 text-[25px] leading-none text-[var(--ink)]">
            {area.name}
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-[var(--ink-3)]">
            <MapPin className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
            {[area.quadrant, area.municipality].filter(Boolean).join(" · ") ||
              "Unassigned area"}{" "}
            ·{" "}
            {area.centroid ? formatCoordinate(area.centroid[0], area.centroid[1]) : "—"}
          </p>
        </div>
        <span
          className="mono shrink-0 rounded-[2px] px-2 py-1 text-[8px] uppercase tracking-[0.07em]"
          style={{ background: band.color, color: band.textColor }}
        >
          {band.label}
        </span>
      </div>

      <div className="mt-4 border-t border-[var(--rule)] pt-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Nearest suitable facility
            </p>
            <p className="serif mt-1.5 text-[32px] leading-none text-[var(--ink)]">
              {area.travel_time_minutes === null
                ? "No match"
                : formatMinutes(area.travel_time_minutes)}
            </p>
          </div>
          <p className="max-w-[45%] text-right text-[10px] leading-relaxed text-[var(--ink-2)]">
            {area.nearest_facility_name ??
              "No mapped facility offers this service."}
          </p>
        </div>
        <div className="mt-3 h-1 w-full bg-[var(--paper-2)]">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, ((area.travel_time_minutes ?? threshold * 2.5) / (threshold * 2.5)) * 100)}%`,
              background: band.color,
            }}
          />
        </div>
        <div className="mono mt-1 flex justify-between text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          <span>0 min</span>
          <span>{threshold * 2.5} min</span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        {[
          [
            "Population",
            area.population === null
              ? "Unavailable"
              : formatNumber(area.population),
          ],
          [
            "Suitable facilities within threshold",
            String(area.suitable_facilities_within_threshold ?? 0),
          ],
          ["Area", area.area_km2 ? `${area.area_km2.toFixed(1)} km²` : "—"],
          [
            "Vulnerability index",
            area.vulnerability_index === null
              ? "Unavailable"
              : formatPercent(area.vulnerability_index * 100, 0),
          ],
        ].map(([label, value]) => (
          <div key={label} className="border-t border-[var(--rule)] pt-2">
            <dt className="mono text-[7.5px] uppercase leading-tight tracking-[0.08em] text-[var(--ink-3)]">
              {label}
            </dt>
            <dd className="mono mt-1 text-[11px] text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--ink-3)]">
        <Info className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        {area.vulnerability_index === null
          ? "This release has no validated ward-level vulnerability indicator, so equity weighting is disabled. Missing population values are null, not zero."
          : "The vulnerability index is a model input, not a real demographic measure in every dataset."}{" "}
        Coverage is modelled access, not observed care.
      </p>

      {showLink && (
        <Link
          href={`/app/explore?area=${area.area_id}&service=${service}&threshold=${threshold}`}
          className="arrow-link mt-4 text-[var(--signal)]"
        >
          Explore this area
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
