import type { Metadata } from "next";

import { DataSourcesClient } from "@/components/app/DataSourcesClient";

export const metadata: Metadata = {
  title: "Data sources",
  description:
    "Dataset provenance, source register, limitations, and validated data imports for CareGap.",
};

export default function DataSourcesPage() {
  return <DataSourcesClient />;
}
