"use client";

import React, { useState } from "react";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { History, Download, Filter, Search } from "lucide-react";

type TransactionType = "emprunt" | "pret" | "collateral" | "remboursement";

interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  amount: number;
  rate: number | null;
  counterparty: string;
  maturity: string | null;
  status: "exécuté" | "annulé" | "en cours";
}

const mockHistory: Transaction[] = [
  {
    id: "TX-2026-0091",
    date: "2026-02-20 14:32",
    type: "emprunt",
    amount: 10_000_000,
    rate: 11.5,
    counterparty: "0.0.4821...",
    maturity: "2026-02-27",
    status: "exécuté",
  },
  {
    id: "TX-2026-0088",
    date: "2026-02-19 09:15",
    type: "pret",
    amount: 5_000_000,
    rate: 11.25,
    counterparty: "0.0.7733...",
    maturity: "2026-03-19",
    status: "exécuté",
  },
  {
    id: "TX-2026-0085",
    date: "2026-02-18 16:47",
    type: "collateral",
    amount: 2_500,
    rate: null,
    counterparty: "—",
    maturity: null,
    status: "exécuté",
  },
  {
    id: "TX-2026-0079",
    date: "2026-02-15 11:20",
    type: "remboursement",
    amount: 8_125_000,
    rate: 10.8,
    counterparty: "0.0.5512...",
    maturity: null,
    status: "exécuté",
  },
  {
    id: "TX-2026-0072",
    date: "2026-02-12 10:05",
    type: "emprunt",
    amount: 15_000_000,
    rate: 11.75,
    counterparty: "0.0.3391...",
    maturity: "2026-02-19",
    status: "exécuté",
  },
  {
    id: "TX-2026-0068",
    date: "2026-02-10 14:50",
    type: "pret",
    amount: 20_000_000,
    rate: 11.0,
    counterparty: "0.0.6628...",
    maturity: "2026-03-10",
    status: "exécuté",
  },
  {
    id: "TX-2026-0065",
    date: "2026-02-08 08:30",
    type: "emprunt",
    amount: 7_500_000,
    rate: 12.0,
    counterparty: "0.0.9914...",
    maturity: "2026-02-15",
    status: "annulé",
  },
  {
    id: "TX-2026-0060",
    date: "2026-02-05 13:22",
    type: "remboursement",
    amount: 15_187_500,
    rate: 11.75,
    counterparty: "0.0.3391...",
    maturity: null,
    status: "exécuté",
  },
];

const typeLabels: Record<TransactionType, { label: string; variant: "info" | "success" | "warning" | "neutral" }> = {
  emprunt: { label: "Emprunt", variant: "info" },
  pret: { label: "Prêt", variant: "success" },
  collateral: { label: "Collatéral", variant: "warning" },
  remboursement: { label: "Remboursement", variant: "neutral" },
};

const statusVariant: Record<string, "success" | "danger" | "warning"> = {
  "exécuté": "success",
  "annulé": "danger",
  "en cours": "warning",
};

function formatMGA(n: number) {
  return n.toLocaleString("fr-FR");
}

export default function HistoryPage() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<TransactionType | "all">("all");

  const filtered = mockHistory.filter((tx) => {
    const matchesSearch =
      tx.id.toLowerCase().includes(search.toLowerCase()) ||
      tx.counterparty.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || tx.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <History className="w-7 h-7 text-brand-500" />
            Historique des Transactions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi complet de toutes vos opérations sur le marché
          </p>
        </div>
        <Button variant="ghost" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Exporter CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par ID ou contrepartie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {(["all", "emprunt", "pret", "collateral", "remboursement"] as const).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    filterType === t
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t === "all" ? "Tous" : typeLabels[t].label}
                </button>
              )
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 font-medium text-gray-500">
                  ID
                </th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">
                  Date
                </th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">
                  Type
                </th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">
                  Montant
                </th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">
                  Taux
                </th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">
                  Contrepartie
                </th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">
                  Échéance
                </th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 font-mono text-xs text-brand-600 font-medium">
                    {tx.id}
                  </td>
                  <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                    {tx.date}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={typeLabels[tx.type].variant}>
                      {typeLabels[tx.type].label}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-gray-900">
                    {formatMGA(tx.amount)}
                    <span className="text-gray-400 ml-1 text-xs">
                      {tx.type === "collateral" ? "wBTA" : "tMGA"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-gray-700">
                    {tx.rate !== null ? `${tx.rate}%` : "—"}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">
                    {tx.counterparty}
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-xs">
                    {tx.maturity ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={statusVariant[tx.status]} dot>
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    Aucune transaction trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
