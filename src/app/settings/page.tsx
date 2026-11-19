"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/layout/AppShell";
import { LeftSidebar, useLeftSidebar } from "@/components/layout/LeftSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { db } from "@/lib/db/dexie";
import { ImportFolderModal } from "@/modules/folder-sync/components/ImportFolderModal";
import { SettingsView } from "@/modules/settings/components/SettingsView";

export default function SettingsPage() {
  const [importFolderOpen, setImportFolderOpen] = useState(false);
  const [leftOpen, toggleLeft] = useLeftSidebar();
  const router = useRouter();
  const settings = useLiveQuery(() => db.settings.get("default"));

  return (
    <AppShell>
      <main className="flex h-screen overflow-hidden">
        <LeftSidebar
          open={leftOpen}
          onToggle={toggleLeft}
          activeView="settings"
          onCreate={() => router.push("/?view=all&create=1")}
          onSelect={(view) => {
            if (view !== "settings") router.push(`/?view=${encodeURIComponent(view)}`);
          }}
          onImportFolder={() => setImportFolderOpen(true)}
        />
        <section className="editor-shell flex min-w-0 flex-1 flex-col">
          <TopBar
            title="Paramètres"
            breadcrumb="Espace local"
            showNoteActions={false}
            leftOpen={leftOpen}
            onToggleLeft={toggleLeft}
            onToggleRight={() => undefined}
            onClassify={() => undefined}
            onHistory={() => undefined}
          />
          <SettingsView settings={settings} onImportFolder={() => setImportFolderOpen(true)} />
        </section>
      </main>
      {importFolderOpen ? <ImportFolderModal onClose={() => setImportFolderOpen(false)} /> : null}
    </AppShell>
  );
}
