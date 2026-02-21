"use client";

import React, { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Smartphone } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

type TransactionType = "deposit" | "withdrawal";
type Provider = "mvola" | "orange";

interface MobileMoneyModalProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileMoneyModal({
  open,
  onClose,
}: MobileMoneyModalProps) {
  const [txType, setTxType] = useState<TransactionType>("deposit");
  const [provider, setProvider] = useState<Provider>("mvola");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = () => {
    setLoading(true);
    // Simulate network request
    setTimeout(() => {
      setLoading(false);
      setAmount("");
      onClose();
    }, 1500);
  };

  const isDeposit = txType === "deposit";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mobile Money — Dépôt / Retrait"
    >
      <div className="space-y-6">
        {/* ── Transaction type toggle ────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setTxType("deposit")}
            className={`flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              isDeposit
                ? "bg-white text-brand-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Dépôt
          </button>
          <button
            type="button"
            onClick={() => setTxType("withdrawal")}
            className={`flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              !isDeposit
                ? "bg-white text-brand-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Retrait
          </button>
        </div>

        {/* ── Provider selector ──────────────────────────────────── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">
            Opérateur Mobile
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {/* MVola */}
            <label
              className={`flex items-center gap-3 rounded-lg border-2 p-3.5 cursor-pointer transition-colors ${
                provider === "mvola"
                  ? "border-brand-500 bg-brand-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value="mvola"
                checked={provider === "mvola"}
                onChange={() => setProvider("mvola")}
                className="sr-only"
              />
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  provider === "mvola"
                    ? "bg-brand-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                MV
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">MVola</p>
                <p className="text-xs text-gray-400">Telma</p>
              </div>
            </label>

            {/* Orange Money */}
            <label
              className={`flex items-center gap-3 rounded-lg border-2 p-3.5 cursor-pointer transition-colors ${
                provider === "orange"
                  ? "border-brand-500 bg-brand-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value="orange"
                checked={provider === "orange"}
                onChange={() => setProvider("orange")}
                className="sr-only"
              />
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  provider === "orange"
                    ? "bg-brand-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                OM
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Orange Money
                </p>
                <p className="text-xs text-gray-400">Orange Madagascar</p>
              </div>
            </label>
          </div>
        </fieldset>

        {/* ── Amount input ───────────────────────────────────────── */}
        <Input
          label={isDeposit ? "Montant à déposer" : "Montant à retirer"}
          type="number"
          placeholder="0"
          min="0"
          step="1000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          suffix="MGA"
          hint={
            isDeposit
              ? "Le montant sera converti en tMGA / eAriary"
              : "Le montant sera envoyé sur votre compte mobile"
          }
        />

        {/* ── Confirm button ─────────────────────────────────────── */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!amount || Number(amount) <= 0}
          onClick={handleConfirm}
        >
          <Smartphone className="mr-2 h-4 w-4" />
          {isDeposit ? "Confirmer le Dépôt" : "Confirmer le Retrait"}
        </Button>
      </div>
    </Modal>
  );
}
