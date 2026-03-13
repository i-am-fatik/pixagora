"use client";

import { Button } from "@/components/ui/button";
import type { useStampTool } from "./useStampTool";

type StampToolApi = ReturnType<typeof useStampTool>;

type StampToolControlsProps = {
  stamp: StampToolApi;
};

export function StampToolControls({ stamp }: StampToolControlsProps) {
  const {
    stampReady,
    stampError,
    stampName,
    stampSize,
    setStampSize,
    minStampSize,
    maxStampSize,
    fileInputRef,
    handleFileChange,
    openFileDialog,
  } = stamp;

  const stampDisabled = !stampReady || !!stampError;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums w-12 shrink-0 text-right">
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
          className="min-w-20 flex-1 accent-primary"
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
    </>
  );
}
