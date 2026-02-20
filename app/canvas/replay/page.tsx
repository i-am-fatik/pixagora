"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Canvas } from "../Canvas";
import { ReplayControls, type Speed } from "./ReplayControls";

const CONVEX_ID_RE = /^[a-z0-9][a-z0-9_|]+$/;

const LOGO_SQUARES = ["var(--logo-primary)", "#7F7F7F", "#FFD400", "#F7931A"];

function Logo() {
  return (
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
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        href="/canvas"
        className="text-sm font-medium text-primary hover:underline"
      >
        Zpět na plátno
      </Link>
    </div>
  );
}

export default function ReplayPage() {
  const searchParams = useSearchParams();
  const canvasIdParam = searchParams.get("canvasId");

  const canvasId =
    canvasIdParam && CONVEX_ID_RE.test(canvasIdParam)
      ? (canvasIdParam as Id<"canvases">)
      : null;

  const canvas = useQuery(
    api.canvases.getById,
    canvasId ? { id: canvasId } : "skip",
  );
  const rawTransactions = useQuery(
    api.history.getTransactions,
    canvasId ? { canvasId } : "skip",
  );

  const sortedTransactions = useMemo(() => {
    if (!rawTransactions) {
      return null;
    }
    return [...rawTransactions].reverse();
  }, [rawTransactions]);

  const totalSteps = sortedTransactions?.length ?? 0;

  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);

  type Pixel = { x: number; y: number; color: string };
  const pixelMapRef = useRef(new Map<string, Pixel>());
  const appliedUpToRef = useRef(0);

  useEffect(() => {
    setStepIndex(0);
    setIsPlaying(false);
    pixelMapRef.current.clear();
    appliedUpToRef.current = 0;
  }, [canvasId]);

  useEffect(() => {
    if (isPlaying && stepIndex >= totalSteps && totalSteps > 0) {
      setIsPlaying(false);
    }
  }, [stepIndex, totalSteps, isPlaying]);

  useEffect(() => {
    if (!isPlaying || totalSteps === 0) {
      return;
    }
    const interval = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, totalSteps));
    }, 500 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, speed, totalSteps]);

  const displayPixels = useMemo(() => {
    if (!sortedTransactions) {
      return [];
    }
    const target = Math.min(stepIndex, sortedTransactions.length);
    const map = pixelMapRef.current;
    const applied = appliedUpToRef.current;

    if (target === 0) {
      map.clear();
      appliedUpToRef.current = 0;
      return [];
    }

    if (target < applied) {
      map.clear();
      for (let i = 0; i < target; i++) {
        for (const c of sortedTransactions[i].changes) {
          map.set(`${c.x},${c.y}`, { x: c.x, y: c.y, color: c.color });
        }
      }
    } else {
      for (let i = applied; i < target; i++) {
        for (const c of sortedTransactions[i].changes) {
          map.set(`${c.x},${c.y}`, { x: c.x, y: c.y, color: c.color });
        }
      }
    }

    appliedUpToRef.current = target;
    return Array.from(map.values());
  }, [sortedTransactions, stepIndex]);

  if (!canvasIdParam || !canvasId) {
    return (
      <ErrorScreen
        message={
          canvasIdParam ? "Neplatné ID plátna." : "Žádné plátno vybráno."
        }
      />
    );
  }

  if (canvas === null) {
    return <ErrorScreen message="Plátno nenalezeno." />;
  }

  const gridWidth = canvas?.width ?? 20;
  const gridHeight = canvas?.height ?? 20;
  const noop = () => {};

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Logo />
          <div className="flex flex-1 items-center justify-center">
            {canvas && (
              <span className="text-sm font-medium text-muted-foreground">
                {canvas.name} — Přehrávání
              </span>
            )}
          </div>
          <div className="ml-auto">
            <Link
              href="/canvas"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Zpět
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full w-full items-center justify-center p-6 box-border overflow-hidden">
          {canvas === undefined ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : (
            <Canvas
              pixels={displayPixels}
              width={gridWidth}
              height={gridHeight}
              selectedColor="transparent"
              onPixelClick={noop}
            />
          )}
        </div>
      </main>

      <ReplayControls
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        isPlaying={isPlaying}
        speed={speed}
        onPlayPause={() => {
          if (isPlaying) {
            setIsPlaying(false);
          } else {
            if (stepIndex >= totalSteps) {
              setStepIndex(0);
            }
            setIsPlaying(true);
          }
        }}
        onStepBack={() => {
          setIsPlaying(false);
          setStepIndex((prev) => Math.max(0, prev - 1));
        }}
        onStepForward={() => {
          setIsPlaying(false);
          setStepIndex((prev) => Math.min(totalSteps, prev + 1));
        }}
        onSeek={(index) => {
          setIsPlaying(false);
          setStepIndex(index);
        }}
        onSpeedChange={setSpeed}
      />

      {totalSteps === 0 && rawTransactions !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full border bg-background/90 px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm">
            Zatím žádné transakce
          </span>
        </div>
      )}
    </div>
  );
}
