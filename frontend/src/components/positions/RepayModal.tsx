"use client";

import React, { useState } from "react";
import { CreditCard, FileText, Shield } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RepayModalProps {
  open: boolean;
  onClose: () => void;
  repoId: string;
  purchasePrice: number;
  repurchasePrice: number;
  repoRate: number;
  durationDays: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMGA(value: number): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const IRCM_RATE = 0.2; // 20%

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RepayModal({
  open,
  onClose,
  repoId,
  purchasePrice,
  repurchasePrice,
  repoRate,
  durationDays,
}: RepayModalProps) {
  const [loading, setLoading] = useState(false);

  const grossInterest = repurchasePrice - purchasePrice;
  const ircmWithholding = grossInterest * IRCM_RATE;
  const netInterest = grossInterest - ircmWithholding;

  const handleConfirm = () => {
    setLoading(true);
    // Simulate blockchain transaction
    setTimeout(() => {
      setLoading(false);
      onClose();
    }, 2000);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rembourser et Cl&ocirc;turer"
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        {/* ── Summary header ────────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-lg bg-brand-50 border border-brand-100 p-4">
          <FileText className="h-5 w-5 text-brand-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-brand-700">
              Cl&ocirc;ture de la position
            </p>
            <p className="text-xs text-brand-600 mt-0.5">
              <span className="font-mono font-semibold">{repoId}</span>
              {" "}&mdash; Taux : {(repoRate * 100).toFixed(2)}% &mdash;{" "}
              Dur&eacute;e : {durationDays} jours
            </p>
          </div>
        </div>

        {/* ── Fiscal breakdown ──────────────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {/* Purchase Price */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">
              Montant Initial (Purchase Price)
            </span>
            <span className="text-sm font-semibold font-mono text-gray-900">
              {formatMGA(purchasePrice)} tMGA
            </span>
          </div>

          {/* Repurchase Price */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">
              Montant Final (Repurchase Price)
            </span>
            <span className="text-sm font-semibold font-mono text-gray-900">
              {formatMGA(Math.round(repurchasePrice))} tMGA
            </span>
          </div>

          {/* Separator */}
          <div className="px-4 py-2 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              D&eacute;tail Fiscal
            </p>
          </div>

          {/* Gross Interest */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">
              Int&eacute;r&ecirc;ts Bruts
            </span>
            <span className="text-sm font-semibold font-mono text-gray-900">
              {formatMGA(Math.round(grossInterest))} tMGA
            </span>
          </div>

          {/* IRCM Withholding */}
          <div className="flex items-center justify-between px-4 py-3 bg-warning-50">
            <span className="text-sm text-warning-700">
              Retenue IRCM (20%)
            </span>
            <span className="text-sm font-semibold font-mono text-warning-700">
              &minus;{formatMGA(Math.round(ircmWithholding))} tMGA
            </span>
          </div>

          {/* Net Interest */}
          <div className="flex items-center justify-between px-4 py-3 bg-success-50">
            <span className="text-sm font-semibold text-success-700">
              Int&eacute;r&ecirc;ts Nets vers&eacute;s
            </span>
            <span className="text-sm font-bold font-mono text-success-700">
              {formatMGA(Math.round(netInterest))} tMGA
            </span>
          </div>
        </div>

        {/* ── Legal mention ─────────────────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 leading-relaxed">
              Transaction de Pension Livr&eacute;e &mdash; Exon&eacute;r&eacute;e de droits
              d&apos;enregistrement (Art. 02.02.43-2 CGI). Les int&eacute;r&ecirc;ts sont
              soumis &agrave; la retenue &agrave; la source au titre de l&apos;Imp&ocirc;t sur
              les Revenus des Capitaux Mobiliers (IRCM) au taux de 20%.
            </p>
          </div>
        </div>

        {/* ── Confirm button ────────────────────────────────────────── */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={loading}
          onClick={handleConfirm}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Confirmer la Transaction dans le Wallet
        </Button>
      </div>
    </Modal>
  );
}
