"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
  Plus,
  RefreshCw,
  CreditCard,
  Clock,
  FileText,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import HealthGauge from "@/components/ui/HealthGauge";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RepoPosition {
  id: string;
  role: "emprunteur" | "preteur";
  maturityDate: string;
  purchasePrice: number;
  repoRate: number;
  durationDays: number;
  collateralMarketValue: number;
  healthFactor: number;
  collateralTokenId: string;
}

interface RepoCardProps {
  repo: RepoPosition;
  onAddCollateral: (repo: RepoPosition) => void;
  onSubstituteCollateral: (repo: RepoPosition) => void;
  onRepay: (repo: RepoPosition) => void;
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

/** Pr = Pc * (1 + r * d / 360) */
function computeRepurchasePrice(
  purchasePrice: number,
  rate: number,
  days: number,
): number {
  return purchasePrice * (1 + rate * days / 360);
}

function healthVariant(
  health: number,
): "success" | "warning" | "danger" {
  if (health >= 105) return "success";
  if (health >= 102) return "warning";
  return "danger";
}

function healthLabel(health: number): string {
  if (health >= 105) return "Sain";
  if (health >= 102) return "Attention";
  return "Danger";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RepoCard({
  repo,
  onAddCollateral,
  onSubstituteCollateral,
  onRepay,
}: RepoCardProps) {
  const [expanded, setExpanded] = useState(false);

  const repurchasePrice = computeRepurchasePrice(
    repo.purchasePrice,
    repo.repoRate,
    repo.durationDays,
  );

  const inDanger = repo.healthFactor < 102;
  const deficit = inDanger
    ? repurchasePrice * 1.02 - repo.collateralMarketValue
    : 0;

  const variant = healthVariant(repo.healthFactor);

  return (
    <Card padding={false} className="overflow-hidden">
      {/* ── Header (always visible) ────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* ID */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100">
            <FileText className="h-5 w-5 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 font-mono truncate">
              {repo.id}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">
                &Eacute;ch&eacute;ance : {repo.maturityDate}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Role badge */}
          <Badge
            variant={repo.role === "emprunteur" ? "info" : "neutral"}
            className={
              repo.role === "preteur"
                ? "bg-gold-100 text-gold-700"
                : ""
            }
          >
            {repo.role === "emprunteur" ? "Emprunteur" : "Pr\u00EAteur"}
          </Badge>

          {/* Health badge */}
          <Badge variant={variant} dot>
            {healthLabel(repo.healthFactor)}
          </Badge>

          {/* Chevron */}
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* ── Expanded content ───────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Margin call alert */}
          {inDanger && (
            <div className="flex items-center gap-3 bg-danger-50 border-b border-danger-100 px-6 py-3">
              <AlertTriangle className="h-5 w-5 text-danger-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-danger-600">
                  Appel de Marge : Risque de Liquidation
                </p>
                <p className="text-xs text-danger-500 mt-0.5">
                  D&eacute;ficit de collatéral :{" "}
                  <span className="font-mono font-semibold">
                    {formatMGA(Math.ceil(deficit))} tMGA
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Details grid */}
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Purchase Price */}
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Montant Initial (Purchase Price)
                </p>
                <p className="text-lg font-semibold font-mono text-gray-900">
                  {formatMGA(repo.purchasePrice)}
                  <span className="ml-1.5 text-sm font-medium text-gray-400">
                    tMGA
                  </span>
                </p>
              </div>

              {/* Repurchase Price */}
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Montant Final (Repurchase Price)
                </p>
                <p className="text-lg font-semibold font-mono text-gray-900">
                  {formatMGA(Math.round(repurchasePrice))}
                  <span className="ml-1.5 text-sm font-medium text-gray-400">
                    tMGA
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Pr = Pc &times; (1 + {(repo.repoRate * 100).toFixed(2)}% &times;{" "}
                  {repo.durationDays}/360)
                </p>
              </div>

              {/* Collateral Market Value */}
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Valeur du Collat&eacute;ral (Oracle)
                </p>
                <p className="text-lg font-semibold font-mono text-gray-900">
                  {formatMGA(repo.collateralMarketValue)}
                  <span className="ml-1.5 text-sm font-medium text-gray-400">
                    tMGA
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Token : {repo.collateralTokenId}
                </p>
              </div>
            </div>

            {/* Health gauge */}
            <div className="rounded-lg bg-gray-50 p-4">
              <HealthGauge
                value={repo.healthFactor}
                label="Facteur de Sant&eacute;"
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 pt-1">
              {inDanger && (
                <Button
                  variant="danger"
                  size="md"
                  onClick={() => onAddCollateral(repo)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter du Collat&eacute;ral
                </Button>
              )}

              <Button
                variant="primary"
                size="md"
                onClick={() => onRepay(repo)}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Rembourser et Cl&ocirc;turer
              </Button>

              <Button
                variant="ghost"
                size="md"
                onClick={() => onSubstituteCollateral(repo)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Substituer Collat&eacute;ral
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
