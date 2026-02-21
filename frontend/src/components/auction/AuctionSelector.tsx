"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Gavel, Clock, ChevronDown } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

/* ── Types ──────────────────────────────────────────────────────── */

type AuctionStatus = "open" | "resolving" | "closed";

interface Auction {
  id: string;
  label: string;
  maturityDays: number;
  status: AuctionStatus;
  /** ISO-8601 deadline for the auction close */
  closesAt: string;
}

interface AuctionSelectorProps {
  selected?: string;
  onSelect?: (auctionId: string) => void;
}

/* ── Mock data ──────────────────────────────────────────────────── */

const now = new Date();

const AUCTIONS: Auction[] = [
  {
    id: "repo-bta-7",
    label: "Repo BTA — 7 Jours",
    maturityDays: 7,
    status: "open",
    closesAt: new Date(now.getTime() + 2 * 3600_000 + 15 * 60_000).toISOString(),
  },
  {
    id: "repo-bta-14",
    label: "Repo BTA — 14 Jours",
    maturityDays: 14,
    status: "open",
    closesAt: new Date(now.getTime() + 5 * 3600_000 + 42 * 60_000).toISOString(),
  },
  {
    id: "repo-bta-28",
    label: "Repo BTA — 28 Jours",
    maturityDays: 28,
    status: "resolving",
    closesAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
  },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<
  AuctionStatus,
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  open: { label: "Ouverte", variant: "success" },
  resolving: { label: "En cours de résolution", variant: "warning" },
  closed: { label: "Clôturée", variant: "neutral" },
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00h:00m";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${String(hours).padStart(2, "0")}h:${String(minutes).padStart(2, "0")}m`;
}

/* ── Component ──────────────────────────────────────────────────── */

export default function AuctionSelector({
  selected,
  onSelect,
}: AuctionSelectorProps) {
  const [selectedId, setSelectedId] = useState<string>(
    selected ?? AUCTIONS[0].id,
  );
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Live countdown tick */
  const tick = useCallback(() => {
    const nowMs = Date.now();
    const next: Record<string, number> = {};
    for (const a of AUCTIONS) {
      next[a.id] = Math.max(0, new Date(a.closesAt).getTime() - nowMs);
    }
    setCountdowns(next);
  }, []);

  useEffect(() => {
    tick();
    const iv = setInterval(tick, 60_000);
    return () => clearInterval(iv);
  }, [tick]);

  function handleSelect(id: string) {
    setSelectedId(id);
    onSelect?.(id);
    setMobileOpen(false);
  }

  return (
    <section>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100">
          <Gavel className="h-4 w-4 text-brand-600" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">
          Enchères Ouvertes
        </h2>

        {/* Mobile toggle */}
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-sm text-brand-600 md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
        >
          Maturité
          <ChevronDown
            className={`h-4 w-4 transition-transform ${mobileOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* ── Cards grid ───────────────────────────────────────────── */}
      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
          mobileOpen ? "" : "hidden md:grid"
        }`}
      >
        {AUCTIONS.map((auction) => {
          const isSelected = auction.id === selectedId;
          const { label, variant } = STATUS_CONFIG[auction.status];
          const remaining = countdowns[auction.id] ?? 0;
          const isOpen = auction.status === "open";

          return (
            <button
              key={auction.id}
              type="button"
              onClick={() => handleSelect(auction.id)}
              className={`text-left rounded-xl border-2 bg-white p-5 shadow-sm transition-all duration-150 cursor-pointer
                ${
                  isSelected
                    ? "border-brand-600 ring-2 ring-brand-200"
                    : "border-gray-200 hover:border-brand-300"
                }
              `}
            >
              {/* Title + Badge */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-sm font-semibold text-gray-900 leading-tight">
                  {auction.label}
                </span>
                <Badge variant={variant} dot>
                  {label}
                </Badge>
              </div>

              {/* Maturity chip */}
              <div className="mb-3">
                <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                  Maturité : {auction.maturityDays}j
                </span>
              </div>

              {/* Countdown */}
              {isOpen ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Clôture dans{" "}
                    <span className="font-mono font-medium text-gray-700">
                      {formatCountdown(remaining)}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Enchère terminée</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Mobile selected preview (collapsed) ──────────────────── */}
      {!mobileOpen && (
        <div className="md:hidden mt-0">
          {AUCTIONS.filter((a) => a.id === selectedId).map((auction) => {
            const { label, variant } = STATUS_CONFIG[auction.status];
            const remaining = countdowns[auction.id] ?? 0;
            const isOpen = auction.status === "open";
            return (
              <Card key={auction.id} className="border-brand-600 ring-2 ring-brand-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {auction.label}
                  </span>
                  <Badge variant={variant} dot>
                    {label}
                  </Badge>
                </div>
                {isOpen && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Clôture dans{" "}
                      <span className="font-mono font-medium text-gray-700">
                        {formatCountdown(remaining)}
                      </span>
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
