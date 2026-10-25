import type { Metadata } from "next";
import { Suspense } from "react";

import { SimulatorClient } from "@/components/app/SimulatorClient";

export const metadata: Metadata = {
  title: "Intervention simulator",
  description:
    "Place a proposed healthcare facility and compare modelled access before and after.",
};

function SimulatorFallback() {
  return (
    <div className="page-gutter">
      <div className="content-max py-6">
        <div className="skeleton h-10 w-96 max-w-full" />
        <div className="skeleton mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-8 grid gap-4 xl:grid-cols-[370px_1fr]">
          <div className="skeleton h-[580px]" />
          <div className="skeleton h-[580px]" />
        </div>
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={<SimulatorFallback />}>
      <SimulatorClient />
    </Suspense>
  );
}
