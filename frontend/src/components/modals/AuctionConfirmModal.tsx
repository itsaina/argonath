"use client";

import React from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Gavel, Calendar, Percent, Banknote } from "lucide-react";

interface AuctionConfirmModalProps {
  open: boolean;
  onClose: () => void;
  type: "emprunt" | "pret";
  amount: number;
  rate: number;
  maturity: string;
  collateral?: number;
  onConfirm: () => void;
}

function formatMGA(n: number) {
  return n.toLocaleString("fr-FR");
}

export default function AuctionConfirmModal({
  open,
  onClose,
  type,
  amount,
  rate,
  maturity,
  collateral,
  onConfirm,
}: AuctionConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Confirmation d'Enchère">
      <div className="space-y-5">
        {/* Type badge */}
        <div className="flex items-center gap-3">
          <Gavel className="w-5 h-5 text-brand-500" />
          <Badge variant={type === "emprunt" ? "info" : "success"} dot>
            {type === "emprunt" ? "Bid (Emprunt)" : "Offer (Prêt)"}
          </Badge>
        </div>

        {/* Summary grid */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-gray-600">
              <Banknote className="w-4 h-4" />
              Montant
            </span>
            <span className="font-mono font-semibold text-gray-900">
              {formatMGA(amount)} tMGA
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-gray-600">
              <Percent className="w-4 h-4" />
              {type === "emprunt" ? "Taux max accepté" : "Taux min exigé"}
            </span>
            <span className="font-mono font-semibold text-gray-900">
              {rate}%
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              Date de résolution
            </span>
            <span className="text-sm font-medium text-gray-900">
              {maturity}
            </span>
          </div>

          {collateral != null && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-600">
                Collatéral verrouillé
              </span>
              <span className="font-mono font-semibold text-brand-600">
                {formatMGA(collateral)} wBTA
              </span>
            </div>
          )}
        </div>

        {/* Warning */}
        <p className="text-xs text-gray-500 leading-relaxed">
          En confirmant, vous autorisez le Smart Contract à verrouiller vos
          actifs dans le contrat d&apos;enchère Hedera jusqu&apos;à la résolution.
          Cette action est irréversible une fois signée.
        </p>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="flex-1"
          >
            Confirmer la Transaction dans le Wallet
          </Button>
        </div>
      </div>
    </Modal>
  );
}
