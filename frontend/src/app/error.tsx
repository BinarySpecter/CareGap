"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-gutter flex min-h-screen items-center justify-center">
      <div className="max-w-[560px] border border-[var(--rule)] bg-[var(--sheet)] p-6">
        <p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--critical)]">
          Application error
        </p>
        <h1 className="display mt-3 text-[38px] leading-none">
          Something interrupted the analysis.
        </h1>
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
          The workspace hit an unexpected error. No data has been changed. Reload
          the view or return to the overview. If the API is offline, start the
          backend and try again.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
          <Link href="/app" className="btn btn-outline btn-sm">
            Workspace overview
          </Link>
        </div>
      </div>
    </main>
  );
}
