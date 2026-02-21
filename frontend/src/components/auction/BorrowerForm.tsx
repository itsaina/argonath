"use client";

import React, { useState, useMemo } from "react";
import { ArrowDownToLine, Send, Info } from "lucide-react";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/* ── Constants ──────────────────────────────────────────────────── */

/** Indicative wBTA price in tMGA used for collateral estimation */
const WBTA_PRICE = 3_000;
/** Regulatory haircut applied to collateral */
const HAIRCUT = 0.03;

/* ── Component ──────────────────────────────────────────────────── */

export default function BorrowerForm() {
  const [amount, setAmount] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [loading, setLoading] = useState(false);

  /* Collateral = amount * (1 + haircut) / wbtaPrice */
  const collateral = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return 0;
    return (parsed * (1 + HAIRCUT)) / WBTA_PRICE;
  }, [amount]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Simulated submission delay
    setTimeout(() => setLoading(false), 1_500);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100">
            <ArrowDownToLine className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <CardTitle>Emprunter &mdash; J&apos;ai besoin de Cash</CardTitle>
            <CardDescription>
              Soumettez votre offre d&apos;emprunt (bid) pour cette ench&egrave;re
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Amount ─────────────────────────────────────────────── */}
        <Input
          label="Montant souhaité (tMGA)"
          placeholder="0.00"
          suffix="tMGA"
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint="Montant que vous souhaitez emprunter"
        />

        {/* ── Collateral info ────────────────────────────────────── */}
        <div className="flex items-start gap-2 rounded-lg bg-brand-50 p-3">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-brand-500" />
          <div className="text-sm text-gray-700 leading-relaxed">
            <span className="font-medium">
              Collatéral Requis (Incluant Décote/Haircut de{" "}
              {(HAIRCUT * 100).toFixed(0)}%) :
            </span>{" "}
            <span className="font-mono font-semibold text-brand-700">
              {collateral.toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}
            </span>{" "}
            <span className="font-medium text-brand-600">wBTA</span>
          </div>
        </div>

        {/* ── Max interest rate ──────────────────────────────────── */}
        <Input
          label="Taux d'intérêt maximum accepté (%)"
          placeholder="0.00"
          suffix="%"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={maxRate}
          onChange={(e) => setMaxRate(e.target.value)}
          hint="Taux annualisé maximum que vous êtes prêt à payer"
        />

        {/* ── Submit ─────────────────────────────────────────────── */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!amount || !maxRate}
          className="w-full"
        >
          <Send className="mr-2 h-4 w-4" />
          Soumettre Bid (Emprunt)
        </Button>
      </form>
    </Card>
  );
}
