"use client";

import Link from "next/link";
import Image from "next/image";
import { Children, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Check, Coins, Brush, Move, Play, Redo2, Trash2, Undo2, X } from "lucide-react";
import { ColorPicker } from "./ColorPicker";


type CanvasPageLayoutProps = {
  children: ReactNode;
  isLoggedIn: boolean;
  credits?: number;
  onSignIn: () => void;
  onSignOut: () => void;
  onBuyCredits: () => void;
  signInDisabled?: boolean;
  showFooter?: boolean;
  onHowItWorks: () => void;
  colors: string[];
  selectedColor: string;
  onSelectColor: (color: string) => void;
  enforceColors?: boolean;
  changedCount: number;
  totalCost: number;
  onUndo: () => void;
  onRedo: () => void;
  onCommit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canCommit: boolean;
  isCommitting?: boolean;
  onClearPending: () => void;
  canClear: boolean;
  onMove?: () => void;
  canMove?: boolean;
  moveActive?: boolean;
  showMoveHint?: boolean;
  onDismissMoveHint?: () => void;
  replayCanvasId?: string;
  isFreeModePainting?: boolean;
  onFreeModePaintingChange?: (value: boolean) => void;
};

export function CanvasPageLayout({
  children,
  isLoggedIn,
  credits,
  onSignIn,
  onSignOut,
  onBuyCredits,
  signInDisabled = false,
  showFooter = true,
  onHowItWorks,
  colors,
  selectedColor,
  onSelectColor,
  enforceColors = false,
  changedCount,
  totalCost,
  onUndo,
  onRedo,
  onCommit,
  canUndo,
  canRedo,
  canCommit,
  isCommitting = false,
  onClearPending,
  canClear,
  onMove,
  canMove = false,
  moveActive = false,
  showMoveHint = false,
  onDismissMoveHint,
  replayCanvasId,
  isFreeModePainting = false,
  onFreeModePaintingChange,
}: CanvasPageLayoutProps) {
  const showInlineBubble = showFooter;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-white.svg"
              alt="PixAgora"
              width={100}
              height={24}
              className="h-10 w-auto dark:hidden"
              priority
            />
            <Image
              src="/logo-dark.svg"
              alt="PixAgora"
              width={100}
              height={24}
              className="h-10 w-auto hidden dark:block"
              priority
            />
          </div>

          <div className="hidden flex-1 items-center justify-center gap-4 md:flex">
            <button
              type="button"
              onClick={onHowItWorks}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Jak to funguje?
            </button>
            {replayCanvasId && (
              <Link
                href={{ pathname: "/canvas/replay", query: { canvasId: replayCanvasId } }}
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
              >
                <Play className="h-3 w-3" />
                Replay
              </Link>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {typeof credits === "number" && (
                  <div className="hidden items-center gap-1 text-sm font-medium text-muted-foreground sm:flex">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground">{credits}</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onBuyCredits}
                  className="hidden sm:inline-flex"
                >
                  Dobít kredity
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onSignOut}
                >
                  Odhlásit
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={onSignIn}
                disabled={signInDisabled}
              >
                Kreslit
              </Button>
            )}
          </div>
        </div>

        {/* Mobile: nav + credits bar */}
        <div className="mx-auto flex w-full max-w-6xl items-center border-t px-4 py-1.5 md:hidden">
          <div className="flex flex-1 items-center justify-start gap-3">
            <button
              type="button"
              onClick={onHowItWorks}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Jak to funguje?
            </button>
            {replayCanvasId && (
              <Link
                href={{ pathname: "/canvas/replay", query: { canvasId: replayCanvasId } }}
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
              >
                <Play className="h-3 w-3" />
                Replay
              </Link>
            )}
          </div>
          {isLoggedIn && (
            <div className="flex shrink-0 items-center gap-2">
              {typeof credits === "number" && (
                <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground">{credits}</span>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onBuyCredits}
              >
                Dobít kredity
              </Button>
            </div>
          )}
        </div>

      </header>

      <main data-tutorial="canvas" className="flex-1 min-h-0 overflow-hidden">
        {Children.toArray(children).map((child, index) => (
          <section
            key={`canvas-section-${index}`}
            className="h-full w-full"
          >
            {child}
          </section>
        ))}
      </main>

      {showFooter && (
        <>
          <footer className="shrink-0 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-2 text-xs sm:h-16 sm:gap-3 sm:px-4">
              <div data-tutorial="color-picker" className="min-w-0 flex-1">
                <ColorPicker
                  colors={colors}
                  selectedColor={selectedColor}
                  onSelectColor={onSelectColor}
                  enforceColors={enforceColors}
                />
              </div>

              <span className="hidden h-5 w-px bg-muted-foreground/30 sm:inline-block" />
              {onFreeModePaintingChange && (
                  <button
                    type="button"
                    onClick={() => onFreeModePaintingChange(!isFreeModePainting)}
                    aria-label={isFreeModePainting ? "Vypnout režim kreslení tažením" : "Zapnout režim kreslení tažením"}
                    title={isFreeModePainting ? "Vypnout režim kreslení tažením" : "Zapnout režim kreslení tažením"}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground sm:h-9 sm:w-9 ${isFreeModePainting ? "text-green-500" : ""}`}
                  >
                    <Brush className="h-4 w-4" />
                  </button>
                )}

              <div className="flex-1"/>

              <div className="flex items-center gap-1 shrink-0 sm:gap-2">
                
                {showInlineBubble && (
                  <div className="hidden items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-[12px] font-medium text-muted-foreground lg:flex">
                    <span className="whitespace-nowrap">
                      <strong className="text-foreground">{changedCount}</strong> px
                    </span>
                    <span className="text-muted-foreground/60">•</span>
                    <Coins className="h-4 w-4" />
                    <span className="whitespace-nowrap">
                      <strong className="text-foreground">{totalCost}</strong>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40 sm:h-9 sm:w-9"
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40 sm:h-9 sm:w-9"
                  aria-label="Redo"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onClearPending}
                  disabled={!canClear}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40 sm:h-9 sm:w-9"
                  aria-label="Smazat návrh"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {onMove && (
                  <button
                    type="button"
                    onClick={onMove}
                    disabled={!canMove}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40 sm:h-9 sm:w-9 ${moveActive ? "bg-foreground/10 text-foreground" : ""}`}
                    aria-label="Přesunout návrh"
                  >
                    <Move className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCommit}
                  disabled={!canCommit || isCommitting}
                  aria-label="Zakreslit"
                  data-tutorial="commit"
                  className="inline-flex h-8 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 sm:h-9 sm:px-4 sm:text-sm"
                >
                  <Check className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">Zakreslit</span>
                </button>
              </div>
            </div>
          </footer>
          <div
            className={`pointer-events-none absolute left-1/2 bottom-16 -translate-x-1/2 sm:bottom-[4.5rem] ${showInlineBubble ? "lg:hidden" : ""}`}
          >
            <div className="flex items-center gap-2 rounded-full border bg-background/90 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
              <span className="whitespace-nowrap">
                <strong className="text-foreground">{changedCount}</strong> px
              </span>
              <span className="text-muted-foreground/60">•</span>
              <Coins className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">
                <strong className="text-foreground">{totalCost}</strong>
              </span>
            </div>
          </div>
          {showMoveHint && (
            <div className="pointer-events-none absolute left-1/2 bottom-28 -translate-x-1/2 sm:bottom-[6.5rem]">
              <div className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-2xl border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                <span>
                  Cena pixelu se zdražila během tvé editace, zvaž přesunutí pomocí
                  nástroje{" "}
                  <button
                    type="button"
                    onClick={() => {
                      onMove?.();
                      onDismissMoveHint?.();
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-background/80 px-2 py-0.5 text-[11px] font-semibold text-foreground transition hover:text-foreground dark:border-white/10"
                  >
                    <Move className="h-3 w-3" />
                    Move tool
                  </button>
                  .
                </span>
                {onDismissMoveHint && (
                  <button
                    type="button"
                    onClick={onDismissMoveHint}
                    className="mt-0.5 rounded-full p-1 text-muted-foreground transition hover:text-foreground"
                    aria-label="Zavřít"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
