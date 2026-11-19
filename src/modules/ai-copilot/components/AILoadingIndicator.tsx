"use client";

import type { ReactNode } from "react";

interface AILoadingIndicatorProps {
  label: string;
  children?: ReactNode;
}

export function AILoadingIndicator({ label }: AILoadingIndicatorProps) {
  return (
    <div className="ai-loading-indicator" role="status" aria-live="polite">
      <span className="ai-loading-scan" aria-hidden="true" />
      <span className="ai-loading-label">{label} ↗</span>
    </div>
  );
}