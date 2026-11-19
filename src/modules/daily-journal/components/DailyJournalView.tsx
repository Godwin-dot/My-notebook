"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, PanelLeftClose, PanelLeftOpen, PanelRight, Sparkles } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import type { AppSettings, Note } from "@/types/models";
import { NoteEditor, type OutlineHeading } from "@/modules/editor/components/NoteEditor";
import { PropertiesBar } from "@/modules/editor/components/PropertiesBar";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";
import { AIProposalCard } from "@/modules/ai-copilot/components/AIProposalCard";
import { useAIStatus } from "@/modules/ai-copilot/hooks/useAIStatus";
import { aiService } from "@/modules/ai-copilot/services/ai-service";
import type { TaskItem } from "@/types/models";

interface DailyJournalViewProps {
  dateStr: string;
  note: Note | null;
  settings?: AppSettings;
  updateError: boolean;
  onDateChange: (date: string) => void;
  onNoteChange: (changes: Partial<Note>) => Promise<void>;
  onApplyReview: (noteId: string, sourceContent: string, content: string) => Promise<void>;
  onOutlineChange: (headings: OutlineHeading[]) => void;
  leftOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleProject: () => void;
}

const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];

export function DailyJournalView({
  dateStr,
  note,
  settings,
  updateError,
  onDateChange,
  onNoteChange,
  onApplyReview,
  onOutlineChange,
  leftOpen,
  onToggleLeft,
  onToggleRight,
  onToggleProject,
}: DailyJournalViewProps) {
  const allDailyNotes = useLiveQuery(
    () => db.notes.toCollection().filter((candidate) => candidate.isDaily).toArray(),
  ) ?? [];
  const completedTasks = useLiveQuery(
    () => note
      ? db.tasks.where("noteId").equals(note.id).filter((task) => task.isCompleted).toArray()
      : Promise.resolve([] as TaskItem[]),
    [note?.id],
  ) ?? [];
  const [reviewProposal, setReviewProposal] = useState<{ sourceContent: string; text: string } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const reviewRequestId = useRef(0);
  const { disabledReason, configureService } = useAIStatus();
  const weekDays = useMemo(() => getWeekDays(dateStr), [dateStr]);
  const activeDate = parseLocalDate(dateStr);
  const formattedDate = activeDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isReady = note?.isDaily && note.dailyDate === dateStr;

  function moveDay(amount: number) {
    const next = parseLocalDate(dateStr);
    next.setDate(next.getDate() + amount);
    onDateChange(formatDate(next));
  }

  async function generateReview() {
    if (!note) return;
    configureService();
    const requestId = ++reviewRequestId.current;
    setReviewProposal(null);
    setReviewError("");
    setReviewLoading(true);
    try {
      const text = await aiService.generateDailyReview(note, completedTasks);
      if (requestId === reviewRequestId.current) setReviewProposal({ sourceContent: note.content, text });
    } catch (caught) {
      if (requestId === reviewRequestId.current) {
        setReviewError(caught instanceof Error ? caught.message : "Le bilan du jour n’a pas pu être généré.");
      }
    } finally {
      if (requestId === reviewRequestId.current) setReviewLoading(false);
    }
  }

  return (
    <div className="daily-journal-view">
      <header className="daily-journal-header ambient-glow">
        <div className="daily-journal-heading">
          <button type="button" className="icon-button" aria-label="Jour précédent" onClick={() => moveDay(-1)}>
            <ArrowLeft size={16} />
          </button>
          <div className="daily-date-title">
            <span className="collection-kicker">JOURNAL QUOTIDIEN</span>
            <h1>{capitalize(formattedDate)}</h1>
          </div>
          <button type="button" className="icon-button" aria-label="Jour suivant" onClick={() => moveDay(1)}>
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="daily-journal-actions">
          <button type="button" className="icon-button daily-panel-toggle" aria-label={leftOpen ? "Fermer la barre latérale" : "Ouvrir la barre latérale"} onClick={onToggleLeft}>
            {leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          <button type="button" className="icon-button daily-panel-toggle" aria-label="Afficher ou masquer le panneau droit" onClick={onToggleRight}>
            <PanelRight size={15} />
          </button>
          <label className="daily-date-picker" aria-label="Choisir une date">
            <CalendarDays size={14} />
            <input type="date" value={dateStr} onChange={(event) => onDateChange(event.target.value)} />
          </label>
          <button type="button" className="daily-today-button" onClick={() => onDateChange(getToday())}>Aujourd’hui</button>
          <AIActionButton
            className="ai-button"
            disabledReason={disabledReason ?? (!note ? "Ouvrez d’abord le journal du jour." : undefined)}
            loading={reviewLoading}
            onClick={() => void generateReview()}
          >
            <Sparkles size={14} /> Générer le bilan
          </AIActionButton>
        </div>
      </header>

      <nav className="daily-week-strip" aria-label="Jours de la semaine">
        {weekDays.map((day, index) => {
          const hasEntry = allDailyNotes.some((item) => item.dailyDate === day.value);
          const isActive = day.value === dateStr;
          return (
            <button
              type="button"
              key={day.value}
              className={`daily-week-day ${isActive ? "daily-week-day-active" : ""}`}
              onClick={() => onDateChange(day.value)}
              aria-current={isActive ? "date" : undefined}
              aria-label={`${day.longLabel}${hasEntry ? ", journal existant" : ""}`}
            >
              <span>{dayLabels[index]}</span>
              <strong>{day.dayNumber}</strong>
              <i className={hasEntry ? "daily-entry-dot daily-entry-dot-visible" : "daily-entry-dot"} />
            </button>
          );
        })}
      </nav>

      {updateError ? <p className="daily-error" role="alert">Impossible d’enregistrer le journal.</p> : null}
      {reviewError ? <p className="daily-error" role="alert">{reviewError}</p> : null}
      {reviewLoading ? (
        <AIProposalCard
          title="Bilan du jour"
          loading
          onApply={() => undefined}
          onIgnore={() => { reviewRequestId.current += 1; setReviewLoading(false); }}
        />
      ) : null}
      {reviewProposal ? (
        <AIProposalCard
          title="Bilan du jour proposé"
          onApply={() => {
            if (!note || note.content !== reviewProposal.sourceContent) {
              setReviewError("Le journal a changé depuis la génération. Relancez le bilan pour éviter d’écraser vos modifications.");
              setReviewProposal(null);
              return;
            }
            void onApplyReview(note.id, reviewProposal.sourceContent, insertDailyReview(note.content, reviewProposal.text))
              .then(() => setReviewProposal(null))
              .catch((caught: unknown) => {
                setReviewError(caught instanceof Error ? caught.message : "Le bilan n’a pas pu être appliqué.");
              });
          }}
          onIgnore={() => setReviewProposal(null)}
        >
          <pre className="ai-proposal-markdown">{reviewProposal.text}</pre>
        </AIProposalCard>
      ) : null}
      {isReady ? (
        <div className="daily-note-content">
          <div className="daily-note-title-row">
            <input
              value={note.title}
              onChange={(event) => void onNoteChange({ title: event.target.value })}
              aria-label="Titre du journal"
            />
            <span className="daily-date-stamp">{dateStr}</span>
          </div>
          <PropertiesBar note={note} onChange={onNoteChange} onToggleProject={onToggleProject} />
          <NoteEditor key={note.id} note={note} settings={settings} onOutlineChange={onOutlineChange} />
        </div>
      ) : (
        <div className="daily-loading" role="status">Ouverture du journal…</div>
      )}
    </div>
  );
}

function insertDailyReview(content: string, review: string): string {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Bilan du soir\s*$/i.test(line));
  if (headingIndex < 0) return `${content.trim()}${content.trim() ? "\n\n" : ""}## Bilan du soir\n${review}\n`;
  const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && /^#{1,6}\s/.test(line));
  const insertAt = nextHeadingIndex < 0 ? lines.length : nextHeadingIndex;
  const sectionContent = lines.slice(headingIndex + 1, insertAt).join("\n").trim();
  const replacement = [sectionContent, review].filter(Boolean).join("\n\n");
  return [...lines.slice(0, headingIndex + 1), replacement, ...lines.slice(insertAt)].join("\n");
}

export function getToday(): string {
  return formatDate(new Date());
}

function getWeekDays(value: string): Array<{ value: string; dayNumber: string; longLabel: string }> {
  const date = parseLocalDate(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return {
      value: formatDate(day),
      dayNumber: String(day.getDate()).padStart(2, "0"),
      longLabel: day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    };
  });
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
}
