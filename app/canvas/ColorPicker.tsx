"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PaintBucket, Pipette } from "lucide-react";

const subscribeNoop = () => () => {};
const getEyeDropperSupported = () =>
  typeof window !== "undefined" &&
  "EyeDropper" in (window as unknown as Record<string, unknown>);
const getEyeDropperServer = () => false;

type ColorPickerProps = {
  colors: string[];
  selectedColor: string;
  onSelectColor: (color: string) => void;
  enforceColors?: boolean;
};

export function ColorPicker({
  colors,
  selectedColor,
  onSelectColor,
  enforceColors = false,
}: ColorPickerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const eyeDropperSupported = useSyncExternalStore(
    subscribeNoop,
    getEyeDropperSupported,
    getEyeDropperServer,
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const update = () => {
      const next = node.scrollWidth > node.clientWidth + 1;
      setCanScroll(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [colors]);

  const handleEyeDropper = async () => {
    if (!eyeDropperSupported) {
      return;
    }
    const EyeDropperCtor = (
      window as unknown as {
        EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
      }
    ).EyeDropper;
    if (!EyeDropperCtor) {
      return;
    }
    try {
      const dropper = new EyeDropperCtor();
      const result = await dropper.open();
      if (result?.sRGBHex) {
        onSelectColor(result.sRGBHex);
      }
    } catch {
      // Ignore if user cancels.
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        ref={scrollRef}
        className={`color-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-y-hidden py-1 pl-2 pr-2 scroll-pl-2 sm:flex-1 sm:gap-2 sm:max-w-none ${
          canScroll
            ? "overflow-x-auto scroll-smooth snap-x snap-mandatory"
            : "overflow-x-hidden"
        }`}
      >
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelectColor(color)}
            aria-label={`Vybrat barvu ${color}`}
            className="group relative h-8 w-8 shrink-0 snap-center rounded-full border transition sm:h-9 sm:w-9"
            style={{
              backgroundColor: color,
              borderColor: color === selectedColor ? "#111111" : "#e5e7eb",
              boxShadow:
                color === selectedColor
                  ? "0 0 0 2px rgba(17, 17, 17, 0.35)"
                  : "none",
            }}
          >
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 translate-y-0.5 scale-75 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100">
              <span className="absolute inset-0 rounded-full bg-black/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <span className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <PaintBucket className="relative h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] mix-blend-difference" />
            </span>
          </button>
        ))}
      </div>
      {!enforceColors && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden h-5 w-px bg-muted-foreground/30 sm:inline-block" />
          <button
            type="button"
            onClick={handleEyeDropper}
            disabled={!eyeDropperSupported}
            title={
              eyeDropperSupported
                ? "Eyedropper"
                : "Eyedropper není v tomto prohlížeči dostupný"
            }
            className="hidden h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex sm:h-9 sm:w-9"
            aria-label="Eyedropper"
          >
            <Pipette className="h-4 w-4" />
          </button>
          <label className="relative h-8 w-8 sm:h-9 sm:w-9">
            <span
              className="absolute inset-0 rounded-full border-2"
              style={{
                backgroundColor: selectedColor,
                borderColor: "#111111",
              }}
            />
            <input
              type="color"
              value={selectedColor}
              onChange={(event) => onSelectColor(event.target.value)}
              aria-label="RGB picker"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      )}
    </div>
  );
}
