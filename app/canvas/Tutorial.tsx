"use client";

import { useEffect, useRef, useState } from "react";

type TutorialProps = {
  step: 1 | 2 | 3;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
};

const STEP_CONFIG = {
  1: {
    selector: '[data-tutorial="color-picker"]',
    text: "Vyber barvu",
    padding: 8,
    borderRadius: 16,
  },
  2: {
    selector: '[data-tutorial="canvas"]',
    text: "Klikni na plátno",
    padding: 4,
    borderRadius: 0,
  },
  3: {
    selector: '[data-tutorial="commit"]',
    text: "Potvrď zakreslení",
    padding: 6,
    borderRadius: 9999,
  },
};

type Rect = { top: number; left: number; width: number; height: number };

function measureElement(selector: string, padding: number): Rect | null {
  const el = document.querySelector(selector);
  if (!el) {
    return null;
  }
  const r = el.getBoundingClientRect();
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

export function Tutorial({ step, onPrev, onNext, onSkip }: TutorialProps) {
  const config = STEP_CONFIG[step];
  const [rect, setRect] = useState<Rect | null>(() =>
    measureElement(config.selector, config.padding),
  );
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const remeasure = () =>
      setRect(measureElement(config.selector, config.padding));

    // Measure on step change
    remeasure();

    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);

    const el = document.querySelector(config.selector);
    let observer: ResizeObserver | undefined;
    if (el) {
      observer = new ResizeObserver(remeasure);
      observer.observe(el);
    }

    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
      observer?.disconnect();
    };
  }, [config.selector, config.padding]);

  if (!rect) {
    return null;
  }

  const tooltipWidth = 256;
  const tooltipGap = 12;
  const arrowSize = 8;
  const viewportPad = 12;

  // Step 2 (canvas): centered inside the target, no arrow
  // Steps 1 & 3 (footer elements): tooltip above the target with arrow
  const isCanvasStep = step === 2;

  // Horizontal center on target, clamped to viewport
  let tooltipLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
  tooltipLeft = Math.max(
    viewportPad,
    Math.min(tooltipLeft, window.innerWidth - tooltipWidth - viewportPad),
  );

  // Arrow horizontal position relative to tooltip (steps 1 & 3 only)
  const arrowLeft = Math.max(
    16,
    Math.min(
      rect.left + rect.width / 2 - tooltipLeft - arrowSize / 2,
      tooltipWidth - 24,
    ),
  );

  return (
    <>
      {/* Full-screen clickable backdrop — click anywhere to advance/skip */}
      <div
        className="fixed inset-0 z-[39]"
        onClick={step < 3 ? onNext : onSkip}
      />

      {/* Spotlight overlay — skip for canvas step (too large) */}
      {!isCanvasStep && (
        <div
          ref={spotlightRef}
          className="pointer-events-none fixed z-40 transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: config.borderRadius,
            animation: "tutorial-pulse 2s ease-in-out infinite",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-50 w-64 rounded-xl border bg-card p-4 shadow-lg"
        style={
          isCanvasStep
            ? {
                top: rect.top + rect.height / 2 - 40,
                left: tooltipLeft,
              }
            : {
                bottom: window.innerHeight - rect.top + tooltipGap,
                left: tooltipLeft,
              }
        }
      >
        {/* Arrow (only for footer-targeted steps) */}
        {!isCanvasStep && (
          <div
            className="absolute h-3 w-3 border-b border-r bg-card"
            style={{
              bottom: -arrowSize + 2,
              left: arrowLeft,
              transform: "rotate(45deg)",
              borderColor: "inherit",
            }}
          />
        )}

        <p className="text-sm font-medium">{config.text}</p>

        <div className="mt-3 flex items-center justify-between">
          {/* Prev */}
          {step > 1 ? (
            <button
              type="button"
              onClick={onPrev}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              ← Zpět
            </button>
          ) : (
            <span />
          )}

          {/* Step dots */}
          <div className="flex gap-1.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-1.5 w-1.5 rounded-full ${
                  s === step ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          {/* Next / Skip */}
          {step < 3 ? (
            <button
              type="button"
              onClick={onNext}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              Další →
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              Přeskočit
            </button>
          )}
        </div>
      </div>
    </>
  );
}
