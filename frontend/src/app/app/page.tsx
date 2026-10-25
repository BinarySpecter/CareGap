import type { Metadata } from "next";

import { OverviewClient } from "@/components/app/OverviewClient";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Baseline healthcare accessibility across the synthetic demonstration district.",
};

export default function OverviewPage() {
  return <OverviewClient />;
}
