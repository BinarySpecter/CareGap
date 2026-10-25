"use client";

import { CircleAlert, LoaderCircle, RotateCcw, SearchX } from "lucide-react";

export function LoadingPanel({
  label = "Loading analysis",
  detail = "Reading the demonstration dataset and computing accessibility.",
  light = false,
}: {
  label?: string;
  detail?: string;
  light?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        light
          ? "flex min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-[var(--paper)]/70"
          : "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[6px] border border-[var(--rule)] bg-[var(--sheet)] p-8 text-[var(--ink-2)]"
      }
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--signal)]" aria-hidden="true" />
      <p className="text-[13px] font-medium">{label}</p>
      <p className="max-w-[44ch] text-center text-[11.5px] leading-relaxed opacity-70">
        {detail}
      </p>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={
        compact
          ? "error-note flex flex-wrap items-center justify-between gap-3"
          : "flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-[6px] border border-[var(--critical)]/30 bg-[var(--sheet)] p-8 text-center"
      }
    >
      <div className="flex items-start gap-3 text-left">
        <CircleAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--critical)]"
          aria-hidden="true"
        />
        <div>
          <p className="text-[13px] font-medium text-[var(--ink)]">
            The analysis could not be loaded
          </p>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
            {message}
          </p>
        </div>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyPanel({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[6px] border border-dashed border-[var(--rule-strong)] bg-[var(--sheet)] p-8 text-center">
      <SearchX className="h-5 w-5 text-[var(--ink-3)]" aria-hidden="true" />
      <p className="text-[13px] font-medium text-[var(--ink)]">{title}</p>
      <p className="max-w-[50ch] text-[11.5px] leading-relaxed text-[var(--ink-2)]">
        {detail}
      </p>
      {action}
    </div>
  );
}
