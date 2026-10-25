import type { Metadata } from "next";
import { Suspense } from "react";

import { ExploreClient } from "@/components/app/ExploreClient";

export const metadata: Metadata = {
  title: "Explore gaps",
  description:
    "Inspect and rank population areas by modelled healthcare access.",
};

function ExploreFallback() {
  return (
    <div className="page-gutter">
      <div className="content-max py-6">
        <div className="skeleton h-10 w-96 max-w-full" />
        <div className="skeleton mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-8 skeleton h-[520px] w-full" />
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<ExploreFallback />}>
      <ExploreClient />
    </Suspense>
  );
}
