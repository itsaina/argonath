"use client";

import React, { useState, useMemo } from "react";
import { Search, ExternalLink } from "lucide-react";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

/* -- Mock audit rows --------------------------------------------------- */

interface AuditRow {
  hash: string;
  type: "Emprunt" | "Pr\u00eat";
  wallet: string;
  montant: number;
  taux: number;
  timestamp: string;
  statut: "Ex\u00e9cut\u00e9" | "En attente";
}

const MOCK_DATA: AuditRow[] = [
  {
    hash: "0x3a8f…c4e1",
    type: "Emprunt",
    wallet: "WALL-0xA3…7F",
    montant: 25_000_000,
    taux: 11.5,
    timestamp: "2026-02-21 09:14:32",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0x7b2d…91fa",
    type: "Pr\u00eat",
    wallet: "WALL-0xB7…2C",
    montant: 50_000_000,
    taux: 11.25,
    timestamp: "2026-02-21 08:47:15",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0x1cf4…e803",
    type: "Emprunt",
    wallet: "WALL-0xD1…9A",
    montant: 10_000_000,
    taux: 12.0,
    timestamp: "2026-02-21 08:22:05",
    statut: "En attente",
  },
  {
    hash: "0x9e6a…4b2f",
    type: "Pr\u00eat",
    wallet: "WALL-0xE4…3D",
    montant: 75_000_000,
    taux: 10.75,
    timestamp: "2026-02-20 17:58:41",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0x5d01…8c7e",
    type: "Emprunt",
    wallet: "WALL-0xF8…6B",
    montant: 15_000_000,
    taux: 11.8,
    timestamp: "2026-02-20 16:33:19",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0x2fa9…d510",
    type: "Pr\u00eat",
    wallet: "WALL-0x92…1E",
    montant: 30_000_000,
    taux: 11.0,
    timestamp: "2026-02-20 15:12:08",
    statut: "En attente",
  },
  {
    hash: "0xc83b…6a4d",
    type: "Emprunt",
    wallet: "WALL-0x45…8C",
    montant: 40_000_000,
    taux: 12.25,
    timestamp: "2026-02-20 14:05:52",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0x6e17…f293",
    type: "Pr\u00eat",
    wallet: "WALL-0xC6…4F",
    montant: 20_000_000,
    taux: 10.9,
    timestamp: "2026-02-20 11:41:37",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0xab45…1dc8",
    type: "Emprunt",
    wallet: "WALL-0x1A…5E",
    montant: 60_000_000,
    taux: 11.35,
    timestamp: "2026-02-19 18:29:14",
    statut: "Ex\u00e9cut\u00e9",
  },
  {
    hash: "0x04d8…b7a6",
    type: "Pr\u00eat",
    wallet: "WALL-0x73…0B",
    montant: 35_000_000,
    taux: 11.6,
    timestamp: "2026-02-19 16:55:03",
    statut: "En attente",
  },
];

/* -- Helpers ----------------------------------------------------------- */

function formatMontant(n: number): string {
  return n.toLocaleString("fr-FR");
}

/* -- Component --------------------------------------------------------- */

export default function AuditTable() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return MOCK_DATA;
    const q = search.toLowerCase();
    return MOCK_DATA.filter(
      (r) =>
        r.hash.toLowerCase().includes(q) ||
        r.wallet.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.statut.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Journal d&apos;Audit &mdash; Transactions On-Chain</CardTitle>
            <CardDescription>
              Registre horodat&eacute; et immuable des op&eacute;rations de pension
              livr&eacute;e
            </CardDescription>
          </div>

          {/* Search input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher hash, wallet, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 transition-colors"
            />
          </div>
        </div>
      </CardHeader>

      {/* Table */}
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Transaction Hash
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Portefeuille
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Montant (tMGA)
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Taux (%)
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Horodatage
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((row) => (
              <tr
                key={row.hash}
                className="hover:bg-gray-50 transition-colors"
              >
                {/* Hash */}
                <td className="px-6 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-mono text-brand-600">
                    {row.hash}
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                </td>

                {/* Type */}
                <td className="px-6 py-3 whitespace-nowrap">
                  <Badge
                    variant={row.type === "Emprunt" ? "info" : "neutral"}
                    dot
                  >
                    {row.type}
                  </Badge>
                </td>

                {/* Wallet */}
                <td className="px-6 py-3 whitespace-nowrap font-mono text-gray-700">
                  {row.wallet}
                </td>

                {/* Montant */}
                <td className="px-6 py-3 whitespace-nowrap text-right font-mono text-gray-900">
                  {formatMontant(row.montant)}
                </td>

                {/* Taux */}
                <td className="px-6 py-3 whitespace-nowrap text-right font-mono text-gray-900">
                  {row.taux.toFixed(2)}
                </td>

                {/* Horodatage */}
                <td className="px-6 py-3 whitespace-nowrap font-mono text-gray-500 text-xs">
                  {row.timestamp}
                </td>

                {/* Statut */}
                <td className="px-6 py-3 whitespace-nowrap">
                  <Badge
                    variant={
                      row.statut === "Ex\u00e9cut\u00e9" ? "success" : "warning"
                    }
                    dot
                  >
                    {row.statut}
                  </Badge>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-sm text-gray-400"
                >
                  Aucun r&eacute;sultat pour &laquo;&nbsp;{search}&nbsp;&raquo;
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="mt-4 px-0 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 leading-relaxed">
          Donn&eacute;es horodat&eacute;es via Hedera Consensus Service (HCS) &mdash;
          M&eacute;canisme Itayose/Batch-matching garanti
        </p>
      </div>
    </Card>
  );
}
