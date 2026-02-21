"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gavel,
  FolderOpen,
  History,
  Shield,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import Badge from "../ui/Badge";

const navigation = [
  { name: "Tableau de Bord", href: "/", icon: LayoutDashboard },
  { name: "Marché des Enchères", href: "/auction", icon: Gavel },
  { name: "Mes Positions", href: "/positions", icon: FolderOpen },
  { name: "Historique", href: "/history", icon: History },
  { name: "Régulateur", href: "/regulator", icon: Shield },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Mock state — replace with real wallet connection */
  const [connected, setConnected] = useState(false);
  const kycValid = true;
  const walletAddress = "0.0.1234567";

  return (
    <header className="bg-brand-900 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gold-400 flex items-center justify-center">
              <span className="text-brand-900 font-bold text-sm">A</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-base font-semibold tracking-tight">
                Andúril
              </span>
              <span className="text-xs text-brand-300 block -mt-0.5">
                Sovereign Repo Market
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-700 text-white"
                      : "text-brand-200 hover:bg-brand-800 hover:text-white"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {/* KYC Badge */}
            {connected && (
              <Badge
                variant={kycValid ? "success" : "danger"}
                dot
                className="hidden sm:inline-flex"
              >
                {kycValid ? "KYC Validé" : "Non Vérifié"}
              </Badge>
            )}

            {/* Wallet button */}
            <button
              onClick={() => setConnected(!connected)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                connected
                  ? "bg-brand-700 text-brand-100 hover:bg-brand-600"
                  : "bg-gold-500 hover:bg-gold-600 text-white"
              }`}
            >
              <Wallet className="w-4 h-4" />
              {connected
                ? `${walletAddress.slice(0, 7)}...`
                : "Connect Wallet"}
            </button>

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-brand-800 transition-colors cursor-pointer"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-brand-800 px-4 pb-4 pt-2 space-y-1">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-700 text-white"
                    : "text-brand-200 hover:bg-brand-800"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
