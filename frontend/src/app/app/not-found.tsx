import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <div className="page-gutter">
      <div className="content-max py-10">
        <p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Workspace / 404
        </p>
        <h1 className="display mt-3 max-w-[680px] text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
          No such workspace view.
        </h1>
        <p className="measure mt-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
          This route does not exist. Use the navigation rail to return to the
          accessibility baseline, the simulator, or the methodology.
        </p>
        <Link href="/app" className="btn btn-primary btn-sm mt-5">
          Return to overview
        </Link>
      </div>
    </div>
  );
}
