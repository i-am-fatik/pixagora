"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Canvas } from "../Canvas";
import { ReplayControls, type Speed } from "./ReplayControls";

const CONVEX_ID_RE = /^[a-z0-9][a-z0-9_|]+$/;
const EMPTY_REPLAY_PENDING: Record<string, string> = {};

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
      <span className="text-base font-semibold tracking-tight">PixAgora</span>
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

function ReplayPageInner() {
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
  const [pixelOffset, setPixelOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(10);
  const [prevCanvasId, setPrevCanvasId] = useState(canvasId);
  const accumulatorRef = useRef(0);
  const rafHandleRef = useRef(0);
  const stepIndexRef = useRef(0);
  const pixelOffsetRef = useRef(0);
  useEffect(() => { stepIndexRef.current = stepIndex; });
  useEffect(() => { pixelOffsetRef.current = pixelOffset; });



  if (canvasId !== prevCanvasId) {
    setPrevCanvasId(canvasId);
    setStepIndex(0);
    setPixelOffset(0);
    setIsPlaying(false);
  }

  useEffect(() => {
    if (!isPlaying || !sortedTransactions) {
      return;
    }

    accumulatorRef.current = 0;
    let lastTimestamp: number | null = null;
    let cancelled = false;

    function tick(timestamp: number) {
      if (cancelled) {return;}

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        rafHandleRef.current = requestAnimationFrame(tick);
        return;
      }

      const deltaMs = Math.min(timestamp - lastTimestamp, 100);
      lastTimestamp = timestamp;

      accumulatorRef.current += speed * (deltaMs / 1000);
      const pixelsToAdvance = Math.floor(accumulatorRef.current);
      accumulatorRef.current -= pixelsToAdvance;

      if (pixelsToAdvance <= 0) {
        rafHandleRef.current = requestAnimationFrame(tick);
        return;
      }

      let curStep = stepIndexRef.current;
      let curOffset = pixelOffsetRef.current;
      let remaining = pixelsToAdvance;
      let finished = false;

      while (remaining > 0) {
        if (curStep >= sortedTransactions!.length) {
          finished = true;
          break;
        }
        const txLen = sortedTransactions![curStep].changes.length;
        const canAdvance = txLen - curOffset;
        if (canAdvance <= 0) {
          curStep += 1;
          curOffset = 0;
          continue;
        }
        if (remaining >= canAdvance) {
          remaining -= canAdvance;
          curStep += 1;
          curOffset = 0;
        } else {
          curOffset += remaining;
          remaining = 0;
        }
      }

      setStepIndex(curStep);
      setPixelOffset(curOffset);

      if (finished) {
        setIsPlaying(false);
        return;
      }

      rafHandleRef.current = requestAnimationFrame(tick);
    }

    rafHandleRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandleRef.current);
    };
  }, [isPlaying, speed, sortedTransactions]);

  const displayPixelMap = useMemo(() => {
    if (!sortedTransactions) {
      return new Map<string, string>();
    }
    const map = new Map<string, string>();

    // All completed transactions
    for (let i = 0; i < stepIndex && i < sortedTransactions.length; i++) {
      for (const c of sortedTransactions[i].changes) {
        map.set(`${c.x},${c.y}`, c.color);
      }
    }

    // Partially visible current transaction
    if (stepIndex < sortedTransactions.length && pixelOffset > 0) {
      const tx = sortedTransactions[stepIndex];
      const count = Math.min(pixelOffset, tx.changes.length);
      for (let j = 0; j < count; j++) {
        const c = tx.changes[j];
        map.set(`${c.x},${c.y}`, c.color);
      }
    }

    return map;
  }, [sortedTransactions, stepIndex, pixelOffset]);

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
                {canvas.name}
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
              basePixelMap={displayPixelMap}
              pendingPixels={EMPTY_REPLAY_PENDING}
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
              setPixelOffset(0);
            }
            setIsPlaying(true);
          }
        }}
        onStepBack={() => {
          setIsPlaying(false);
          setPixelOffset(0);
          setStepIndex((prev) => Math.max(0, prev - 1));
        }}
        onStepForward={() => {
          setIsPlaying(false);
          setPixelOffset(0);
          setStepIndex((prev) => Math.min(totalSteps, prev + 1));
        }}
        onSeek={(index) => {
          setIsPlaying(false);
          setPixelOffset(0);
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

export default function ReplayPage() {
  return (
    <Suspense>
      <ReplayPageInner />
    </Suspense>
  );
}
