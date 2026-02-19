"use client";

import { type CSSProperties } from "react";
import { PaintBucket, Pipette } from "lucide-react";

type ColorPickerProps = {
  colors: string[];
  selectedColor: string;
  onSelectColor: (color: string) => void;
};

export function ColorPicker({
  colors,
  selectedColor,
  onSelectColor,
}: ColorPickerProps) {
  const colorStripWidth = Math.max(
    0,
    colors.length * 36 + Math.max(colors.length - 1, 0) * 8,
  );
  const colorStripStyle = {
    "--color-strip-width": `${colorStripWidth}px`,
  } as CSSProperties;

  const handleEyeDropper = async () => {
    if (typeof window === "undefined") return;
    const EyeDropperCtor = (window as unknown as { EyeDropper?: any }).EyeDropper;
    if (!EyeDropperCtor) return;
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
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 pl-1 pr-1 scroll-smooth snap-x snap-mandatory scroll-pl-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-none sm:gap-2 sm:max-w-[var(--color-strip-width)] sm:w-[var(--color-strip-width)] sm:overflow-x-visible sm:snap-none sm:pl-0 sm:pr-0"
        style={colorStripStyle}
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
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden h-5 w-px bg-muted-foreground/30 sm:inline-block" />
        <button
          type="button"
          onClick={handleEyeDropper}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground sm:h-9 sm:w-9"
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
    </div>
  );
}
