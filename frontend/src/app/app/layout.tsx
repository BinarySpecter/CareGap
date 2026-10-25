import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: {
    default: "Workspace",
    template: "%s · CareGap",
  },
};

export default function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
