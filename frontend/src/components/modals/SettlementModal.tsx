"use client";

import React from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { FileText, Scale, Banknote } from "lucide-react";

interface SettlementModalProps {
  open: boolean;
  onClose: () => void;
  principal: number;
  rate: number;
  days: number;
  onConfirm: () => void;
}

function formatMGA(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export default function SettlementModal({
  open,
  onClose,
  principal,
  rate,
  days,
  onConfirm,
}: SettlementModalProps) {
  // Pr = Pc × (1 + r × d/360)
  const grossInterest = principal * (rate / 100) * (days / 360);
  const ircm = grossInterest * 0.2; // IRCM 20%
  const netInterest = grossInterest - ircm;
  const repurchasePrice = principal + grossInterest;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dénouement du Repo"
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        {/* Calculation recap */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Détail du remboursement
          </h4>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Principal (Purchase Price)</span>
              <span className="font-mono font-medium">
                {formatMGA(principal)} tMGA
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                Taux × Durée ({rate}% × {days}/360)
              </span>
              <span className="font-mono text-gray-500">
                {(rate / 100 * days / 360 * 100).toFixed(4)}%
              </span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
              <span className="text-gray-900">
                Repurchase Price (Pr)
              </span>
              <span className="font-mono text-gray-900">
                {formatMGA(repurchasePrice)} tMGA
              </span>
            </div>
          </div>
        </div>

        {/* Tax breakdown */}
        <div className="bg-gold-50 border border-gold-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gold-700 flex items-center gap-2">
            <Scale className="w-4 h-4" />
            Détail Fiscal
          </h4>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700">Intérêts Bruts</span>
              <span className="font-mono font-medium">
                {formatMGA(grossInterest)} tMGA
              </span>
            </div>
            <div className="flex justify-between text-danger-600">
              <span>Retenue IRCM (20%)</span>
              <span className="font-mono font-medium">
                − {formatMGA(ircm)} tMGA
              </span>
            </div>
            <div className="border-t border-gold-200 pt-2 flex justify-between font-semibold">
              <span className="text-success-600">
                Intérêts Nets versés
              </span>
              <span className="font-mono text-success-600">
                {formatMGA(netInterest)} tMGA
              </span>
            </div>
          </div>
        </div>

        {/* Legal mention */}
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4">
          <div className="flex gap-3">
            <FileText className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
            <div className="text-xs text-brand-700 leading-relaxed">
              <strong>Mentions Légales :</strong> Transaction de Pension Livrée —
              Exonérée de droits d&apos;enregistrement conformément à l&apos;Article
              02.02.43-2 du Code Général des Impôts de Madagascar. Le
              dénouement s&apos;effectue par Atomic Swap DvP (Delivery versus
              Payment) : les tMGA sont prélevés et les wBTA restitués
              instantanément.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button variant="primary" onClick={onConfirm} className="flex-1">
            Confirmer la Transaction dans le Wallet
          </Button>
        </div>
      </div>
    </Modal>
  );
}
