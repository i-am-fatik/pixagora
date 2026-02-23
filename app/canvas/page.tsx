"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Canvas } from "./Canvas";
import { CanvasPageLayout } from "./CanvasPageLayout";
import { CanvasReels, type CanvasReelsHandle } from "./CanvasReels";
import { HowItWorksModal } from "./HowItWorksModal";
import { PixagoraPopup } from "./PixagoraPopup";
import { BtcPayPurchase } from "./BtcPayPurchase";
import { ChatWidget } from "./ChatWidget";
import { LeaderboardWidget } from "./LeaderboardWidget";
import { PixelPreview } from "./PixelPreview";
import { Tutorial } from "./Tutorial";
import { nextPixelPrice } from "../../convex/pricing";
import { Button } from "@/components/ui/button";

type PendingChange = {
  key?: string;
  prevPending?: string;
  nextPending?: string;
  prevState?: Record<string, string>;
  nextState?: Record<string, string>;
};

type PendingState = {
  pending: Record<string, string>;
  history: PendingChange[];
  redo: PendingChange[];
};

type PendingAction =
  | { type: "apply"; key: string; nextPending?: string }
  | { type: "replace"; nextPending: Record<string, string> }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" }
  | { type: "load"; state: PendingState };

const initialPendingState: PendingState = {
  pending: {},
  history: [],
  redo: [],
};

function pendingReducer(
  state: PendingState,
  action: PendingAction,
): PendingState {
  switch (action.type) {
    case "apply": {
      const prevPending = state.pending[action.key];
      if (prevPending === action.nextPending) {
        return state;
      }
      const nextPendingMap = { ...state.pending };
      if (action.nextPending === undefined) {
        delete nextPendingMap[action.key];
      } else {
        nextPendingMap[action.key] = action.nextPending;
      }
      return {
        pending: nextPendingMap,
        history: [
          ...state.history,
          { key: action.key, prevPending, nextPending: action.nextPending },
        ],
        redo: [],
      };
    }
    case "replace": {
      const prevState = { ...state.pending };
      return {
        pending: { ...action.nextPending },
        history: [
          ...state.history,
          { prevState, nextState: { ...action.nextPending } },
        ],
        redo: [],
      };
    }
    case "undo": {
      const last = state.history[state.history.length - 1];
      if (!last) {
        return state;
      }
      if (last.prevState && last.nextState) {
        return {
          pending: { ...last.prevState },
          history: state.history.slice(0, -1),
          redo: [...state.redo, last],
        };
      }
      const nextPendingMap = { ...state.pending };
      if (last.key) {
        if (last.prevPending === undefined) {
          delete nextPendingMap[last.key];
        } else {
          nextPendingMap[last.key] = last.prevPending;
        }
      }
      return {
        pending: nextPendingMap,
        history: state.history.slice(0, -1),
        redo: [...state.redo, last],
      };
    }
    case "redo": {
      const last = state.redo[state.redo.length - 1];
      if (!last) {
        return state;
      }
      if (last.prevState && last.nextState) {
        return {
          pending: { ...last.nextState },
          history: [...state.history, last],
          redo: state.redo.slice(0, -1),
        };
      }
      const nextPendingMap = { ...state.pending };
      if (last.key) {
        if (last.nextPending === undefined) {
          delete nextPendingMap[last.key];
        } else {
          nextPendingMap[last.key] = last.nextPending;
        }
      }
      return {
        pending: nextPendingMap,
        history: [...state.history, last],
        redo: state.redo.slice(0, -1),
      };
    }
    case "reset": {
      return initialPendingState;
    }
    case "load": {
      return action.state;
    }
    default:
      return state;
  }
}

