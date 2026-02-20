"use client";

import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";

export type Speed = 1 | 2 | 4;

type ReplayControlsProps = {
  stepIndex: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: Speed;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: Speed) => void;
};

const SPEEDS: Speed[] = [1, 2, 4];

export function ReplayControls({
  stepIndex,
  totalSteps,
  isPlaying,
  speed,
  onPlayPause,
  onStepBack,
  onStepForward,
  onSeek,
  onSpeedChange,
}: ReplayControlsProps) {
  return (
    <footer className="shrink-0 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="min-w-[4.5rem] text-xs font-medium text-muted-foreground tabular-nums">
            {stepIndex} / {totalSteps}
          </span>
          <input
            type="range"
            min={0}
            max={totalSteps}
            value={stepIndex}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onStepBack}
            disabled={stepIndex <= 0}
            aria-label="Krok zpět"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onPlayPause}
            disabled={totalSteps === 0}
            aria-label={isPlaying ? "Pozastavit" : "Přehrát"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px]" />
            )}
          </button>

          <button
            type="button"
            onClick={onStepForward}
            disabled={stepIndex >= totalSteps}
            aria-label="Krok vpřed"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="ml-4 flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeedChange(s)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                  speed === s
                    ? "bg-primary text-primary-foreground"
                    : "border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
