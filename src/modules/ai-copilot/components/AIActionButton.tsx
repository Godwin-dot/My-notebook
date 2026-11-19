"use client";

import type { ReactNode } from "react";
import Link from "next/link";

interface AIActionButtonProps {
  children: ReactNode;
  disabledReason?: string;
  loading?: boolean;
  onClick: () => void;
  className?: string;
  ariaHasPopup?: "menu" | "dialog";
  ariaExpanded?: boolean;
}

export function AIActionButton({
  children,
  disabledReason,
  loading = false,
  onClick,
  className = "",
  ariaHasPopup,
  ariaExpanded,
}: AIActionButtonProps) {
  const disabled = Boolean(disabledReason || loading);
  return (
    <span className="ai-action-wrap">
      <button
        type="button"
        className={className}
        disabled={disabled}
        title={disabledReason}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
        onClick={onClick}
      >
        {children}
      </button>
      {disabledReason ? (
        <span className="ai-action-tooltip" role="tooltip">
          {disabledReason}
          {!disabledReason.includes("hors ligne") ? <Link href="/settings">Ouvrir les paramètres</Link> : null}
        </span>
      ) : null}
    </span>
  );
}
