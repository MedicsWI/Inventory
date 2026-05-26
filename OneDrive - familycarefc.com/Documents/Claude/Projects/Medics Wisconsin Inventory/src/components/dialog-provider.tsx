"use client";

// Promise-based confirm() / prompt() replacements.
// Mounted once in providers.tsx; any client component can call useConfirm() / usePrompt()
// to await a styled dialog instead of using window.confirm / window.prompt.

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// -------------------- Confirm --------------------

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
};

type PromptOptions = {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  type?: "text" | "password" | "email" | "number";
  confirmText?: string;
  cancelText?: string;
  minLength?: number;
  validate?: (value: string) => string | null;   // return error message or null
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
type PromptFn = (opts: PromptOptions) => Promise<string | null>;

const Ctx = React.createContext<{ confirm: ConfirmFn; prompt: PromptFn } | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside DialogProvider");
  return ctx.confirm;
}

export function usePrompt(): PromptFn {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("usePrompt must be used inside DialogProvider");
  return ctx.prompt;
}

// -------------------- Provider --------------------

export function DialogProvider({ children }: { children: React.ReactNode }) {
  // Confirm state
  const [confirmState, setConfirmState] = React.useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  // Prompt state
  const [promptState, setPromptState] = React.useState<
    (PromptOptions & { resolve: (v: string | null) => void }) | null
  >(null);
  const [promptValue, setPromptValue] = React.useState("");
  const [promptError, setPromptError] = React.useState<string | null>(null);

  const confirm: ConfirmFn = React.useCallback(
    (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );
  const prompt: PromptFn = React.useCallback(
    (opts) =>
      new Promise((resolve) => {
        setPromptValue(opts.initialValue ?? "");
        setPromptError(null);
        setPromptState({ ...opts, resolve });
      }),
    [],
  );

  function handleConfirmClose(answer: boolean) {
    confirmState?.resolve(answer);
    setConfirmState(null);
  }

  function handlePromptClose(value: string | null) {
    if (value !== null && promptState) {
      // Validate before resolving
      if (promptState.minLength && value.length < promptState.minLength) {
        setPromptError(`Must be at least ${promptState.minLength} characters.`);
        return;
      }
      if (promptState.validate) {
        const err = promptState.validate(value);
        if (err) {
          setPromptError(err);
          return;
        }
      }
    }
    promptState?.resolve(value);
    setPromptState(null);
  }

  const value = React.useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Confirm dialog */}
      <Dialog
        open={!!confirmState}
        onOpenChange={(open) => { if (!open) handleConfirmClose(false); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmState?.title}</DialogTitle>
            {confirmState?.description && (
              <DialogDescription>{confirmState.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleConfirmClose(false)}>
              {confirmState?.cancelText ?? "Cancel"}
            </Button>
            <Button
              variant={confirmState?.variant === "destructive" ? "destructive" : "default"}
              onClick={() => handleConfirmClose(true)}
            >
              {confirmState?.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt dialog */}
      <Dialog
        open={!!promptState}
        onOpenChange={(open) => { if (!open) handlePromptClose(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promptState?.title}</DialogTitle>
            {promptState?.description && (
              <DialogDescription>{promptState.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-1">
            {promptState?.label && (
              <label className="text-sm font-medium">{promptState.label}</label>
            )}
            <Input
              type={promptState?.type ?? "text"}
              value={promptValue}
              onChange={(e) => { setPromptValue(e.target.value); setPromptError(null); }}
              placeholder={promptState?.placeholder}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handlePromptClose(promptValue);
                }
              }}
            />
            {promptError && <p className="text-xs text-danger">{promptError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handlePromptClose(null)}>
              {promptState?.cancelText ?? "Cancel"}
            </Button>
            <Button onClick={() => handlePromptClose(promptValue)}>
              {promptState?.confirmText ?? "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
