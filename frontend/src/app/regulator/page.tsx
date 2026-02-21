"use client";

import React from "react";
import { Shield } from "lucide-react";
import Badge from "@/components/ui/Badge";
import MacroDashboard from "@/components/regulator/MacroDashboard";
import AuditTable from "@/components/regulator/AuditTable";

export default function RegulatorPage() {
  return (
    <>
      {/* -- Header banner ------------------------------------------------ */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
              <Shield className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-gray-900">
                  Portail R&eacute;gulateur &mdash; BFM / CSBF
                </h1>
                <Badge variant="warning" dot>
                  Acc&egrave;s Restreint
                </Badge>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Interface en lecture seule connect&eacute;e au Hedera Consensus
                Service pour la transparence du march&eacute;.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -- Macro dashboard ---------------------------------------------- */}
      <div className="mb-8">
        <MacroDashboard />
      </div>

      {/* -- Audit table -------------------------------------------------- */}
      <AuditTable />
    </>
  );
}
