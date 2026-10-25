import type { Metadata } from "next";

import { AnalyticsClient } from "@/components/app/AnalyticsClient";

export const metadata: Metadata = {
  title: "Impact analytics",
  description:
    "Before-and-after healthcare access analytics for saved intervention scenarios.",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
