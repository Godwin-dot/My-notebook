"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, FilePlus2, Inbox, Layers3, Search, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { createNote } from "@/lib/db/repositories";
import { searchEngine } from "@/lib/search/minisearch";
import type { PriorityLevel } from "@/types/models";

type PaletteMode = "search" | "capture";

const priorityOptions: Array<{ value: PriorityLevel; label: string }> = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Normale" },
  { value: "high", label: "Haute" },
];

export function CommandPaletteModal() {
  const [mode, setMode] = useState<PaletteMode>("search");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureContent, setCaptureContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>("medium");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const categories = useLiveQuery(() => db.categories.orderBy("order").toArray()) ?? [];
  const results = useMemo(() => query.trim() ? searchEngine.search(query).slice(0, 7) : [], [query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setMode("search");
        setQuery("");
        setError("");
        setOpen(true);
      } else if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setMode("capture");
        setError("");
        setOpen(true);
      } else if (event.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mode, open]);

  useEffect(() => {
    const handleOpenCapture = () => {
      setMode("capture");
      setError("");
      setOpen(true);
    };
    window.addEventListener("pkm:open-capture", handleOpenCapture);
    return () => window.removeEventListener("pkm:open-capture", handleOpenCapture);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function close(): void {
    setOpen(false);
    setError("");
  }

  function navigate(view: string): void {
    close();
    window.dispatchEvent(new CustomEvent<string>("pkm:navigate", { detail: view }));
  }

  function openNote(id: string): void {
    close();
    window.dispatchEvent(new CustomEvent<string>("pkm:open-note", { detail: id }));
  }

  async function capture(): Promise<void> {
    const title = captureTitle.trim();
    if (!title) {
      setError("Saisissez un titre ou une idée pour la capture.");
      return;
    }
    setError("");
    try {
      const note = await createNote({
        title,
        content: captureContent.trim(),
        categoryId: categoryId || null,
        priority,
        status: "inbox",
        isProject: false,
      });
      setCaptureTitle("");
      setCaptureContent("");
      setCategoryId("");
      setPriority("medium");
      close();
      setToast(`« ${note.title} » ajoutée à l’Inbox`);
    } catch {
      setError("La capture n’a pas pu être enregistrée localement.");
    }
  }

  if (!open) {
    return toast ? <div className="capture-toast" role="status">{toast}</div> : null;
  }

  return (
    <>
      <button type="button" className="command-backdrop" aria-label="Fermer la palette" onClick={close} />
      <section className="command-modal" role="dialog" aria-modal="true" aria-label={mode === "capture" ? "Capture rapide" : "Palette de commandes"}>
        <div className="command-mode-tabs">
          <button type="button" className={mode === "search" ? "command-mode-active" : ""} onClick={() => { setMode("search"); setError(""); }}>
            <Search size={14} /> Rechercher
          </button>
          <button type="button" className={mode === "capture" ? "command-mode-active" : ""} onClick={() => { setMode("capture"); setError(""); }}>
            <Inbox size={14} /> Capture rapide
          </button>
          <button type="button" className="command-close" aria-label="Fermer" onClick={close}><X size={15} /></button>
        </div>

        {mode === "search" ? (
          <>
            <label className="command-search-field">
              <Search size={17} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une note ou une commande…"
                aria-label="Rechercher"
              />
              <kbd>ESC</kbd>
            </label>
            <div className="command-results">
              {query.trim() ? results.map((result) => (
                <button type="button" key={String(result.id)} className="command-result" onClick={() => openNote(String(result.id))}>
                  <FilePlus2 size={15} />
                  <span className="command-result-copy">
                    <strong>{String(result.title ?? "Sans titre")}</strong>
                    <small>{String(result.content ?? "").replace(/[#*_]/g, "").slice(0, 100)}</small>
                  </span>
                  <CornerDownLeft size={13} className="command-result-enter" />
                </button>
              )) : null}
              {query.trim() && results.length === 0 ? <p className="command-empty">Aucune note trouvée.</p> : null}
            </div>
            <div className="command-actions">
              <button type="button" onClick={() => { close(); window.dispatchEvent(new CustomEvent("pkm:create-note")); }}>
                <FilePlus2 size={14} /> Nouvelle note
              </button>
              <button type="button" onClick={() => setMode("capture")}><Inbox size={14} /> Capturer une idée</button>
              <button type="button" onClick={() => navigate("inbox")}><Inbox size={14} /> Aller à l’Inbox</button>
              <button type="button" onClick={() => navigate("projects")}><Layers3 size={14} /> Aller aux Projets</button>
            </div>
          </>
        ) : (
          <form
            className="capture-form"
            onSubmit={(event) => { event.preventDefault(); void capture(); }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void capture();
              }
            }}
          >
            <input
              ref={inputRef}
              value={captureTitle}
              onChange={(event) => setCaptureTitle(event.target.value)}
              className="capture-title-input"
              placeholder="Une idée à ne pas perdre…"
              aria-label="Titre de l’idée"
              required
            />
            <textarea
              value={captureContent}
              onChange={(event) => setCaptureContent(event.target.value)}
              placeholder="Ajouter un contexte (facultatif)"
              aria-label="Contenu de l’idée"
              rows={3}
            />
            <div className="capture-fields">
              <label>
                <span>Catégorie</span>
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Sans catégorie</option>
                  {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>
                <span>Priorité</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value as PriorityLevel)}>
                  {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            {error ? <p className="command-error" role="alert">{error}</p> : null}
            <div className="capture-footer">
              <span><kbd>Ctrl</kbd> / <kbd>⌘</kbd> <kbd>↵</kbd> pour capturer</span>
              <button type="submit" className="capture-submit">Capturer dans l’Inbox <CornerDownLeft size={14} /></button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
