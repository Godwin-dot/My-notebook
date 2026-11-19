"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { aiService, getAIUnavailableReason, isAIConfigured } from "../services/ai-service";

const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

const getOnlineSnapshot = () => navigator.onLine;
const getServerOnlineSnapshot = () => true;

export function useAIStatus() {
  const settings = useLiveQuery(() => db.settings.get("default"));
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);

  useEffect(() => {
    aiService.setSettings(settings);
  }, [settings]);

  return {
    settings,
    online,
    configured: isAIConfigured(settings),
    disabledReason: getAIUnavailableReason(settings, online),
    configureService: () => aiService.setSettings(settings),
  };
}
