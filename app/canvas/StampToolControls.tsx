"use client";

import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useStampTool } from "./useStampTool";

type StampToolApi = ReturnType<typeof useStampTool>;

type StampToolControlsProps = {
  stamp: StampToolApi;
  enforceColors?: boolean;
  colors?: string[];
};

export function StampToolControls({ stamp, enforceColors, colors }: StampToolControlsProps) {
  const {
    stampReady,
    stampError,
    stampName,
    stampSize,
    setStampSize,
    stampPixels,
    minStampSize,
    maxStampSize,
    fileInputRef,
    handleFileChange,
    openFileDialog,
    remapToColors,
  } = stamp;

  const stampDisabled = !stampReady || !!stampError;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
          {stampSize}×{stampSize}
        </span>
        <input
          type="range"
          min={minStampSize}
          max={maxStampSize}
          step={1}
          value={stampSize}
          onChange={(e) => setStampSize(Number(e.target.value))}
          onWheel={(e) => e.currentTarget.blur()}
          className="w-20 accent-primary"
          title={
            stampDisabled
              ? stampError ?? "Razítko se načítá"
              : `${stampName} · ${stampSize}×${stampSize}`
          }
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button size="sm" variant="ghost" onClick={openFileDialog}>
        Nahrát
      </Button>
      {enforceColors && colors && colors.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => remapToColors(colors)}
          disabled={stampDisabled || stampPixels.length === 0}
          className="gap-1"
          title="Převést barvy razítka na povolenou paletu"
        >
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">Paleta</span>
        </Button>
      )}
    </>
  );
}
