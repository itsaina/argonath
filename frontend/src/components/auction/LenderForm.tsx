"use client";

import React, { useState } from "react";
import { ArrowUpFromLine, Send } from "lucide-react";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/* ── Component ──────────────────────────────────────────────────── */

export default function LenderForm() {
  const [amount, setAmount] = useState("");
  const [minRate, setMinRate] = useState("");
  const [loading, setLoading] = useState(false);

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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-100">
            <ArrowUpFromLine className="h-4 w-4 text-gold-600" />
          </div>
          <div>
            <CardTitle>Prêter &mdash; J&apos;ai du Cash à placer</CardTitle>
            <CardDescription>
              Soumettez votre offre de prêt (offer) pour cette enchère
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Amount ─────────────────────────────────────────────── */}
        <Input
          label="Montant à prêter (tMGA)"
          placeholder="0.00"
          suffix="tMGA"
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint="Montant que vous souhaitez placer"
        />

        {/* ── Min interest rate ──────────────────────────────────── */}
        <Input
          label="Taux d'intérêt minimum exigé (%)"
          placeholder="0.00"
          suffix="%"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={minRate}
          onChange={(e) => setMinRate(e.target.value)}
          hint="Taux annualisé minimum que vous exigez pour prêter"
        />

        {/* ── Submit ─────────────────────────────────────────────── */}
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          loading={loading}
          disabled={!amount || !minRate}
          className="w-full"
        >
          <Send className="mr-2 h-4 w-4" />
          Soumettre Offer (Prêt)
        </Button>
      </form>
    </Card>
  );
}
