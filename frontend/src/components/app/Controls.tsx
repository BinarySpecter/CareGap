"use client";

import { ArrowUpRight, Info, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { cn, titleCase } from "@/lib/format";
import type { RoutingInfo, ServiceDefinition } from "@/lib/types";

interface ServiceThresholdControlsProps {
  services: ServiceDefinition[];
  service: string;
  threshold: number;
  onServiceChange: (service: string) => void;
  onThresholdChange: (threshold: number) => void;
  thresholds: number[];
  disabled?: boolean;
  compact?: boolean;
  serviceLabel?: string;
}

export function ServiceThresholdControls({
  services,
  service,
  threshold,
  onServiceChange,
  onThresholdChange,
  thresholds,
  disabled = false,
  compact = false,
  serviceLabel = "Service",
}: ServiceThresholdControlsProps) {
  const selectedService = services.find((item) => item.id === service);
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3",
        compact ? "gap-2.5" : "gap-4",
      )}
    >
      <div className={compact ? "min-w-[138px]" : "min-w-[180px]"}>
        <label htmlFor="service-filter" className="field-label">
          {serviceLabel}
        </label>
        <select
          id="service-filter"
          className="field"
          value={service}
          onChange={(event) => onServiceChange(event.target.value)}
          disabled={disabled}
        >
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className={compact ? "min-w-[118px]" : "min-w-[150px]"}>
        <label htmlFor="threshold-filter" className="field-label">
          Travel-time threshold
        </label>
        <select
          id="threshold-filter"
          className="field"
          value={threshold}
          onChange={(event) => onThresholdChange(Number(event.target.value))}
          disabled={disabled}
        >
          {thresholds.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
          {!thresholds.includes(threshold) && (
            <option value={threshold}>{threshold} minutes</option>
          )}
        </select>
      </div>
      {!compact && selectedService && (
        <div className="hidden max-w-[310px] pb-1 text-[10.5px] leading-relaxed text-[var(--ink-3)] xl:block">
          <span className="mono mr-1 text-[8px] uppercase tracking-[0.1em]">
            Definition
          </span>
          {selectedService.description}
        </div>
      )}
    </div>
  );
}

export function DataNotice({
  notice,
  routing,
  className,
}: {
  notice?: string;
  routing?: RoutingInfo;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 border-y border-[var(--rule)] py-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="status-dot status-dot--gap mt-[6px] h-[5px] w-[5px]" aria-hidden="true" />
        <p className="max-w-[90ch] text-[10.5px] leading-relaxed text-[var(--ink-3)]">
          {notice ??
            "Accessibility is modelled from the active dataset; it is not observed care or live traffic."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {routing && (
          <span className="mono flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            <Info className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
            {routing.label}
          </span>
        )}
        <Link href="/app/methodology" className="link-dashed text-[10.5px]">
          Method &amp; limits
        </Link>
      </div>
    </div>
  );
}

export function ServiceTag({ service }: { service: string }) {
  return (
    <span className="mono inline-flex items-center rounded-[2px] border border-[var(--rule)] bg-[var(--paper-2)] px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.08em] text-[var(--ink-2)]">
      {titleCase(service)}
    </span>
  );
}

export function ThresholdMarker({
  threshold,
  className,
}: {
  threshold: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1 text-[8.5px] uppercase tracking-[0.08em] text-[var(--ink-2)]",
        className,
      )}
    >
      <SlidersHorizontal className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
      {threshold} min threshold
    </span>
  );
}

export function InlineLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--signal)] underline decoration-[var(--signal)]/30 underline-offset-4 transition-colors hover:decoration-[var(--signal)]"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}
