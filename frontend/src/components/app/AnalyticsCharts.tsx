"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatNumber } from "@/lib/format";
import type { DistributionBucket, Improvement } from "@/lib/types";

const BUCKET_COLORS = [
  "#0b5d56",
  "#3f887b",
  "#8aab87",
  "#d5a05a",
  "#b76f1b",
  "#8e3b32",
  "#3b4644",
];

export function DistributionChart({
  distribution,
}: {
  distribution: DistributionBucket[];
}) {
  return (
    <div className="h-[230px] w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={distribution} margin={{ top: 8, right: 8, bottom: 12, left: -18 }}>
          <CartesianGrid stroke="#d8d2c3" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 9, fontFamily: "var(--font-jetbrains)", fill: "#78827b" }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={48}
            tickFormatter={(value: string) =>
              value.replace(" min", "").replace("No suitable facility", "No facility")
            }
            axisLine={{ stroke: "#d8d2c3" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tick={{ fontSize: 8, fontFamily: "var(--font-jetbrains)", fill: "#78827b" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(14,113,105,.06)" }}
            contentStyle={{
              background: "#fffdf7",
              border: "1px solid #bfb8a7",
              borderRadius: 4,
              fontFamily: "var(--font-geist)",
              fontSize: 11,
            }}
            formatter={(value) => [formatNumber(Number(value)), "People"]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="population" name="Population" radius={[1, 1, 0, 0]}>
            {distribution.map((bucket, index) => (
              <Cell
                key={bucket.bucket}
                fill={BUCKET_COLORS[index] ?? BUCKET_COLORS.at(-1)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Population by modelled travel-time band</caption>
        <thead>
          <tr>
            <th scope="col">Band</th>
            <th scope="col">People</th>
            <th scope="col">Areas</th>
          </tr>
        </thead>
        <tbody>
          {distribution.map((bucket) => (
            <tr key={bucket.bucket}>
              <td>{bucket.bucket}</td>
              <td>{formatNumber(bucket.population)}</td>
              <td>{bucket.areas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImprovementsChart({
  improvements,
}: {
  improvements: Improvement[];
}) {
  const data = improvements.slice(0, 7).map((item) => ({
    name: item.name,
    people: item.newly_covered_population,
    minutes: item.travel_time_baseline ?? 0,
    after: item.travel_time_proposed ?? 0,
  }));
  return (
    <div className="h-[250px] w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke="#d8d2c3" strokeDasharray="2 4" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatCompact(value)}
            tick={{ fontSize: 8, fontFamily: "var(--font-jetbrains)", fill: "#78827b" }}
            axisLine={{ stroke: "#d8d2c3" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={64}
            tick={{ fontSize: 9, fontFamily: "var(--font-geist)", fill: "#40514f" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(14,113,105,.06)" }}
            contentStyle={{
              background: "#fffdf7",
              border: "1px solid #bfb8a7",
              borderRadius: 4,
              fontFamily: "var(--font-geist)",
              fontSize: 11,
            }}
            formatter={(value) => [formatNumber(Number(value)), "Newly covered"]}
          />
          <Bar dataKey="people" fill="#377a5a" radius={[0, 2, 2, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Areas with the largest newly covered populations</caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Newly covered people</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{formatNumber(row.people)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
