"use client";

import Link from "next/link";
import Image from "next/image";
import { Children, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Check, Coins, Minus, Move, PenLine, Play, Plus, Redo2, Trash2, Undo2, X } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { ToolSwitcher } from "./ToolSwitcher";
import type { ActiveTool } from "./toolbar.types";

const BRUSH_SIZES = [1, 2, 3, 5, 8];

function BrushGrid({ size }: { size: number }) {
  const displaySize = Math.min(size, 5);
  const cellPx = displaySize <= 3 ? 4 : 3;
  const gapPx = 1;
  const totalPx = displaySize * cellPx + (displaySize - 1) * gapPx;
  return (
    <div
      className="shrink-0"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${displaySize}, ${cellPx}px)`,
        gap: `${gapPx}px`,
        width: totalPx,
        height: totalPx,
      }}
    >
      {Array.from({ length: displaySize * displaySize }).map((_, i) => (
        <div key={i} className="rounded-[1px] bg-foreground" />
      ))}
    </div>
  );
}

function BrushSizePicker({ size, onChange }: { size: number; onChange: (s: number) => void }) {
  const idx = BRUSH_SIZES.indexOf(size);
  const canDecrease = idx > 0;
  const canIncrease = idx < BRUSH_SIZES.length - 1;
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => canDecrease && onChange(BRUSH_SIZES[idx - 1])}
        disabled={!canDecrease}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        aria-label="Zmenšit štětec"
      >
        <Minus className="h-3 w-3" />
      </button>
      <div
        className="flex h-7 w-7 items-center justify-center"
        title={`${size}×${size}`}
      >
        <BrushGrid size={size} />
      </div>
      <button
        type="button"
        onClick={() => canIncrease && onChange(BRUSH_SIZES[idx + 1])}
        disabled={!canIncrease}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        aria-label="Zvětšit štětec"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}


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
  commitLocked?: boolean;
  onClearPending: () => void;
  canClear: boolean;
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
  canMove: boolean;
  showMoveHint?: boolean;
  onDismissMoveHint?: () => void;
  replayCanvasId?: string;
  isFreeModePainting?: boolean;
  onFreeModePaintingChange?: (value: boolean) => void;
  brushSize?: number;
  onBrushSizeChange?: (size: number) => void;
  toolContextControls?: ReactNode;
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
  commitLocked = false,
  onClearPending,
  canClear,
  activeTool,
  onToolChange,
  canMove,
  showMoveHint = false,
  onDismissMoveHint,
  replayCanvasId,
  isFreeModePainting = false,
  onFreeModePaintingChange,
  brushSize = 1,
  onBrushSizeChange,
  toolContextControls,
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
            {/* ===== MOBILE: two rows ===== */}
            <div className="md:hidden">
              {/* Row 1: contextual content — full width */}
              <div className="mx-auto w-full max-w-6xl px-2 pt-2 pb-1 min-h-[44px]">
                {activeTool === "paint" && (
                  <div data-tutorial="color-picker" className="min-w-0">
                    <ColorPicker
                      colors={colors}
                      selectedColor={selectedColor}
                      onSelectColor={onSelectColor}
                      enforceColors={enforceColors}
                    />
                  </div>
                )}
                {activeTool === "stamp" && toolContextControls && (
                  <div className="flex items-center gap-2">
                    {toolContextControls}
                  </div>
                )}
                {activeTool === "move" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                    <Move className="h-4 w-4 shrink-0" />
                    <span>Klikni pro přesun</span>
                  </div>
                )}
              </div>
              {/* Row 2: tool switcher + actions */}
              <div className="mx-auto flex w-full max-w-6xl items-center gap-1.5 px-2 pb-2">
                <ToolSwitcher
                  activeTool={activeTool}
                  onToolChange={onToolChange}
                  canMove={canMove}
                />
                {activeTool === "paint" && (
                  <>
                    {onFreeModePaintingChange && (
                      <button
                        type="button"
                        onClick={() => onFreeModePaintingChange(!isFreeModePainting)}
                        aria-label={isFreeModePainting ? "Vypnout tah" : "Zapnout tah"}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground ${
                          isFreeModePainting ? "bg-emerald-500/15 text-emerald-500" : ""
                        }`}
                      >
                        <PenLine className="h-4 w-4" />
                      </button>
                    )}
                    {onBrushSizeChange && (
                      <BrushSizePicker size={brushSize} onChange={onBrushSizeChange} />
                    )}
                  </>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                  aria-label="Redo"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onClearPending}
                  disabled={!canClear}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                  aria-label="Smazat návrh"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="relative group">
                  <button
                    type="button"
                    onClick={onCommit}
                    disabled={!canCommit || isCommitting || commitLocked}
                    aria-label="Zakreslit"
                    data-tutorial="commit"
                    className="inline-flex h-8 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  {commitLocked && (
                    <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[180px] rounded-full border border-black/10 bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm opacity-0 transition group-hover:opacity-100 dark:border-white/10">
                      Plátno bylo uzamčeno
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ===== DESKTOP: single row ===== */}
            <div className="hidden md:block">
              <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 text-xs">
                {/* Tool switcher (inline) */}
                <ToolSwitcher
                  activeTool={activeTool}
                  onToolChange={onToolChange}
                  canMove={canMove}
                />

                <span className="h-5 w-px bg-muted-foreground/30" />

                {/* Contextual tool area */}
                <div data-tutorial="color-picker" className="min-w-0 flex-1">
                  {activeTool === "paint" && (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <ColorPicker
                          colors={colors}
                          selectedColor={selectedColor}
                          onSelectColor={onSelectColor}
                          enforceColors={enforceColors}
                        />
                      </div>
                      {onFreeModePaintingChange && (
                        <button
                          type="button"
                          onClick={() => onFreeModePaintingChange(!isFreeModePainting)}
                          aria-label={isFreeModePainting ? "Vypnout tah" : "Zapnout tah"}
                          title={isFreeModePainting ? "Vypnout režim kreslení tažením" : "Zapnout režim kreslení tažením"}
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground ${
                            isFreeModePainting ? "bg-emerald-500/15 text-emerald-500" : ""
                          }`}
                        >
                          <PenLine className="h-4 w-4" />
                        </button>
                      )}
                      {onBrushSizeChange && (
                        <BrushSizePicker size={brushSize} onChange={onBrushSizeChange} />
                      )}
                    </div>
                  )}
                  {activeTool === "stamp" && toolContextControls && (
                    <div className="flex items-center gap-2">
                      {toolContextControls}
                    </div>
                  )}
                  {activeTool === "move" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Move className="h-4 w-4 shrink-0" />
                      <span>Klikni kam chceš návrh přesunout</span>
                    </div>
                  )}
                </div>

                <span className="h-5 w-px bg-muted-foreground/30" />

                {/* Stats + action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {showInlineBubble && (
                    <div className="flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-[12px] font-medium text-muted-foreground">
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                    aria-label="Undo"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                    aria-label="Redo"
                  >
                    <Redo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onClearPending}
                    disabled={!canClear}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                    aria-label="Smazat návrh"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={onCommit}
                      disabled={!canCommit || isCommitting || commitLocked}
                      aria-label="Zakreslit"
                      data-tutorial="commit"
                      className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      Zakreslit
                    </button>
                    {commitLocked && (
                      <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[180px] rounded-full border border-black/10 bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm opacity-0 transition group-hover:opacity-100 dark:border-white/10">
                        Plátno bylo uzamčeno
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </footer>

          {/* Floating pixel/cost bubble (mobile + tablet, hidden on lg+ where it's inline) */}
          <div
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 md:hidden`}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
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
                      onToolChange("move");
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
