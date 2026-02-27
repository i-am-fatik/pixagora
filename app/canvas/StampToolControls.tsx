"use client";

import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useStampTool } from "./useStampTool";

type StampToolApi = ReturnType<typeof useStampTool>;

type StampToolControlsProps = {
  stamp: StampToolApi;
};

export function StampToolControls({ stamp }: StampToolControlsProps) {
  const stampDisabled = !stamp.stampReady || !!stamp.stampError;
  const stampEnabled = stamp.tool === "stamp";

  return (
    <>
      <Button
        size="sm"
        variant={stampEnabled ? "default" : "secondary"}
        onClick={() => stamp.setTool(stampEnabled ? "paint" : "stamp")}
        disabled={stampDisabled}
        className="gap-1"
        title={
          stampDisabled
            ? stamp.stampError ?? "Razítko se načítá"
            : `${stamp.stampName} · ${stamp.stampSize}×${stamp.stampSize}`
        }
      >
        <Stamp className="h-4 w-4" />
        <span className="hidden sm:inline">Razítko</span>
      </Button>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
          {stamp.stampSize}×{stamp.stampSize}
        </span>
        <input
          type="range"
          min={stamp.minStampSize}
          max={stamp.maxStampSize}
          step={1}
          value={stamp.stampSize}
          onChange={(e) => stamp.setStampSize(Number(e.target.value))}
          className="w-20 accent-primary"
          title={`Velikost razítka: ${stamp.stampSize}×${stamp.stampSize}`}
        />
      </div>
      <input
        ref={stamp.fileInputRef}
        type="file"
        accept="image/png"
        onChange={stamp.handleFileChange}
        className="hidden"
      />
      <Button size="sm" variant="ghost" onClick={stamp.openFileDialog}>
        Nahrát PNG
      </Button>
    </>
  );
}
