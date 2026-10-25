"use client";

import { createContext, useContext } from "react";

import type { MetaResponse } from "@/lib/types";

export interface DatasetMetaState {
  meta: MetaResponse | null;
  error: string | null;
  loading: boolean;
}

const DatasetMetaContext = createContext<DatasetMetaState>({
  meta: null,
  error: null,
  loading: true,
});

export function DatasetMetaProvider({
  value,
  children,
}: {
  value: DatasetMetaState;
  children: React.ReactNode;
}) {
  return (
    <DatasetMetaContext.Provider value={value}>
      {children}
    </DatasetMetaContext.Provider>
  );
}

export function useDatasetMeta(): DatasetMetaState {
  return useContext(DatasetMetaContext);
}

export function datasetLabel(meta: MetaResponse | null): string {
  if (!meta) return "Loading dataset";
  return meta.dataset.short_name || meta.dataset.name;
}

export function datasetBadge(meta: MetaResponse | null): string {
  if (!meta) return "Connecting";
  if (meta.dataset.is_synthetic) return "Synthetic demo";
  const year = meta.dataset.population?.reference_year;
  return year ? `Census ${year} baseline` : meta.dataset.short_name;
}
