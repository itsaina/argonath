"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

/* ── Types ──────────────────────────────────────────────────────── */

interface HistoryRow {
  date: string;
  volumeTotal: number;
  clearingRate: number;
}

/* ── Mock data ──────────────────────────────────────────────────── */

const HISTORY: HistoryRow[] = [
  { date: "2026-02-14", volumeTotal: 12_500_000_000, clearingRate: 9.75 },
  { date: "2026-02-07", volumeTotal: 10_800_000_000, clearingRate: 9.82 },
  { date: "2026-01-31", volumeTotal: 14_200_000_000, clearingRate: 9.60 },
  { date: "2026-01-24", volumeTotal: 8_950_000_000, clearingRate: 10.05 },
  { date: "2026-01-17", volumeTotal: 11_300_000_000, clearingRate: 9.90 },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatMGA(value: number): string {
  return value.toLocaleString("fr-FR", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ── Component ──────────────────────────────────────────────────── */

export default function MarketHistory() {
  return (
    <Card padding={false}>
      <div className="p-6 pb-0">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-100">
              <TrendingUp className="h-4 w-4 text-success-600" />
            </div>
            <div>
              <CardTitle>Historique du Marché</CardTitle>
              <CardDescription>
                Résultats des enchères précédentes — Repo BTA
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Volume Total Compensé
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Clearing Rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {HISTORY.map((row) => (
              <tr
                key={row.date}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {formatDate(row.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm text-gray-900">
                  {formatMGA(row.volumeTotal)}{" "}
                  <span className="text-gray-400 font-sans text-xs">MGA</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm font-medium text-brand-700">
                  {row.clearingRate.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-6 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Données indicatives — les résultats passés ne préjugent pas des résultats futurs.
        </p>
      </div>
    </Card>
  );
}
