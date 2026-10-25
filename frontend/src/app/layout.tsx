import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "CareGap — Healthcare accessibility and resource planning",
    template: "%s · CareGap",
  },
  description:
    "CareGap finds communities outside safe travel-time thresholds, simulates new healthcare resources, and ranks candidate locations using transparent, deterministic analysis.",
  applicationName: "CareGap",
  keywords: [
    "healthcare access",
    "geospatial analysis",
    "health equity",
    "facility planning",
    "public health",
  ],
  authors: [{ name: "CareGap project" }],
  openGraph: {
    title: "CareGap — Put the next clinic where it counts",
    description:
      "A geospatial decision-support workspace for healthcare access gaps and intervention planning.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f4eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${sourceSerif.variable} ${jetbrains.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
