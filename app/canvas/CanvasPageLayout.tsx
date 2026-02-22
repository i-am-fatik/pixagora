"use client";

import Link from "next/link";
import { Children, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Check, Coins, Play, Redo2, Undo2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";

const LOGO_SQUARES = ["var(--logo-primary)", "#7F7F7F", "#FFD400", "#F7931A"];

type CanvasPageLayoutProps = {
  children: ReactNode;
  isLoggedIn: boolean;
  credits?: number;
  onSignIn: () => void;
  onSignOut: () => void;
  onBuyCredits: () => void;
  signInDisabled?: boolean;
  showFooter?: boolean;
  faqHref?: string;
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
  replayCanvasId?: string;
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
  faqHref = "/faq",
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
  replayCanvasId,
}: CanvasPageLayoutProps) {
  const showInlineBubble = showFooter;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {LOGO_SQUARES.map((color) => (
                <span
                  key={color}
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <span className="text-base font-semibold tracking-tight">Pixagora</span>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <Link
              href={faqHref}
              className="hidden text-sm font-medium text-muted-foreground transition hover:text-foreground md:inline-flex"
            >
              FAQ
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {replayCanvasId && (
              <Button size="sm" variant="outline" asChild className="hidden sm:inline-flex">
                <Link href={{ pathname: "/canvas/replay", query: { canvasId: replayCanvasId } }}>
                  <Play className="h-3.5 w-3.5" />
                  Replay
                </Link>
              </Button>
            )}
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
                  Koupit kredity
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

        {/* Mobile second row: credits + actions */}
        {isLoggedIn && (
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 border-t px-4 py-1.5 sm:hidden">
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
              Koupit kredity
            </Button>
            {replayCanvasId && (
              <Button size="sm" variant="outline" asChild className="ml-auto">
                <Link href={{ pathname: "/canvas/replay", query: { canvasId: replayCanvasId } }}>
                  <Play className="h-3.5 w-3.5" />
                  Replay
                </Link>
              </Button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
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
              <ColorPicker
                colors={colors}
                selectedColor={selectedColor}
                onSelectColor={onSelectColor}
                enforceColors={enforceColors}
              />

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
                  onClick={onCommit}
                  disabled={!canCommit || isCommitting}
                  aria-label="Zakreslit"
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
        </>
      )}
    </div>
  );
}
