"use client";

import React, { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AddCollateralModalProps {
  open: boolean;
  onClose: () => void;
  deficit: number;
  repoId: string;
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AddCollateralModal({
  open,
  onClose,
  deficit,
  repoId,
}: AddCollateralModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const numAmount = Number(amount) || 0;
  const sufficient = numAmount >= deficit;

  const handleConfirm = () => {
    setLoading(true);
    // Simulate blockchain transaction
    setTimeout(() => {
      setLoading(false);
      setAmount("");
      onClose();
    }, 1500);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter du Collat&eacute;ral"
    >
      <div className="space-y-5">
        {/* ── Deficit banner ──────────────────────────────────────── */}
        <div className="flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-100 p-4">
          <AlertTriangle className="h-5 w-5 text-danger-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger-600">
              D&eacute;ficit de collat&eacute;ral actuel
            </p>
            <p className="text-xs text-danger-500 mt-1">
              Position{" "}
              <span className="font-mono font-semibold">{repoId}</span>
            </p>
            <p className="text-lg font-semibold font-mono text-danger-600 mt-2">
              {formatMGA(Math.ceil(deficit))}{" "}
              <span className="text-sm font-medium">tMGA</span>
            </p>
          </div>
        </div>

        {/* ── Amount input ────────────────────────────────────────── */}
        <Input
          label="Montant de wBTA &agrave; ajouter"
          type="number"
          placeholder="0"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          suffix="wBTA"
          hint={
            numAmount > 0 && !sufficient
              ? `Montant insuffisant — minimum requis : ${formatMGA(Math.ceil(deficit))} tMGA en valeur`
              : "Le montant sera verrouill\u00E9 dans le smart contract de pension livr\u00E9e"
          }
          error={
            numAmount > 0 && !sufficient
              ? "Le montant fourni ne couvre pas le d\u00E9ficit"
              : undefined
          }
        />

        {/* ── Confirm button ──────────────────────────────────────── */}
        <Button
          variant="danger"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!amount || numAmount <= 0}
          onClick={handleConfirm}
        >
          <Plus className="mr-2 h-4 w-4" />
          Confirmer l&apos;ajout de collat&eacute;ral
        </Button>
      </div>
    </Modal>
  );
}
