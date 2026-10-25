import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";

export default function NotFound() {
  return (
    <>
      <LandingHeader />
      <main id="main-content" className="page-gutter">
        <div className="content-max flex min-h-[62vh] flex-col justify-center py-16">
          <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            Error / 404
          </p>
          <h1 className="display mt-4 max-w-[760px] text-[clamp(3rem,2.2rem+4vw,6rem)]">
            This coordinate is <span className="italic text-[var(--gap)]">off the map.</span>
          </h1>
          <p className="measure mt-5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
            The page you requested does not exist in this demonstration build.
            Return to the workspace overview or the public introduction.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/app" className="btn btn-primary">
              Open workspace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/" className="btn btn-outline">
              Public site
            </Link>
          </div>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
