"use client";

import React, { useState } from "react";
import { RefreshCw, Shield } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SubstituteCollateralModalProps {
  open: boolean;
  onClose: () => void;
  repoId: string;
  currentTokenId: string;
  currentMarketValue: number;
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

export default function SubstituteCollateralModal({
  open,
  onClose,
  repoId,
  currentTokenId,
  currentMarketValue,
}: SubstituteCollateralModalProps) {
  const [newTokenId, setNewTokenId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = () => {
    setLoading(true);
    // Simulate blockchain transaction
    setTimeout(() => {
      setLoading(false);
      setNewTokenId("");
      onClose();
    }, 1500);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Substituer le Collat&eacute;ral"
    >
      <div className="space-y-5">
        {/* ── Current collateral info ───────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">
            Collat&eacute;ral actuel
          </p>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-brand-500" />
            <span className="text-sm font-semibold font-mono text-gray-900">
              {currentTokenId}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            Valeur march&eacute; (Oracle) :{" "}
            <span className="font-mono font-semibold">
              {formatMGA(currentMarketValue)} tMGA
            </span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Position : <span className="font-mono">{repoId}</span>
          </p>
        </div>

        {/* ── New collateral input ──────────────────────────────────── */}
        <Input
          label="Nouveau collat&eacute;ral (Token ID wBTA)"
          type="text"
          placeholder="0.0.XXXXXXX"
          value={newTokenId}
          onChange={(e) => setNewTokenId(e.target.value)}
          suffix="wBTA"
          hint="Le nouveau token doit avoir une valeur &eacute;gale ou sup&eacute;rieure au collat&eacute;ral actuel"
        />

        {/* ── Legal compliance note ─────────────────────────────────── */}
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-brand-700">
                Conformit&eacute; Loi n&deg;2019-009
              </p>
              <p className="text-xs text-brand-600 mt-1">
                La substitution de collat&eacute;ral est autoris&eacute;e conform&eacute;ment
                aux dispositions de la Loi n&deg;2019-009 relative &agrave; la Pension
                Livr&eacute;e. Le nouveau collat&eacute;ral doit respecter les crit&egrave;res
                d&apos;&eacute;ligibilit&eacute; d&eacute;finis par le contrat-cadre.
              </p>
            </div>
          </div>
        </div>

        {/* ── Confirm button ────────────────────────────────────────── */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!newTokenId.trim()}
          onClick={handleConfirm}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Confirmer la substitution
        </Button>
      </div>
    </Modal>
  );
}
