"use client";

import { History, PanelLeftClose, PanelLeftOpen, PanelRight, Sparkles } from "lucide-react";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";
import { useAIStatus } from "@/modules/ai-copilot/hooks/useAIStatus";

interface TopBarProps {
  title: string;
  breadcrumb?: string;
  showNoteActions?: boolean;
  leftOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onClassify: () => void;
  onHistory: () => void;
}

export function TopBar({
  title,
  breadcrumb,
  showNoteActions = true,
  leftOpen,
  onToggleLeft,
  onToggleRight,
  onClassify,
  onHistory,
}: TopBarProps) {
  const { disabledReason } = useAIStatus();

  return (
    <header className="top-bar">
      <button type="button" onClick={onToggleLeft} className="icon-button" aria-label={leftOpen ? "Fermer la barre latérale" : "Ouvrir la barre latérale"}>
        {leftOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        {breadcrumb ? <p className="text-[10px] text-[var(--text-secondary)]">{breadcrumb}</p> : null}
        <p className="truncate text-sm">{title}</p>
      </div>
      <span className="hidden text-xs text-[var(--text-secondary)] sm:block">Sauvegarde locale</span>
      {showNoteActions ? (
        <>
          <AIActionButton className="ai-button" disabledReason={disabledReason} onClick={onClassify}>
            <Sparkles size={14} />
            Classer
          </AIActionButton>
          <button type="button" onClick={onHistory} className="icon-button" aria-label="Historique des versions"><History size={17} /></button>
          <button type="button" onClick={onToggleRight} className="icon-button" aria-label="Afficher ou masquer la boîte à outils">
            <PanelRight size={17} />
          </button>
        </>
      ) : null}
    </header>
  );
}
