"use client";

import React, { useState } from "react";
import { TrendingUp, BarChart3, Lock, Activity } from "lucide-react";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Mock yield-curve data (30 data points) ──────────────────────── */

function generateYieldData() {
  const data: { date: string; taux: number }[] = [];
  const baseDate = new Date(2026, 0, 22); // 2026-01-22

  for (let i = 0; i < 30; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
    // Generate rates between 10% and 13% with realistic fluctuation
    const taux =
      11.25 +
      Math.sin(i * 0.4) * 0.8 +
      Math.cos(i * 0.25) * 0.6 +
      (Math.random() - 0.5) * 0.3;
    data.push({
      date: label,
      taux: parseFloat(taux.toFixed(2)),
    });
  }
  return data;
}

const YIELD_DATA = generateYieldData();

/* ── Time filter options ─────────────────────────────────────────── */

type TimeRange = "7J" | "1M" | "3M";

const TIME_RANGES: TimeRange[] = ["7J", "1M", "3M"];

function filterByRange(range: TimeRange) {
  switch (range) {
    case "7J":
      return YIELD_DATA.slice(-7);
    case "1M":
      return YIELD_DATA;
    case "3M":
      return YIELD_DATA; // all 30 points for demo
  }
}

/* ── KPI cards data ──────────────────────────────────────────────── */

const KPI_CARDS = [
  {
    label: "Volume wBTA Verrouill\u00e9s",
    value: "125 000",
    unit: "wBTA",
    icon: Lock,
    bg: "bg-brand-50",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-600",
    unitColor: "text-brand-500",
  },
  {
    label: "Liquidit\u00e9s \u00c9chang\u00e9es",
    value: "450 000 000",
    unit: "tMGA",
    icon: BarChart3,
    bg: "bg-gold-50",
    iconBg: "bg-gold-100",
    iconColor: "text-gold-600",
    unitColor: "text-gold-600",
  },
  {
    label: "Taux Repo Moyen",
    value: "11,25",
    unit: "%",
    icon: TrendingUp,
    bg: "bg-success-50",
    iconBg: "bg-success-100",
    iconColor: "text-success-600",
    unitColor: "text-success-600",
  },
  {
    label: "Nombre de Repos Actifs",
    value: "47",
    unit: "contrats",
    icon: Activity,
    bg: "bg-brand-50",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-600",
    unitColor: "text-brand-400",
  },
];

/* ── Component ───────────────────────────────────────────────────── */

export default function MacroDashboard() {
  const [range, setRange] = useState<TimeRange>("1M");
  const chartData = filterByRange(range);

  return (
    <div className="space-y-6">
      {/* ── KPI Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((kpi) => (
          <Card key={kpi.label}>
            <div className={`flex items-start gap-4 rounded-lg ${kpi.bg} p-4`}>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kpi.iconBg}`}
              >
                <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">
                  {kpi.label}
                </p>
                <p className="mt-1 text-2xl font-semibold font-mono text-gray-900">
                  {kpi.value}
                  <span className={`ml-1.5 text-sm font-medium ${kpi.unitColor}`}>
                    {kpi.unit}
                  </span>
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Yield Curve Chart ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                <TrendingUp className="h-4 w-4 text-brand-600" />
              </div>
              <div>
                <CardTitle>
                  &Eacute;volution du Taux de Repo (Yield Curve On-Chain)
                </CardTitle>
                <CardDescription>
                  Taux directeur observ&eacute; sur le march&eacute; Andúril
                </CardDescription>
              </div>
            </div>

            {/* Time range tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              {TIME_RANGES.map((t) => (
                <button
                  key={t}
                  onClick={() => setRange(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    range === t
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="brandGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--color-brand-400)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-brand-100)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                domain={[9.5, 13.5]}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "13px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                formatter={(value?: number | string) => [
                  typeof value === "number" ? `${value.toFixed(2)}%` : `${value}%`,
                  "Taux",
                ]}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="taux"
                stroke="var(--color-brand-400)"
                strokeWidth={2}
                fill="url(#brandGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "var(--color-brand-500)",
                  strokeWidth: 2,
                  stroke: "#fff",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
