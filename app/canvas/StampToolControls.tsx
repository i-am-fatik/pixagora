"use client";

import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useStampTool } from "./useStampTool";

type StampToolApi = ReturnType<typeof useStampTool>;

type StampToolControlsProps = {
  stamp: StampToolApi;
};

export function StampToolControls({ stamp }: StampToolControlsProps) {
  const {
    tool,
    setTool,
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
  const stampEnabled = tool === "stamp";

  return (
    <div className="hidden sm:flex items-center gap-2">
      <div className="relative group">
        <Button
          size="sm"
          variant={stampEnabled ? "default" : "secondary"}
          onClick={() => setTool(stampEnabled ? "paint" : "stamp")}
          disabled={stampDisabled}
          className="gap-1"
          title={
            stampDisabled
              ? stampError ?? "Razítko se načítá"
              : `${stampName} · ${stampSize}×${stampSize}`
          }
        >
          <Stamp className="h-4 w-4" />
          <span className="hidden sm:inline">Razítko</span>
        </Button>
        <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden opacity-0 transition before:absolute before:left-0 before:-bottom-2 before:h-2 before:w-full before:content-[''] group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto sm:block">
          <div className="flex w-56 flex-col gap-2 rounded-xl border bg-background/95 p-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                Velikost razítka
              </span>
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {stampSize}×{stampSize}
              </span>
            </div>
            <input
              type="range"
              min={minStampSize}
              max={maxStampSize}
              step={1}
              value={stampSize}
              onChange={(e) => setStampSize(Number(e.target.value))}
              className="w-full accent-primary"
              title={`Velikost razítka: ${stampSize}×${stampSize}`}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={openFileDialog} className="h-7 px-2">
                Nahrát PNG
              </Button>
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
