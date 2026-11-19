"use client";

import { useState } from "react";
import { Blocks, FileText, Link2, Sparkles, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import type { Note } from "@/types/models";
import { OutlineAndBacklinks } from "@/modules/editor/components/OutlineAndBacklinks";
import type { OutlineHeading } from "@/modules/editor/components/NoteEditor";
import { ToolboxPanel } from "@/modules/editor/components/ToolboxPanel";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";
import { AIProposalCard } from "@/modules/ai-copilot/components/AIProposalCard";
import { VaultChatPanel } from "@/modules/ai-copilot/components/VaultChatPanel";
import { useAIStatus } from "@/modules/ai-copilot/hooks/useAIStatus";
import type { AIClassificationResult } from "@/modules/ai-copilot/services/ai-service";

interface RightPanelProps {
  open: boolean;
  note: Note | null;
  headings: OutlineHeading[];
  onSelectHeading: (position: number) => void;
  onOpenNote: (id: string) => void;
  tab: "tools" | "contents" | "backlinks" | "ai";
  onTabChange: (tab: "tools" | "contents" | "backlinks" | "ai") => void;
  classification?: AIClassificationResult | null;
  classificationLoading?: boolean;
  classificationError?: string;
  onClassify: () => void;
  onApplyClassification: (includeLinks: boolean) => void;
  onIgnoreClassification: () => void;
  onClose: () => void;
}

export function RightPanel({
  open,
  note,
  headings,
  onSelectHeading,
  onOpenNote,
  tab,
  onTabChange,
  classification,
  classificationLoading = false,
  classificationError,
  onClassify,
  onApplyClassification,
  onIgnoreClassification,
  onClose,
}: RightPanelProps) {
  const [includeLinks, setIncludeLinks] = useState(true);
  const [aiMode, setAiMode] = useState<"actions" | "vault">("actions");
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const { disabledReason } = useAIStatus();

  const tabs = [
    ["tools", "Outils", Blocks],
    ["contents", "Sommaire", FileText],
    ["backlinks", "Backlinks", Link2],
    ["ai", "Copilote IA", Sparkles],
  ] as const;

  return (
    <>
      {open ? <button type="button" className="panel-backdrop" aria-label="Fermer le panneau" onClick={onClose} /> : null}
      <aside data-open={open} aria-hidden={!open} inert={!open} className={`${open ? "w-[280px]" : "w-0"} sidebar-right`}>
        <div className="min-w-[279px] h-full">
          <div className="flex border-b border-[var(--border-subtle)]">
            {tabs.map(([key, label, Icon]) => (
              <button
                type="button"
                key={key}
                onClick={() => onTabChange(key)}
                className={`right-tab ${tab === key ? "right-tab-active" : ""}`}
              >
                <Icon size={15} /><span>{label}</span>
              </button>
            ))}
            <button type="button" className="right-panel-close" aria-label="Fermer le panneau" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className={`right-panel-content ${tab === "tools" ? "right-panel-content-tools" : ""}`}>
            {tab === "tools" ? <ToolboxPanel note={note} onOpenNote={onOpenNote} /> : null}
            {tab === "contents" || tab === "backlinks" ? (
              <OutlineAndBacklinks note={note} headings={headings} section={tab} onSelectHeading={onSelectHeading} onOpenNote={onOpenNote} />
            ) : null}
            {tab === "ai" ? (
              <section className="right-ai-panel">
                <div className="right-ai-modes" role="tablist" aria-label="Mode du copilote">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={aiMode === "actions"}
                    className={`right-ai-mode ${aiMode === "actions" ? "right-ai-mode-active" : ""}`}
                    onClick={() => setAiMode("actions")}
                  >
                    Actions Note
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={aiMode === "vault"}
                    className={`right-ai-mode ${aiMode === "vault" ? "right-ai-mode-active" : ""}`}
                    onClick={() => setAiMode("vault")}
                  >
                    ✦ Ask Vault
                  </button>
                </div>
                {aiMode === "actions" ? (
                  <>
                    <p>Les propositions restent en aperçu jusqu’à votre validation. Le contenu de la note est envoyé au fournisseur configuré.</p>
                    <AIActionButton className="ai-button" disabledReason={disabledReason} onClick={onClassify}>
                      <Sparkles size={14} /> Classer cette note
                    </AIActionButton>
                    {classificationLoading ? (
                      <AIProposalCard title="Classement de la note" loading onApply={() => undefined} onIgnore={onIgnoreClassification} />
                    ) : null}
                    {classificationError ? <p className="ai-proposal-error" role="alert">{classificationError}</p> : null}
                    {classification && note ? (
                      <AIProposalCard
                        title="Proposition de classement"
                        onApply={() => onApplyClassification(includeLinks)}
                        onIgnore={onIgnoreClassification}
                      >
                        <dl className="ai-classification-preview">
                          <div><dt>Catégorie</dt><dd>{categories.find((category) => category.id === classification.suggestedCategoryId)?.name ?? "Aucune suggestion"}</dd></div>
                          <div><dt>Résumé</dt><dd>{classification.summary || "Aucun résumé proposé."}</dd></div>
                          <div><dt>Étiquettes</dt><dd>{classification.suggestedTags.length ? classification.suggestedTags.map((tag) => `#${tag}`).join(" · ") : "Aucune"}</dd></div>
                        </dl>
                        {classification.suggestedLinks.length ? (
                          <label className="ai-proposal-checkbox">
                            <input type="checkbox" checked={includeLinks} onChange={(event) => setIncludeLinks(event.target.checked)} />
                            Ajouter les liens suggérés : {classification.suggestedLinks.join(", ")}
                          </label>
                        ) : null}
                      </AIProposalCard>
                    ) : null}
                  </>
                ) : (
                  <VaultChatPanel activeNote={note} onOpenNote={onOpenNote} />
                )}
              </section>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
