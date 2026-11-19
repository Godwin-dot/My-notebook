"use client";

import { PanelLeftOpen } from "lucide-react";

export function LeftSidebarOpenButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  if (open) return null;

  return (
    <button
      type="button"
      className="icon-button shrink-0"
      onClick={onClick}
      aria-label="Ouvrir la barre latérale"
      title="Ouvrir la barre latérale"
    >
      <PanelLeftOpen size={16} />
    </button>
  );
}
