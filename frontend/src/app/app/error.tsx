"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-gutter">
      <div className="content-max py-10">
        <div className="max-w-[620px] border border-[var(--rule-strong)] bg-[var(--sheet)] p-6">
          <p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--critical)]">
            Workspace error
          </p>
          <h1 className="display mt-3 text-[36px] leading-none">
            This view could not finish rendering.
          </h1>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
            Reload this view; if the API is unavailable, the analysis cannot be
            recomputed. No data has been modified.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
            <Link href="/app" className="btn btn-outline btn-sm">
              Overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
