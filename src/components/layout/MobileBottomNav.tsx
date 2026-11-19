"use client";

import { CalendarDays, LayoutDashboard, Library, Menu, Plus } from "lucide-react";

interface MobileBottomNavProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
  onCapture: () => void;
}

/**
 * Barre de navigation tactile mobile (visible < 768px uniquement).
 * Les 5 accès directs respectent une cible tactile minimale de 44px.
 */
export function MobileBottomNav({ activeView, onNavigate, onOpenMenu, onCapture }: MobileBottomNavProps) {
  const isActive = (view: string) => activeView === view || (view === "today" && activeView.startsWith("daily"));

  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation principale mobile">
      <button
        type="button"
        className={`mobile-bottom-nav-item ${isActive("dashboard") ? "mobile-bottom-nav-item-active" : ""}`}
        onClick={() => onNavigate("dashboard")}
        aria-current={isActive("dashboard") ? "page" : undefined}
      >
        <LayoutDashboard size={20} />
        <span>QG</span>
      </button>

      <button
        type="button"
        className={`mobile-bottom-nav-item ${isActive("today") ? "mobile-bottom-nav-item-active" : ""}`}
        onClick={() => onNavigate("today")}
        aria-current={isActive("today") ? "page" : undefined}
      >
        <CalendarDays size={20} />
        <span>Journal</span>
      </button>

      <button
        type="button"
        className="mobile-bottom-nav-capture"
        onClick={onCapture}
        aria-label="Ouvrir la capture rapide vers l’Inbox"
      >
        <span className="mobile-bottom-nav-capture-icon pill-active"><Plus size={22} /></span>
        <span>Capture</span>
      </button>

      <button
        type="button"
        className={`mobile-bottom-nav-item ${isActive("week") ? "mobile-bottom-nav-item-active" : ""}`}
        onClick={() => onNavigate("week")}
        aria-current={isActive("week") ? "page" : undefined}
      >
        <Library size={20} />
        <span>Semainier</span>
      </button>

      <button type="button" className="mobile-bottom-nav-item" onClick={onOpenMenu} aria-label="Ouvrir le menu complet">
        <Menu size={20} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
