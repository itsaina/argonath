"use client";

import React, { useState } from "react";
import { LayoutDashboard } from "lucide-react";
import WalletBalances from "@/components/dashboard/WalletBalances";
import EngagementSummary from "@/components/dashboard/EngagementSummary";
import MobileMoneyModal from "@/components/dashboard/MobileMoneyModal";

export default function DashboardPage() {
  const [mobileMoneyOpen, setMobileMoneyOpen] = useState(false);

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <LayoutDashboard className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Tableau de Bord
            </h1>
            <p className="text-sm text-gray-500">
              Vue d&apos;ensemble de votre portefeuille et engagements
            </p>
          </div>
        </div>
      </div>

      {/* ── Dashboard grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WalletBalances onOpenMobileMoney={() => setMobileMoneyOpen(true)} />
        <EngagementSummary />
      </div>

      {/* ── Mobile Money Modal ──────────────────────────────────── */}
      <MobileMoneyModal
        open={mobileMoneyOpen}
        onClose={() => setMobileMoneyOpen(false)}
      />
    </>
  );
}