export default function CanvasPage() {
  const [token, setToken] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [popupMode, setPopupMode] = useState<"anonymous" | "buy-credits">(
    "anonymous",
  );
  const [selectedColor, setSelectedColorRaw] = useState("#000000");
  const [btcPayPurchaseOpen, setBtcPayPurchaseOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<1 | 2 | 3 | null>(null);
  const step2BaselinePendingRef = useRef<number>(0);
  const pendingCountRef = useRef<number>(0);
  const setSelectedColor = useCallback((color: string) => {
    setSelectedColorRaw(color);
    localStorage.setItem("pixagora-color", color);
    setTutorialStep((prev) => {
      if (prev === 1) {
        step2BaselinePendingRef.current = pendingCountRef.current;
        return 2;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("pixagora-color");
    if (saved) {
      setSelectedColorRaw(saved);
    }
  }, []);
  const [isCommitting, setIsCommitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [initialCost, setInitialCost] = useState(0);
  const [initialPendingCount, setInitialPendingCount] = useState(0);
  const [moveDraft, setMoveDraft] = useState<{
    pixels: { x: number; y: number; color: string }[];
  } | null>(null);
  const [pendingPriceBaseline, setPendingPriceBaseline] = useState<
    Record<string, number | null>
  >({});
  const [moveHintDismissed, setMoveHintDismissed] = useState(false);
  const [pendingState, dispatch] = useReducer(
    pendingReducer,
    initialPendingState,
  );
  const reelsRef = useRef<CanvasReelsHandle | null>(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const canvasIdRef = useRef<string | undefined>(undefined);
  const skipSaveRef = useRef(true);

  const user = useQuery(api.users.getByToken, loggedIn ? { token } : "skip");
  const canvases = useQuery(api.canvases.getAll);

  const activeCanvas = canvases?.[activeReelIndex];
  const canvasId = activeCanvas?._id;

  const pixels = useQuery(
    api.pixels.getByCanvas,
    canvasId ? { canvasId } : "skip",
  );

  const commitPixels = useMutation(api.pixels.commit);

  const colors = useMemo(
    () => activeCanvas?.colors ?? ["#000000"],
    [activeCanvas?.colors],
  );
  const enforceColors = activeCanvas?.enforceColors ?? false;
  const gridWidth = activeCanvas?.width ?? 20;
  const gridHeight = activeCanvas?.height ?? 20;
  const pixelPrice = activeCanvas?.pixelPrice ?? 1;
  const totalCanvases = canvases?.length ?? 0;

  useEffect(() => {
    if (!canvasId || canvasId === canvasIdRef.current) {
      return;
    }
    canvasIdRef.current = canvasId;
    skipSaveRef.current = true;
    setMoveDraft(null);
    try {
      const raw = localStorage.getItem(`pixagora-pending-${canvasId}`);
      if (raw) {
        const saved = JSON.parse(raw) as PendingState;
        if (
          saved &&
          typeof saved.pending === "object" &&
          Array.isArray(saved.history) &&
          Array.isArray(saved.redo)
        ) {
          dispatch({ type: "load", state: saved });
          return;
        }
      }
    } catch {}
    dispatch({ type: "reset" });
  }, [canvasId]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const id = canvasIdRef.current;
    if (!id) {
      return;
    }
    try {
      if (
        Object.keys(pendingState.pending).length === 0 &&
        pendingState.history.length === 0
      ) {
        localStorage.removeItem(`pixagora-pending-${id}`);
      } else {
        localStorage.setItem(
          `pixagora-pending-${id}`,
          JSON.stringify(pendingState),
        );
      }
    } catch {}
  }, [pendingState]);

  const selectedColorRef = useRef(selectedColor);
  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    if (
      enforceColors &&
      colors.length > 0 &&
      !colors.includes(selectedColorRef.current)
    ) {
      setSelectedColorRaw(colors[0]);
      localStorage.setItem("pixagora-color", colors[0]);
    }
  }, [colors, enforceColors]);

  const applyLogin = useCallback((nextToken: string) => {
    const trimmed = nextToken.trim();
    if (!trimmed) {
      return;
    }
    localStorage.setItem("pixagora-token", trimmed);
    setToken(trimmed);
    setLoggedIn(true);
    setPopupOpen(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("pixagora-token");
    if (saved) {
      applyLogin(saved);
    }
  }, [applyLogin]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string }>).detail;
      if (detail?.token) {
        applyLogin(detail.token);
      }
    };
    window.addEventListener("pixagora-login", handler);
    return () => {
      window.removeEventListener("pixagora-login", handler);
    };
  }, [applyLogin]);

  const handleLogout = () => {
    localStorage.removeItem("pixagora-token");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("pixagora-pending-")) {
        localStorage.removeItem(key);
      }
    }
    canvasIdRef.current = undefined;
    setToken("");
    setLoggedIn(false);
    dispatch({ type: "reset" });
    setMoveDraft(null);
  };

  const showInvalidToken = loggedIn && user === null;
  const isAuthenticated = loggedIn && !!user;
  const isLoadingUser = loggedIn && user === undefined;

  useEffect(() => {
    if (canvases !== undefined && !localStorage.getItem("pixagora-tutorial-done")) {
      setTutorialStep(1);
    }
  }, [canvases]);

  const handleTutorialPrev = useCallback(() => {
    setTutorialStep((prev) => {
      if (prev === 3) {
        step2BaselinePendingRef.current = pendingCountRef.current;
        return 2;
      }
      return prev === 2 ? 1 : prev;
    });
  }, []);

  const handleTutorialNext = useCallback(() => {
    setTutorialStep((prev) => {
      if (prev === 1) {
        step2BaselinePendingRef.current = pendingCountRef.current;
        return 2;
      }
      return prev === 2 ? 3 : prev;
    });
  }, []);

  const handleTutorialSkip = useCallback(() => {
    setTutorialStep(null);
    localStorage.setItem("pixagora-tutorial-done", "1");
  }, []);

  useEffect(() => {
    if (showInvalidToken) {
      localStorage.removeItem("pixagora-token");
      setToken("");
      setLoggedIn(false);
      dispatch({ type: "reset" });
      setMoveDraft(null);
      setPopupMode("anonymous");
      setPopupOpen(true);
    }
  }, [showInvalidToken]);

  const handleOpenAnonymousPopup = () => {
    setConfirmOpen(false);
    setPopupMode("anonymous");
    setPopupOpen(true);
  };

  const handleOpenBuyCredits = () => {
    setConfirmOpen(false);
    setPopupMode("buy-credits");
    setPopupOpen(true);
  };

  const handleOpenClearConfirm = () => setClearConfirmOpen(true);
  const handleCancelClear = () => setClearConfirmOpen(false);
  const handleConfirmClear = () => {
    dispatch({ type: "reset" });
    setMoveDraft(null);
    setClearConfirmOpen(false);
  };

  const serverPixelMap = useMemo(() => {
    const map = new Map<string, { color: string; price: number }>();
    (pixels ?? []).forEach((pixel) => {
      map.set(`${pixel.x},${pixel.y}`, {
        color: pixel.color,
        price: pixel.price,
      });
    });
    return map;
  }, [pixels]);

  const pendingForRender = moveDraft ? {} : pendingState.pending;

  const combinedPixelMap = useMemo(() => {
    const map = new Map<string, string>();
    serverPixelMap.forEach((val, key) => {
      map.set(key, val.color);
    });
    Object.entries(pendingForRender).forEach(([key, color]) => {
      map.set(key, color);
    });
    return map;
  }, [serverPixelMap, pendingForRender]);

  const activeCanvasPixels = useMemo(() => {
    const result: { x: number; y: number; color: string }[] = [];
    combinedPixelMap.forEach((color, key) => {
      const [xRaw, yRaw] = key.split(",");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        result.push({ x, y, color });
      }
    });
    return result;
  }, [combinedPixelMap]);

  const effectivePending = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, color] of Object.entries(pendingState.pending)) {
      const serverColor = (
        serverPixelMap.get(key)?.color ?? "#ffffff"
      ).toLowerCase();
      if (serverColor !== color.toLowerCase()) {
        result[key] = color;
      }
    }
    return result;
  }, [pendingState.pending, serverPixelMap]);

  useEffect(() => {
    setPendingPriceBaseline((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(effectivePending)) {
        if (next[key] === undefined) {
          next[key] = serverPixelMap.get(key)?.price ?? null;
          changed = true;
        }
      }
      for (const key of Object.keys(next)) {
        if (!effectivePending[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [effectivePending, serverPixelMap]);

  const pendingCount = Object.keys(effectivePending).length;
  pendingCountRef.current = pendingCount;

  useEffect(() => {
    if (tutorialStep === 2 && pendingCount > step2BaselinePendingRef.current) {
      setTutorialStep(3);
    }
  }, [tutorialStep, pendingCount]);

  const totalCost = useMemo(() => {
    let cost = 0;
    for (const key of Object.keys(effectivePending)) {
      const existing = serverPixelMap.get(key);
      cost += nextPixelPrice(pixelPrice, existing?.price);
    }
    return cost;
  }, [effectivePending, serverPixelMap, pixelPrice]);

  const priceIncreaseDetected = useMemo(() => {
    return Object.keys(effectivePending).some((key) => {
      const baselinePrice = pendingPriceBaseline[key];
      if (baselinePrice === undefined) {
        return false;
      }
      const baselineCost = nextPixelPrice(pixelPrice, baselinePrice ?? undefined);
      const currentCost = nextPixelPrice(
        pixelPrice,
        serverPixelMap.get(key)?.price,
      );
      return currentCost > baselineCost;
    });
  }, [effectivePending, pendingPriceBaseline, pixelPrice, serverPixelMap]);

  useEffect(() => {
    if (!priceIncreaseDetected) {
      setMoveHintDismissed(false);
    }
  }, [priceIncreaseDetected]);

  const confirmPreviewPixels = useMemo(() => {
    return Object.entries(effectivePending).map(([key, color]) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, color };
    });
  }, [effectivePending]);

  const priceChanged = confirmOpen && totalCost !== initialCost;
  const pixelsStolen = confirmOpen && pendingCount < initialPendingCount;

  const highlightedPixelSet = useMemo(
    () => (confirmOpen ? new Set(Object.keys(effectivePending)) : undefined),
    [confirmOpen, effectivePending],
  );

  const canUndo = pendingState.history.length > 0 || pendingCount > 0;
  const canRedo = pendingState.redo.length > 0;
  const canClear = pendingCount > 0;

  const handleUndo = () => {
    if (pendingState.history.length > 0) {
      dispatch({ type: "undo" });
    } else if (pendingCount > 0) {
      dispatch({ type: "reset" });
    }
  };

  const handleRedo = () => {
    if (pendingState.redo.length > 0) {
      dispatch({ type: "redo" });
    }
  };

  const handleOpenConfirm = () => {
    if (!isAuthenticated) {
      handleOpenAnonymousPopup();
      return;
    }
    if (moveDraft) {
      setMoveDraft(null);
    }
    if (tutorialStep === 3) {
      setTutorialStep(null);
      localStorage.setItem("pixagora-tutorial-done", "1");
    }
    setPopupOpen(false);
    setInitialCost(totalCost);
    setInitialPendingCount(pendingCount);
    setConfirmOpen(true);
  };

  const handleCancelConfirm = () => {
    setConfirmOpen(false);
  };

  const handleAcceptChanges = () => {
    setInitialCost(totalCost);
    setInitialPendingCount(pendingCount);
  };

  const handleConfirm = async () => {
    const ok = await handleCommit();
    if (ok) {
      setConfirmOpen(false);
    }
  };

  const handlePixelClick = (x: number, y: number) => {
    if (moveDraft) {
      const nextPending: Record<string, string> = {};
      let hasOutOfBounds = false;
      for (const px of moveDraft.pixels) {
        const nx = x + px.x;
        const ny = y + px.y;
        if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
          hasOutOfBounds = true;
          continue;
        }
        nextPending[`${nx},${ny}`] = px.color;
      }
      if (hasOutOfBounds) {
        return;
      }
      dispatch({ type: "replace", nextPending });
      setMoveDraft(null);
      return;
    }
    const key = `${x},${y}`;
    const serverColor = serverPixelMap.get(key)?.color;
    const visibleColor = (
      pendingState.pending[key] ??
      serverColor ??
      "#ffffff"
    ).toLowerCase();

    if (selectedColor.toLowerCase() === visibleColor) {
      dispatch({ type: "apply", key, nextPending: undefined });
    } else {
      const nextPending =
        selectedColor.toLowerCase() === (serverColor ?? "#ffffff").toLowerCase()
          ? undefined
          : selectedColor;
      dispatch({ type: "apply", key, nextPending });
    }
  };

  const handleToggleMove = () => {
    if (moveDraft) {
      setMoveDraft(null);
      return;
    }
    if (pendingCount === 0) {
      return;
    }
    const pixels = Object.entries(effectivePending).map(([key, color]) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, color };
    });
    if (pixels.length === 0) {
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    for (const p of pixels) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
    const relative = pixels.map((p) => ({
      x: p.x - minX,
      y: p.y - minY,
      color: p.color,
    }));
    setMoveDraft({ pixels: relative });
  };

  const handleCommit = async (): Promise<boolean> => {
    if (
      !confirmOpen ||
      !isAuthenticated ||
      pendingCount === 0 ||
      isCommitting ||
      !canvasId
    ) {
      return false;
    }
    setIsCommitting(true);
    try {
      const payload = Object.entries(effectivePending).map(([key, color]) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y, color };
      });
      if (payload.length === 0) {
        return false;
      }
      const result = await commitPixels({
        token,
        canvasId,
        pixels: payload,
        expectedCost: totalCost,
      });
      if (result && "error" in result) {
        if (result.error === "NOT_ENOUGH_CREDITS") {
          setConfirmOpen(false);
          handleOpenBuyCredits();
        } else if (result.error === "PRICE_CHANGED") {
          setInitialCost(totalCost);
          setInitialPendingCount(pendingCount);
          return false;
        }
        return false;
      }
      dispatch({ type: "reset" });
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Commit failed");
      return false;
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReelIndexChange = useCallback((index: number) => {
    setActiveReelIndex(index);
  }, []);

  const handleEdgeSwipe = useCallback(
    (direction: "next" | "prev") => {
      if (totalCanvases <= 1) {
        return;
      }
      if (direction === "next") {
        reelsRef.current?.next();
      } else {
        reelsRef.current?.prev();
      }
    },
    [totalCanvases],
  );

  return (
    <>
      <CanvasPageLayout
        isLoggedIn={loggedIn}
        credits={user?.credits}
        onSignIn={handleOpenAnonymousPopup}
        onSignOut={handleLogout}
        onBuyCredits={handleOpenBuyCredits}
        signInDisabled={false}
        colors={colors}
        enforceColors={enforceColors}
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
        changedCount={pendingCount}
        totalCost={totalCost}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCommit={handleOpenConfirm}
        canUndo={canUndo}
        canRedo={canRedo}
        canCommit={pendingCount > 0 && !!canvasId && !moveDraft}
        isCommitting={isCommitting}
        onClearPending={handleOpenClearConfirm}
        canClear={canClear}
        onMove={handleToggleMove}
        canMove={pendingCount > 0}
        moveActive={!!moveDraft}
        showMoveHint={priceIncreaseDetected && !moveHintDismissed}
        onDismissMoveHint={() => setMoveHintDismissed(true)}
        showFooter={true}
        onHowItWorks={() => setHowItWorksOpen(true)}
        replayCanvasId={canvasId}
      >
        {totalCanvases === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-sm text-muted-foreground">
              {canvases === undefined
                ? "Načítám plátna…"
                : "Žádná plátna k zobrazení."}
            </div>
          </div>
        ) : (
          <CanvasReels
            ref={reelsRef}
            count={totalCanvases}
            enableTouchSwipe={false}
            onIndexChange={handleReelIndexChange}
            renderItem={(index) => (
              <div className="flex h-full w-full items-center justify-center overflow-hidden">
                {isLoadingUser ? (
                  <div className="text-sm text-muted-foreground">
                    Načítám uživatele…
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center overflow-hidden">
                    <Canvas
                      pixels={
                        index === activeReelIndex ? activeCanvasPixels : []
                      }
                      width={canvases?.[index]?.width ?? gridWidth}
                      height={canvases?.[index]?.height ?? gridHeight}
                      selectedColor={selectedColor}
                      onPixelClick={(x, y) => {
                        if (index === activeReelIndex) {
                          handlePixelClick(x, y);
                        }
                      }}
                      movePreviewPixels={
                        index === activeReelIndex ? moveDraft?.pixels ?? null : null
                      }
                      movePreviewActive={index === activeReelIndex && !!moveDraft}
                      onEdgeSwipe={
                        index === activeReelIndex ? handleEdgeSwipe : undefined
                      }
                      highlightedPixels={
                        index === activeReelIndex
                          ? highlightedPixelSet
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            )}
          />
        )}
      </CanvasPageLayout>

      {tutorialStep !== null && (
        <Tutorial
          step={tutorialStep}
          onPrev={handleTutorialPrev}
          onNext={handleTutorialNext}
          onSkip={handleTutorialSkip}
        />
      )}

      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
        onOpenBtcPay={() => {
          setHowItWorksOpen(false);
          setBtcPayPurchaseOpen(true);
        }}
      />

      <ChatWidget
        isLoggedIn={isAuthenticated}
        token={token}
        onRequestAuth={handleOpenAnonymousPopup}
      />
      <LeaderboardWidget viewerId={user?._id} />

      <PixagoraPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        mode={popupMode}
        onOpenBtcPay={() => {
          setPopupOpen(false);
          setBtcPayPurchaseOpen(true);
        }}
      />

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
          >
            {confirmPreviewPixels.length > 0 && (
              <div className="flex justify-center">
                <PixelPreview pixels={confirmPreviewPixels} maxSize={160} />
              </div>
            )}
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Potvrdit nákup</h2>
              <p className="text-sm text-muted-foreground">
                Chystáš se zakoupit{" "}
                <strong className="text-foreground">{pendingCount}</strong>{" "}
                {pendingCount === 1
                  ? "pixel"
                  : pendingCount < 5
                    ? "pixely"
                    : "pixelů"}{" "}
                za <strong className="text-foreground">{totalCost}</strong>{" "}
                kreditů.
              </p>
            </div>
            {priceChanged && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                <p className="font-medium">Cena se změnila!</p>
                <p className="mt-0.5 text-xs">
                  Někdo jiný mezitím zakoupil pixel, který chceš přepsat.
                  Přepsání stojí víc. Celková cena se změnila z{" "}
                  <strong>{initialCost}</strong> na <strong>{totalCost}</strong>{" "}
                  kreditů.
                </p>
              </div>
            )}
            {pixelsStolen && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                <p className="font-medium">Pixely se změnily!</p>
                <p className="mt-0.5 text-xs">
                  Někdo jiný mezitím změnil některé pixely, které jsi chtěl
                  přepsat. Zkontroluj své změny na plátně.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              {priceChanged || pixelsStolen ? (
                <Button onClick={handleAcceptChanges} className="flex-1">
                  Akceptovat změnu
                </Button>
              ) : (
                <Button
                  onClick={handleConfirm}
                  disabled={isCommitting}
                  className="flex-1"
                >
                  {isCommitting ? "Odesílám…" : "Potvrdit"}
                </Button>
              )}
              <Button variant="secondary" onClick={handleCancelConfirm}>
                Zrušit
              </Button>
            </div>
          </div>
        </div>
      )}

      {clearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xs space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Smazat návrh</h2>
              <p className="text-sm text-muted-foreground">
                Opravdu chceš smazat všechny navržené pixely?
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                onClick={handleConfirmClear}
                className="flex-1"
              >
                Smazat
              </Button>
              <Button variant="secondary" onClick={handleCancelClear}>
                Zrušit
              </Button>
            </div>
          </div>
        </div>
      )}

      <BtcPayPurchase
        open={btcPayPurchaseOpen}
        prefillEmail={user?.email}
        onClose={() => setBtcPayPurchaseOpen(false)}
      />
    </>
  );
}
