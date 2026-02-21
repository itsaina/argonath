"use client";

import React, { useState } from "react";
import { Shield } from "lucide-react";
import Badge from "@/components/ui/Badge";
import RepoCard, { RepoPosition } from "@/components/positions/RepoCard";
import AddCollateralModal from "@/components/positions/AddCollateralModal";
import SubstituteCollateralModal from "@/components/positions/SubstituteCollateralModal";
import RepayModal from "@/components/positions/RepayModal";

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_REPOS: RepoPosition[] = [
  {
    id: "REPO-2026-0042",
    role: "emprunteur",
    maturityDate: "2026-03-15",
    purchasePrice: 250_000_000,
    repoRate: 0.0875,
    durationDays: 30,
    collateralMarketValue: 278_500_000,
    healthFactor: 108.3,
    collateralTokenId: "0.0.4812750",
  },
  {
    id: "REPO-2026-0039",
    role: "preteur",
    maturityDate: "2026-04-01",
    purchasePrice: 500_000_000,
    repoRate: 0.0925,
    durationDays: 60,
    collateralMarketValue: 528_000_000,
    healthFactor: 103.2,
    collateralTokenId: "0.0.4809113",
  },
  {
    id: "REPO-2026-0035",
    role: "emprunteur",
    maturityDate: "2026-02-28",
    purchasePrice: 150_000_000,
    repoRate: 0.095,
    durationDays: 14,
    collateralMarketValue: 148_200_000,
    healthFactor: 98.7,
    collateralTokenId: "0.0.4805421",
  },
  {
    id: "REPO-2026-0028",
    role: "preteur",
    maturityDate: "2026-05-10",
    purchasePrice: 1_000_000_000,
    repoRate: 0.0850,
    durationDays: 90,
    collateralMarketValue: 1_152_000_000,
    healthFactor: 112.5,
    collateralTokenId: "0.0.4798002",
  },
];

/* ------------------------------------------------------------------ */
/*  Filter type                                                        */
/* ------------------------------------------------------------------ */

type Filter = "tous" | "emprunteur" | "preteur";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "emprunteur", label: "Emprunteur" },
  { key: "preteur", label: "Pr\u00EAteur" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Pr = Pc * (1 + r * d / 360) */
function computeRepurchasePrice(
  purchasePrice: number,
  rate: number,
  days: number,
): number {
  return purchasePrice * (1 + (rate * days) / 360);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PositionsPage() {
  const [filter, setFilter] = useState<Filter>("tous");

  /* Modal state */
  const [addCollateralRepo, setAddCollateralRepo] =
    useState<RepoPosition | null>(null);
  const [substituteRepo, setSubstituteRepo] =
    useState<RepoPosition | null>(null);
  const [repayRepo, setRepayRepo] = useState<RepoPosition | null>(null);

  /* Filtered list */
  const filtered =
    filter === "tous"
      ? MOCK_REPOS
      : MOCK_REPOS.filter((r) => r.role === filter);

  /* Deficit calculator for add-collateral modal */
  const addCollateralDeficit = addCollateralRepo
    ? computeRepurchasePrice(
        addCollateralRepo.purchasePrice,
        addCollateralRepo.repoRate,
        addCollateralRepo.durationDays,
      ) *
        1.02 -
      addCollateralRepo.collateralMarketValue
    : 0;

  /* Repurchase price for repay modal */
  const repayRepurchasePrice = repayRepo
    ? computeRepurchasePrice(
        repayRepo.purchasePrice,
        repayRepo.repoRate,
        repayRepo.durationDays,
      )
    : 0;

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Shield className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Mes Positions
            </h1>
            <p className="text-sm text-gray-500">
              Gestion des positions de Pension Livr&eacute;e et suivi des risques
            </p>
          </div>
        </div>
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="cursor-pointer"
            >
              <Badge
                variant={isActive ? "info" : "neutral"}
                dot={isActive}
                className={`transition-colors ${
                  isActive
                    ? ""
                    : "hover:bg-gray-200 cursor-pointer"
                }`}
              >
                {f.label}
                {f.key !== "tous" && (
                  <span className="ml-1 text-xs opacity-60">
                    (
                    {
                      MOCK_REPOS.filter(
                        (r) => f.key === "tous" || r.role === f.key,
                      ).length
                    }
                    )
                  </span>
                )}
                {f.key === "tous" && (
                  <span className="ml-1 text-xs opacity-60">
                    ({MOCK_REPOS.length})
                  </span>
                )}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* ── Repo cards list ─────────────────────────────────────── */}
      <div className="space-y-4">
        {filtered.map((repo) => (
          <RepoCard
            key={repo.id}
            repo={repo}
            onAddCollateral={setAddCollateralRepo}
            onSubstituteCollateral={setSubstituteRepo}
            onRepay={setRepayRepo}
          />
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              Aucune position trouv&eacute;e pour ce filtre.
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {addCollateralRepo && (
        <AddCollateralModal
          open={!!addCollateralRepo}
          onClose={() => setAddCollateralRepo(null)}
          deficit={Math.max(0, addCollateralDeficit)}
          repoId={addCollateralRepo.id}
        />
      )}

      {substituteRepo && (
        <SubstituteCollateralModal
          open={!!substituteRepo}
          onClose={() => setSubstituteRepo(null)}
          repoId={substituteRepo.id}
          currentTokenId={substituteRepo.collateralTokenId}
          currentMarketValue={substituteRepo.collateralMarketValue}
        />
      )}

      {repayRepo && (
        <RepayModal
          open={!!repayRepo}
          onClose={() => setRepayRepo(null)}
          repoId={repayRepo.id}
          purchasePrice={repayRepo.purchasePrice}
          repurchasePrice={repayRepurchasePrice}
          repoRate={repayRepo.repoRate}
          durationDays={repayRepo.durationDays}
        />
      )}
    </>
  );
}
