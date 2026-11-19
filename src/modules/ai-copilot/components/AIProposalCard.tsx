"use client";

import type { ReactNode } from "react";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";

interface AIProposalCardProps {
  title: string;
  children?: ReactNode;
  loading?: boolean;
  error?: string;
  applyLabel?: string;
  applyDisabled?: boolean;
  onApply: () => void;
  onIgnore: () => void;
}

export function AIProposalCard({
  title,
  children,
  loading = false,
  error,
  applyLabel = "Appliquer",
  applyDisabled = false,
  onApply,
  onIgnore,
}: AIProposalCardProps) {
  return (
    <section className="ai-proposal-card" aria-label={`Proposition : ${title}`}>
      <header className="ai-proposal-header">
        <Sparkles size={15} />
        <strong>{title}</strong>
        {loading ? <LoaderCircle className="ai-proposal-spinner" size={14} aria-label="Génération en cours" /> : null}
      </header>
      {loading ? <p className="ai-proposal-status" role="status">Préparation de la proposition…</p> : null}
      {error ? <p className="ai-proposal-error" role="alert">{error}</p> : null}
      {children ? <div className="ai-proposal-content">{children}</div> : null}
      <p className="ai-proposal-disclosure">Cette proposition n’est pas enregistrée. Le texte utile est envoyé au fournisseur IA configuré.</p>
      <footer className="ai-proposal-actions">
        <button type="button" className="ai-proposal-apply" disabled={loading || applyDisabled || Boolean(error)} onClick={onApply}>
          <Check size={13} />{applyLabel}
        </button>
        <button type="button" className="ai-proposal-ignore" disabled={loading} onClick={onIgnore}>
          <X size={13} />Ignorer
        </button>
      </footer>
    </section>
  );
}
