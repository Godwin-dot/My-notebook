"use client";

import { useEffect, useState } from "react";

const BOOT_KEY = "pkm_boot_seen";

export function RuntimeBootScreen() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionStorage.getItem(BOOT_KEY)) return;
    sessionStorage.setItem(BOOT_KEY, "1");
    const showTimer = window.setTimeout(() => setVisible(true), 0);
    const fadeTimer = window.setTimeout(() => setFading(true), 600);
    const hideTimer = window.setTimeout(() => setVisible(false), 750);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`runtime-boot ${fading ? "runtime-boot-fade" : ""}`} aria-hidden="true">
      <span className="runtime-boot-corner runtime-boot-tl">+</span>
      <span className="runtime-boot-corner runtime-boot-tr">+</span>
      <span className="runtime-boot-corner runtime-boot-bl">+</span>
      <span className="runtime-boot-corner runtime-boot-br">+</span>
      <div className="runtime-boot-scanline" />
      <div className="runtime-boot-log">
        <p>DEXIE_INDEXEDDB :: READY</p>
        <p>MINISEARCH_VAULT :: SYNCED</p>
        <p>MY-NOTEBOOK // LOCAL_WORKSPACE ↗</p>
      </div>
    </div>
  );
}