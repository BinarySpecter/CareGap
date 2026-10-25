import type { Metadata } from "next";

import { RecommendationsClient } from "@/components/app/RecommendationsClient";

export const metadata: Metadata = {
  title: "Recommended locations",
  description:
    "Transparent candidate-site ranking for new healthcare resources.",
};

export default function RecommendationsPage() {
  return <RecommendationsClient />;
}
