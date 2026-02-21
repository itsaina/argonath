"use client";

import React, { useState } from "react";
import { Gavel } from "lucide-react";
import AuctionSelector from "@/components/auction/AuctionSelector";
import BorrowerForm from "@/components/auction/BorrowerForm";
import LenderForm from "@/components/auction/LenderForm";
import MarketHistory from "@/components/auction/MarketHistory";

export default function AuctionPage() {
  const [selectedAuction, setSelectedAuction] = useState<string | undefined>();

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Gavel className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Marché des Enchères
            </h1>
            <p className="text-sm text-gray-500">
              Pension Livrée par enchères scellées — modèle Term Finance
            </p>
          </div>
        </div>
      </div>

      {/* ── Section A: Auction Selector ──────────────────────────── */}
      <div className="mb-8">
        <AuctionSelector
          selected={selectedAuction}
          onSelect={setSelectedAuction}
        />
      </div>

      {/* ── Sections B & C: Borrower + Lender side by side ───────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8">
        <BorrowerForm />
        <LenderForm />
      </div>

      {/* ── Section D: Market History ────────────────────────────── */}
      <MarketHistory />
    </>
  );
}
