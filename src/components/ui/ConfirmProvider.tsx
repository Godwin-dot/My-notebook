"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

type ConfirmOptions = Pick<ConfirmDialogProps, "title" | "description" | "confirmLabel" | "destructive">;
type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface PendingConfirmation {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const activeRef = useRef<PendingConfirmation | null>(null);
  const queueRef = useRef<PendingConfirmation[]>([]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    const pending = { options, resolve };
    if (activeRef.current) {
      queueRef.current.push(pending);
      return;
    }
    activeRef.current = pending;
    setDialog(options);
  }), []);

  const finish = useCallback((confirmed: boolean) => {
    activeRef.current?.resolve(confirmed);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setDialog(next?.options ?? null);
  }, []);

  useEffect(() => () => {
    activeRef.current?.resolve(false);
    queueRef.current.forEach((pending) => pending.resolve(false));
    activeRef.current = null;
    queueRef.current = [];
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.confirmLabel}
        destructive={dialog?.destructive}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm doit être utilisé dans ConfirmProvider.");
  return confirm;
}
