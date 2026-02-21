"use client";

import React from "react";

interface HealthGaugeProps {
  /** Percentage value — e.g. 110 means 110% */
  value: number;
  label?: string;
}

function getColor(value: number) {
  if (value >= 105) return { bar: "bg-success-500", text: "text-success-600" };
  if (value >= 102) return { bar: "bg-warning-500", text: "text-warning-600" };
  return { bar: "bg-danger-500", text: "text-danger-600" };
}

export default function HealthGauge({
  value,
  label = "Health Factor",
}: HealthGaugeProps) {
  const clamped = Math.min(Math.max(value, 0), 150);
  const pct = (clamped / 150) * 100;
  const { bar, text } = getColor(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        <span className={`text-sm font-semibold font-mono ${text}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>0%</span>
        <span className="text-danger-400">102%</span>
        <span className="text-warning-400">105%</span>
        <span>150%</span>
      </div>
    </div>
  );
}
