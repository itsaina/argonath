"use client";

import React from "react";
import { Wallet, Banknote, Smartphone } from "lucide-react";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface WalletBalancesProps {
  onOpenMobileMoney: () => void;
}

export default function WalletBalances({ onOpenMobileMoney }: WalletBalancesProps) {
  /* ── Mock data ─────────────────────────────────────────────── */
  const wBTA = 15_000.0;
  const tMGA = 45_250_000;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Solde du Portefeuille</CardTitle>
        <CardDescription>
          Actifs disponibles sur votre compte Hedera
        </CardDescription>
      </CardHeader>

      {/* ── Collateral row ────────────────────────────────────── */}
      <div className="flex items-start gap-4 rounded-lg bg-brand-50 p-4 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100">
          <Wallet className="h-5 w-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500">
            Collat&eacute;ral Disponible
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono text-gray-900">
            {wBTA.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
            <span className="ml-2 text-sm font-medium text-brand-500">wBTA</span>
          </p>
        </div>
        <Badge variant="info" dot>
          Hedera
        </Badge>
      </div>

      {/* ── Liquidity row ─────────────────────────────────────── */}
      <div className="flex items-start gap-4 rounded-lg bg-gold-50 p-4 mb-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-100">
          <Banknote className="h-5 w-5 text-gold-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500">
            Liquidit&eacute; Disponible
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono text-gray-900">
            {tMGA.toLocaleString("fr-FR")}
            <span className="ml-2 text-sm font-medium text-gold-600">
              tMGA / eAriary
            </span>
          </p>
        </div>
        <Badge variant="success" dot>
          Stable
        </Badge>
      </div>

      {/* ── Action button ─────────────────────────────────────── */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={onOpenMobileMoney}
      >
        <Smartphone className="mr-2 h-4 w-4" />
        D&eacute;p&ocirc;t / Retrait Mobile Money
      </Button>
    </Card>
  );
}
