"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Upload, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { importMarkdownEntries } from "@/modules/folder-sync/services/zip-service";
import type { MarkdownImportEntry } from "@/modules/folder-sync/services/markdown-import";
import {
  getDirectoryFiles,
  getFolderCategories,
  selectLocalDirectory,
  type SelectedFolderFile,
} from "@/modules/folder-sync/services/folder-importer";

export function ImportFolderModal({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFolderFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const existingCategories = useLiveQuery(() => db.categories.toArray()) ?? [];
  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "");
    inputRef.current?.setAttribute("directory", "");
  }, []);

  async function chooseDirectory() {
    setError("");
    setResult(null);
    if (!("showDirectoryPicker" in window)) {
      inputRef.current?.click();
      return;
    }
    try {
      const selected = await selectLocalDirectory();
      setFiles(selected);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Le dossier n’a pas pu être lu.");
    }
  }

  async function importSelectedFiles() {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setResult(null);
    setProgress(0);
    try {
      const entries: MarkdownImportEntry[] = [];
      for (const [index, item] of files.entries()) {
        entries.push({ path: item.path, content: await item.file.text() });
        setProgress(Math.round(((index + 1) / files.length) * 55));
      }
      const count = await importMarkdownEntries(entries, (processed, total) => {
        setProgress(55 + Math.round((processed / total) * 45));
      });
      setResult(count);
      setProgress(100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’import du dossier a échoué.");
    } finally {
      setBusy(false);
    }
  }

  const categories = getFolderCategories(files);
  const newCategories = categories.filter((name) =>
    !existingCategories.some((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase()),
  );

  return (
    <div className="folder-import-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="folder-import-modal" role="dialog" aria-modal="true" aria-labelledby="folder-import-title">
        <header className="folder-import-header">
          <div className="folder-import-icon"><FolderOpen size={18} /></div>
          <div><h2 id="folder-import-title">Importer un dossier</h2><p>Les fichiers restent sur votre appareil; seules les notes choisies sont lues.</p></div>
          <button type="button" className="icon-button" aria-label="Fermer" onClick={onClose} disabled={busy}><X size={15} /></button>
        </header>

        <div className="folder-import-body">
          <button type="button" className="folder-picker-button" onClick={() => void chooseDirectory()} disabled={busy}>
            <FolderOpen size={16} />
            {files.length ? "Choisir un autre dossier" : "Parcourir les dossiers"}
          </button>
          <p className="folder-import-hint">
            Sélection native sur Chromium, avec sélection de dossier multi-fichiers en solution de repli.
          </p>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            multiple
            accept=".md,.txt,text/markdown,text/plain"
            onChange={(event) => setFiles(event.target.files ? getDirectoryFiles(event.target.files) : [])}
            aria-label="Sélectionner un dossier local"
          />

          {files.length ? (
            <div className="folder-import-preview">
              <div className="folder-preview-stats">
                <span><strong>{files.length}</strong><small>fichiers Markdown / texte</small></span>
                <span><strong>{newCategories.length}</strong><small>catégories à créer</small></span>
              </div>
              {categories.length ? <div className="folder-preview-categories">{categories.map((category) => {
                const isNew = newCategories.includes(category);
                return <span className={isNew ? "folder-category-new" : ""} key={category}>{isNew ? "+ " : "✓ "}{category}</span>;
              })}</div> : null}
              <ul className="folder-preview-files">
                {files.slice(0, 5).map((item) => <li key={`${item.path}-${item.file.lastModified}`}>{item.path}</li>)}
                {files.length > 5 ? <li>et {files.length - 5} autre{files.length > 6 ? "s" : ""} fichier{files.length > 6 ? "s" : ""}…</li> : null}
              </ul>
            </div>
          ) : (
            <div className="folder-import-empty"><Upload size={19} /><span>Sélectionnez un dossier contenant des fichiers .md ou .txt</span></div>
          )}

          {busy ? <div className="folder-import-progress"><div><span>Import en cours</span><strong>{progress}%</strong></div><i><b style={{ width: `${progress}%` }} /></i></div> : null}
          {result !== null ? <p className="folder-import-result"><Check size={14} />{result} note{result !== 1 ? "s" : ""} importée{result !== 1 ? "s" : ""} sans doublon.</p> : null}
          {error ? <p className="folder-import-error" role="alert">{error}</p> : null}
        </div>

        <footer className="folder-import-footer">
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={busy}>Fermer</button>
          <button type="button" className="settings-primary-button" disabled={!files.length || busy} onClick={() => void importSelectedFiles()}>
            {busy ? "Importation…" : "Importer les fichiers"}
          </button>
        </footer>
      </section>
    </div>
  );
}
