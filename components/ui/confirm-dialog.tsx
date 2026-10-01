"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) and shows a warning icon. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * Imperative confirmation dialog. Replaces native `window.confirm`:
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: "Delete vendor?", destructive: true }))) return
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx)
    throw new Error("useConfirm must be used within a <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = React.useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const destructive = options?.destructive;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog.Root
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-card border bg-background p-5 shadow-xl focus:outline-none">
            <div className="flex items-start gap-3">
              {destructive && (
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold text-foreground">
                  {options?.title}
                </Dialog.Title>
                {options?.description && (
                  <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                    {options.description}
                  </Dialog.Description>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="rounded-app border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                {options?.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => settle(true)}
                className={cn(
                  "rounded-app px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90",
                  destructive
                    ? "bg-destructive text-white"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {options?.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}
