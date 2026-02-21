"use client";

import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import HealthGauge from "@/components/ui/HealthGauge";

export default function EngagementSummary() {
  /* ── Mock data ─────────────────────────────────────────────── */
  const totalBorrowed = 30_000_000;
  const totalLent = 12_500_000;
  const healthFactor = 112.5;

  return (
    <Card>
      <CardHeader>
        <CardTitle>R&eacute;sum&eacute; des Engagements</CardTitle>
        <CardDescription>
          Vue d&apos;ensemble de vos positions de pension livr&eacute;e
        </CardDescription>
      </CardHeader>

      {/* ── Borrowed ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-lg border border-gray-100 p-4 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-50">
          <TrendingDown className="h-5 w-5 text-danger-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500">Total Emprunt&eacute;</p>
          <p className="mt-0.5 text-xl font-semibold font-mono text-gray-900">
            {totalBorrowed.toLocaleString("fr-FR")}
            <span className="ml-1.5 text-sm font-medium text-gray-400">tMGA</span>
          </p>
        </div>
      </div>

      {/* ── Lent ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-lg border border-gray-100 p-4 mb-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-50">
          <TrendingUp className="h-5 w-5 text-success-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500">Total Pr&ecirc;t&eacute;</p>
          <p className="mt-0.5 text-xl font-semibold font-mono text-gray-900">
            {totalLent.toLocaleString("fr-FR")}
            <span className="ml-1.5 text-sm font-medium text-gray-400">tMGA</span>
          </p>
        </div>
      </div>

      {/* ── Health Gauge ──────────────────────────────────────── */}
      <div className="rounded-lg bg-gray-50 p-4">
        <HealthGauge value={healthFactor} label="Facteur de Sant&eacute;" />
      </div>
    </Card>
  );
}
