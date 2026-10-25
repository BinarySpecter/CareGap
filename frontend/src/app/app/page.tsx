import type { Metadata } from "next";

import { OverviewClient } from "@/components/app/OverviewClient";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Baseline healthcare accessibility across the active study area, computed from Census 2011 ward populations and OpenStreetMap facilities.",
};

export default function OverviewPage() {
  return <OverviewClient />;
}
