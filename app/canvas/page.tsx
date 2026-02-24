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
import { Move } from "lucide-react";

const STARTOVAC_URL = "https://www.startovac.cz/projekty/anarchoagorismus/";

type PendingChange = {
  key?: string;
  prevPending?: string;
  nextPending?: string;
  prevState?: Record<string, string>;
  nextState?: Record<string, string>;
};

type HistoryEntry = PendingChange | PendingChange[];

type PendingState = {
  pending: Record<string, string>;
  history: HistoryEntry[];
  redo: HistoryEntry[];
};

type PendingAction =
  | { type: "apply"; key: string; nextPending?: string }
  | { type: "replace"; nextPending: Record<string, string> }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "merge-last"; fromIndex: number }
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
      if (!Array.isArray(last) && last.prevState && last.nextState) {
        return {
          pending: { ...last.prevState },
          history: state.history.slice(0, -1),
          redo: [...state.redo, last],
        };
      }
      const nextPendingMap = { ...state.pending };
      const changes = Array.isArray(last) ? last : [last];
      for (let i = changes.length - 1; i >= 0; i--) {
        const c = changes[i];
        if (c.key) {
          if (c.prevPending === undefined) {
            delete nextPendingMap[c.key];
          } else {
            nextPendingMap[c.key] = c.prevPending;
          }
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
      if (!Array.isArray(last) && last.prevState && last.nextState) {
        return {
          pending: { ...last.nextState },
          history: [...state.history, last],
          redo: state.redo.slice(0, -1),
        };
      }
      const nextPendingMap = { ...state.pending };
      const changes = Array.isArray(last) ? last : [last];
      for (const c of changes) {
        if (c.key) {
          if (c.nextPending === undefined) {
            delete nextPendingMap[c.key];
          } else {
            nextPendingMap[c.key] = c.nextPending;
          }
        }
      }
      return {
        pending: nextPendingMap,
        history: [...state.history, last],
        redo: state.redo.slice(0, -1),
      };
    }
    case "merge-last": {
      const fromIndex = Math.max(0, Math.min(action.fromIndex, state.history.length));
      const toMerge = state.history.slice(fromIndex);
      if (toMerge.length <= 1) {
        return state;
      }
      const merged: PendingChange[] = [];
      for (const entry of toMerge) {
        if (Array.isArray(entry)) {
          merged.push(...entry);
        } else {
          merged.push(entry);
        }
      }
      return {
        ...state,
        history: [...state.history.slice(0, fromIndex), merged],
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
  const [overwriteBlockedOpen, setOverwriteBlockedOpen] = useState(false);
  const [initialCost, setInitialCost] = useState(0);
  const [initialPendingCount, setInitialPendingCount] = useState(0);
  const [moveDraft, setMoveDraft] = useState<{
    pixels: { x: number; y: number; color: string }[];
  } | null>(null);
  const [pendingPriceBaseline, setPendingPriceBaseline] = useState<
    Record<string, number | null>
  >({});
  const [moveHintDismissed, setMoveHintDismissed] = useState(false);
  const [isFreeModePainting, setIsFreeModePainting] = useState(false);
  const [pendingState, dispatch] = useReducer(
    pendingReducer,
    initialPendingState,
  );
  const strokeHistoryStartRef = useRef<number | null>(null);
  const reelsRef = useRef<CanvasReelsHandle | null>(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const canvasIdRef = useRef<string | undefined>(undefined);
  const skipSaveRef = useRef(true);

  const user = useQuery(api.users.getByToken, loggedIn ? { token } : "skip");
  const paymentSummary = useQuery(
    api.users.getPaymentSummary,
    loggedIn ? { token } : "skip",
  );
  const canvases = useQuery(api.canvases.getAll);

  const activeCanvas = canvases?.[activeReelIndex];
  const canvasId = activeCanvas?._id;
  const isCanvasLocked = !!activeCanvas?.locked;

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
    const map = new Map<string, { color: string; price: number; userId: string }>();
    (pixels ?? []).forEach((pixel) => {
      map.set(`${pixel.x},${pixel.y}`, {
        color: pixel.color,
        price: pixel.price,
        userId: pixel.userId,
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

  const hasForeignOverwrite = useMemo(() => {
    if (!isAuthenticated || !user?._id) {
      return false;
    }
    return Object.keys(effectivePending).some((key) => {
      const existing = serverPixelMap.get(key);
      return existing && existing.userId !== user._id;
    });
  }, [effectivePending, isAuthenticated, serverPixelMap, user?._id]);

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
    if (isCanvasLocked) {
      return;
    }
    if (hasForeignOverwrite && !paymentSummary?.canOverwrite) {
      setOverwriteBlockedOpen(true);
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

  const handleFreePaint = (x: number, y: number) => {
    if (moveDraft) {
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
      return;
    }
    const nextPending =
      selectedColor.toLowerCase() === (serverColor ?? "#ffffff").toLowerCase()
        ? undefined
        : selectedColor;
    dispatch({ type: "apply", key, nextPending });
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
        } else if (result.error === "OVERWRITE_LOCKED") {
          setConfirmOpen(false);
          setOverwriteBlockedOpen(true);
        } else if (result.error === "CANVAS_LOCKED") {
          setConfirmOpen(false);
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
        canCommit={pendingCount > 0 && !!canvasId && !moveDraft && !isCanvasLocked}
        commitLocked={isCanvasLocked}
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
        isFreeModePainting={isFreeModePainting}
        onFreeModePaintingChange={setIsFreeModePainting}
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
                      onFreePaint={(x, y) => {
                        if (index === activeReelIndex) {
                          handleFreePaint(x, y);
                        }
                      }}
                      movePreviewPixels={
                        index === activeReelIndex ? moveDraft?.pixels ?? null : null
                      }
                      movePreviewActive={index === activeReelIndex && !!moveDraft}
                      highlightedPixels={
                        index === activeReelIndex
                          ? highlightedPixelSet
                          : undefined
                      }
                      isFreeModePainting={isFreeModePainting}
                      onStrokeStart={() => {
                        strokeHistoryStartRef.current = pendingState.history.length;
                      }}
                      onStrokeEnd={() => {
                        if (strokeHistoryStartRef.current !== null) {
                          dispatch({ type: "merge-last", fromIndex: strokeHistoryStartRef.current });
                          strokeHistoryStartRef.current = null;
                        }
                      }}
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

      {overwriteBlockedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Překreslování je zamčené</h2>
              <p className="text-sm text-muted-foreground">
                Překreslovat cizí pixely můžeš jen pokud jsi dohromady zakoupil
                odměny za alespoň <strong>666 Kč</strong>. Přesuň svoji malbu
                pomocí nástroje přesunout, nebo si dobij kredity pomocí
                tlačítek níže.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setOverwriteBlockedOpen(false);
                handleToggleMove();
              }}
              className="w-full gap-2"
            >
              <Move className="h-4 w-4" />
              Přesunout malbu
            </Button>
            <div className="border-t pt-3">
              <div className="flex flex-col gap-2">
                <a
                  href={STARTOVAC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center justify-between gap-3 rounded-md px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: "#1ebd39" }}
                >
                  <span className="flex-1 text-left">Podpořit na Startovači</span>
                  <span className="flex items-center gap-1.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M2.15 4.318a42.16 42.16 0 0 0-.454.003c-.15.005-.303.013-.452.04a1.44 1.44 0 0 0-1.06.772c-.07.138-.114.278-.14.43-.028.148-.037.3-.04.45A10.2 10.2 0 0 0 0 6.222v11.557c0 .07.002.138.003.207.004.15.013.303.04.452.027.15.072.291.142.429a1.436 1.436 0 0 0 .63.63c.138.07.278.115.43.142.148.027.3.036.45.04l.208.003h20.194l.207-.003c.15-.004.303-.013.452-.04.15-.027.291-.071.428-.141a1.432 1.432 0 0 0 .631-.631c.07-.138.115-.278.141-.43.027-.148.036-.3.04-.45.002-.07.003-.138.003-.208l.001-.246V6.221c0-.07-.002-.138-.004-.207a2.995 2.995 0 0 0-.04-.452 1.446 1.446 0 0 0-1.2-1.201 3.022 3.022 0 0 0-.452-.04 10.448 10.448 0 0 0-.453-.003zm0 .512h19.942c.066 0 .131.002.197.003.115.004.25.01.375.032.109.02.2.05.287.094a.927.927 0 0 1 .407.407.997.997 0 0 1 .094.288c.022.123.028.258.031.374.002.065.003.13.003.197v11.552c0 .065 0 .13-.003.196-.003.115-.009.25-.032.375a.927.927 0 0 1-.5.693 1.002 1.002 0 0 1-.286.094 2.598 2.598 0 0 1-.373.032l-.2.003H1.906c-.066 0-.133-.002-.196-.003a2.61 2.61 0 0 1-.375-.032c-.109-.02-.2-.05-.288-.094a.918.918 0 0 1-.406-.407 1.006 1.006 0 0 1-.094-.288 2.531 2.531 0 0 1-.032-.373 9.588 9.588 0 0 1-.002-.197V6.224c0-.065 0-.131.002-.197.004-.114.01-.248.032-.375.02-.108.05-.199.094-.287a.925.925 0 0 1 .407-.406 1.03 1.03 0 0 1 .287-.094c.125-.022.26-.029.375-.032.065-.002.131-.002.196-.003zm4.71 3.7c-.3.016-.668.199-.88.456-.191.22-.36.58-.316.918.338.03.675-.169.888-.418.205-.258.345-.603.308-.955zm2.207.42v5.493h.852v-1.877h1.18c1.078 0 1.835-.739 1.835-1.812 0-1.07-.742-1.805-1.808-1.805zm.852.719h.982c.739 0 1.161.396 1.161 1.089 0 .692-.422 1.092-1.164 1.092h-.979zm-3.154.3c-.45.01-.83.28-1.05.28-.235 0-.593-.264-.981-.257a1.446 1.446 0 0 0-1.23.747c-.527.908-.139 2.255.374 2.995.249.366.549.769.944.754.373-.014.52-.242.973-.242.454 0 .586.242.98.235.41-.007.667-.366.915-.733.286-.417.403-.82.41-.841-.007-.008-.79-.308-.797-1.209-.008-.754.615-1.113.644-1.135-.352-.52-.9-.578-1.09-.593a1.123 1.123 0 0 0-.092-.002zm8.204.397c-.99 0-1.606.533-1.652 1.256h.777c.072-.358.369-.586.845-.586.502 0 .803.266.803.711v.309l-1.097.064c-.951.054-1.488.484-1.488 1.184 0 .72.548 1.207 1.332 1.207.526 0 1.032-.281 1.264-.727h.019v.659h.788v-2.76c0-.803-.62-1.317-1.591-1.317zm1.94.072l1.446 4.009c0 .003-.073.24-.073.247-.125.41-.33.571-.711.571-.069 0-.206 0-.267-.015v.666c.06.011.267.019.335.019.83 0 1.226-.312 1.568-1.283l1.5-4.214h-.868l-1.012 3.259h-.015l-1.013-3.26zm-1.167 2.189v.316c0 .521-.45.917-1.024.917-.442 0-.731-.228-.731-.579 0-.342.278-.56.769-.593z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
                    </svg>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z" />
                    </svg>
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setOverwriteBlockedOpen(false);
                    setBtcPayPurchaseOpen(true);
                  }}
                  className="flex h-10 items-center justify-between gap-3 rounded-md px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: "#F7931A" }}
                >
                  <span className="flex-1 text-left">Zaplatit Bitcoinem</span>
                  <span className="flex items-center gap-1.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => setOverwriteBlockedOpen(false)}
              className="w-full"
            >
              Zavřít
            </Button>
          </div>
        </div>
      )}

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
