"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
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
import { Coins, Loader2, Move } from "lucide-react";
import { useStampTool } from "./useStampTool";
import { StampToolControls } from "./StampToolControls";
import { useSnapshotLoader, packedToHex } from "./useSnapshotLoader";
import { usePriceMap } from "./usePriceMap";
import type { ActiveTool } from "./toolbar.types";
import { fixConvexUrl } from "./fixConvexUrl";

const STARTOVAC_URL = "https://www.startovac.cz/projekty/anarchoagorismus/";
const EMPTY_PIXEL_MAP = new Map<string, string>();
const EMPTY_PENDING: Record<string, string> = {};
const WHITE_PACKED = 0xffffffff;

/** Convert "#rrggbb" hex to packed 0xFF_RR_GG_BB (case-insensitive). */
function hexToPacked(hex: string): number {
  return 0xff000000 | parseInt(hex.charAt(0) === "#" ? hex.substring(1) : hex, 16);
}

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
  | { type: "applyBatch"; changes: { key: string; nextPending?: string }[] }
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
    case "applyBatch": {
      if (action.changes.length === 0) {
        return state;
      }
      const deduped = new Map<string, string | undefined>();
      for (const change of action.changes) {
        deduped.set(change.key, change.nextPending);
      }
      const nextPendingMap = { ...state.pending };
      const changes: PendingChange[] = [];
      deduped.forEach((nextPending, key) => {
        const prevPending = state.pending[key];
        if (prevPending === nextPending) {
          return;
        }
        if (nextPending === undefined) {
          delete nextPendingMap[key];
        } else {
          nextPendingMap[key] = nextPending;
        }
        changes.push({ key, prevPending, nextPending });
      });
      if (changes.length === 0) {
        return state;
      }
      return {
        pending: nextPendingMap,
        history: [...state.history, changes],
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
  const [, startTransition] = useTransition();
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
  const [minPaymentBlockedOpen, setMinPaymentBlockedOpen] = useState(false);
  const [commitWarning, setCommitWarning] = useState<string | null>(null);
  const [moveDraft, setMoveDraft] = useState<{
    pixels: { x: number; y: number; color: string }[];
  } | null>(null);
  const [pendingPriceBaseline, setPendingPriceBaseline] = useState<
    Record<string, number | null>
  >({});
  const [moveHintDismissed, setMoveHintDismissed] = useState(false);
  const [isFreeModePainting, setIsFreeModePainting] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>("paint");
  const [brushSize, setBrushSize] = useState(1);
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
  const isAdmin = !!user?.isAdmin;
  const isCanvasLocked = !!activeCanvas?.locked && !isAdmin;

  const commitPixels = useMutation(api.pixels.commit);
  const generateUploadUrl = useMutation(api.pixels.generateUploadUrl);
  const commitFromBlob = useAction(api.commitLarge.commitFromBlob);
  const preUploadedBlobRef = useRef<string | null>(null);

  // Smart loading: load snapshot first, then delta/full paginated data in background
  const { snapshotPixelData, snapshotBitmap, snapshotReady, snapshotCreatedAt } =
    useSnapshotLoader(canvasId);

  // PNG-first: display comes entirely from snapshot PNG + optimistic merge.
  // No per-pixel delta/paginated queries — eliminates reactive storms and timeouts.
  // Other users see changes when snapshot regenerates (~3s after commit).
  // Fallback: paginated loading for canvases that have no snapshot yet.
  const hasSnapshot = snapshotReady && (snapshotCreatedAt !== null || snapshotBitmap !== null);

  const {
    results: fullPixels,
    status: fullStatus,
    loadMore: fullLoadMore,
  } = usePaginatedQuery(
    api.pixels.getByCanvasPaginated,
    canvasId && !hasSnapshot ? { canvasId } : "skip",
    { initialNumItems: 1000 },
  );

  useEffect(() => {
    if (!hasSnapshot && fullStatus === "CanLoadMore") {
      fullLoadMore(1000);
    }
  }, [hasSnapshot, fullStatus, fullLoadMore]);

  const colors = useMemo(
    () => activeCanvas?.colors ?? ["#000000"],
    [activeCanvas?.colors],
  );
  const enforceColors = activeCanvas?.enforceColors ?? false;
  const stampTool = useStampTool({
    enforceColors,
    palette: colors,
    onToolActivated: () => setActiveTool("stamp"),
  });
  // Use bitmap dimensions when canvases haven't loaded yet (single-request path)
  const gridWidth = activeCanvas?.width ?? snapshotBitmap?.width ?? 20;
  const gridHeight = activeCanvas?.height ?? snapshotBitmap?.height ?? 20;
  const pixelPrice = activeCanvas?.pixelPrice ?? 1;

  // Reactive price map from DB chunks — deferred until snapshot is ready so the
  // ~500KB WS message doesn't compete with initial PNG decode on slow connections
  const priceMap = usePriceMap(snapshotReady ? canvasId : undefined, gridWidth, gridHeight);
  const totalCanvases = canvases?.length ?? 0;

  // Sync stampTool internal mode with activeTool
  useEffect(() => {
    stampTool.setTool(activeTool === "stamp" ? "stamp" : "paint");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  useEffect(() => {
    if (!canvasId || canvasId === canvasIdRef.current) {
      return;
    }
    // Save current canvas serverPixelMap to cache before switching
    const prevId = canvasIdRef.current;
    if (prevId && serverPixelMapRef.current.size > 0) {
      serverPixelCacheRef.current.set(prevId, {
        map: new Map(serverPixelMapRef.current),
        processed: serverPixelProcessedRef.current,
      });
      // Evict oldest if cache is too large (keep max 6 canvases)
      if (serverPixelCacheRef.current.size > 6) {
        const firstKey = serverPixelCacheRef.current.keys().next().value;
        if (firstKey !== undefined) {serverPixelCacheRef.current.delete(firstKey);}
      }
    }
    canvasIdRef.current = canvasId;
    skipSaveRef.current = true;
    setMoveDraft(null);
    setActiveTool("paint");
    // Restore serverPixelMap from cache or start fresh
    const cached = serverPixelCacheRef.current.get(canvasId);
    if (cached) {
      serverPixelMapRef.current = new Map(cached.map);
      serverPixelProcessedRef.current = cached.processed;
    } else {
      serverPixelMapRef.current = new Map();
      serverPixelProcessedRef.current = 0;
    }
    setServerPixelVer((v) => v + 1);
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
    setActiveTool("paint");
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
      setActiveTool("paint");
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
    setClearConfirmOpen(false);
    setMoveDraft(null);
    setActiveTool("paint");
    startTransition(() => {
      dispatch({ type: "reset" });
    });
  };

  // serverPixelMap: optimistic merge data + fallback paginated data (no-snapshot path)
  // Cached per canvas so switching back is instant.
  const serverPixelMapRef = useRef(new Map<string, { color: string; price: number; userId: string }>());
  const serverPixelProcessedRef = useRef(0);
  const [serverPixelVer, setServerPixelVer] = useState(0);
  const serverPixelCacheRef = useRef(new Map<string, {
    map: Map<string, { color: string; price: number; userId: string }>;
    processed: number;
  }>());

  // When a new snapshot is decoded, clear serverPixelMap (snapshot has all the data)
  const prevSnapshotTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (snapshotCreatedAt !== null && snapshotCreatedAt !== prevSnapshotTimeRef.current) {
      prevSnapshotTimeRef.current = snapshotCreatedAt;
      serverPixelMapRef.current.clear();
      serverPixelProcessedRef.current = 0;
      setServerPixelVer((v) => v + 1);
      // Also clear cached entry for this canvas — snapshot supersedes it
      if (canvasId) {
        serverPixelCacheRef.current.delete(canvasId);
      }
    }
  }, [snapshotCreatedAt, canvasId]);

  // Fallback: incremental processing of paginated results (only for canvases without snapshot)
  useEffect(() => {
    if (hasSnapshot) {return;}
    const map = serverPixelMapRef.current;
    const prev = serverPixelProcessedRef.current;

    if (fullPixels.length < prev) {
      map.clear();
      serverPixelProcessedRef.current = 0;
    }

    const start = serverPixelProcessedRef.current;
    if (fullPixels.length > start) {
      for (let i = start; i < fullPixels.length; i++) {
        const pixel = fullPixels[i];
        map.set(`${pixel.x},${pixel.y}`, {
          color: pixel.color,
          price: pixel.price,
          userId: pixel.userId,
        });
      }
      serverPixelProcessedRef.current = fullPixels.length;
      setServerPixelVer((v) => v + 1);
    } else if (fullPixels.length === prev && prev > 0) {
      map.clear();
      for (const pixel of fullPixels) {
        map.set(`${pixel.x},${pixel.y}`, {
          color: pixel.color,
          price: pixel.price,
          userId: pixel.userId,
        });
      }
      serverPixelProcessedRef.current = fullPixels.length;
      setServerPixelVer((v) => v + 1);
    }
  }, [fullPixels, hasSnapshot]);

  const serverPixelMap = serverPixelMapRef.current;

  // Overlay pixels: just the small serverPixelMap as a color-only Map
  const overlayPixels = useMemo(() => {
    const map = new Map<string, string>();
    serverPixelMap.forEach((val, key) => {
      map.set(key, val.color);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPixelVer]);

  // ---------------------------------------------------------------------------
  // Layered pixel lookup — O(1) per access, zero bulk allocation.
  // Replaces the old 250K-entry Map<"x,y","#rrggbb"> (40-80 MB) with direct
  // Uint32Array indexing (~1 MB). Hex strings are produced on-demand only.
  // ---------------------------------------------------------------------------
  const _snapshotLookup = useCallback(
    (key: string): { packed: number } | undefined => {
      if (!snapshotPixelData) {return undefined;}
      const ci = key.indexOf(",");
      const x = +key.substring(0, ci);
      const y = +key.substring(ci + 1);
      const idx = y * snapshotPixelData.width + x;
      if (idx < 0 || idx >= snapshotPixelData.pixels.length) {return undefined;}
      const packed = snapshotPixelData.pixels[idx];
      return packed !== 0 ? { packed } : undefined;
    },
    [snapshotPixelData],
  );

  /** Get the base color for a pixel key ("x,y" → "#rrggbb" | undefined).
   *  Checks overlay first, then snapshot Uint32Array. */
  const getBaseColor = useCallback(
    (key: string): string | undefined => {
      const overlayColor = overlayPixels.get(key);
      if (overlayColor !== undefined) {return overlayColor;}
      const hit = _snapshotLookup(key);
      return hit ? packedToHex(hit.packed) : undefined;
    },
    [overlayPixels, _snapshotLookup],
  );

  /** Get base color as packed uint32 (WHITE_PACKED for empty).
   *  Avoids packedToHex string allocations in the hot painting path. */
  const _getBasePacked = useCallback(
    (key: string): number => {
      const overlayColor = overlayPixels.get(key);
      if (overlayColor !== undefined) {
        return hexToPacked(overlayColor);
      }
      const hit = _snapshotLookup(key);
      return hit ? hit.packed : WHITE_PACKED;
    },
    [overlayPixels, _snapshotLookup],
  );

  /** Check if a pixel exists in base data (overlay or snapshot). */
  const hasBasePixel = useCallback(
    (key: string): boolean => {
      if (overlayPixels.has(key)) {return true;}
      return _snapshotLookup(key) !== undefined;
    },
    [overlayPixels, _snapshotLookup],
  );

  // Canvas uses snapshotBitmap directly for rendering; the Map prop is only
  // needed in the no-snapshot fallback path (paginated loading).
  const canvasBasePixelMap = useMemo(
    () => (snapshotBitmap ? EMPTY_PIXEL_MAP : overlayPixels),
    [snapshotBitmap, overlayPixels],
  );

  // Pending pixels for rendering (empty when moveDraft is active)
  const pendingForRender = useMemo(
    () => (moveDraft ? EMPTY_PENDING : pendingState.pending),
    [moveDraft, pendingState.pending],
  );

  const deferredPending = useDeferredValue(pendingState.pending);
  const effectivePending = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, color] of Object.entries(deferredPending)) {
      const existingColor = (getBaseColor(key) ?? "#ffffff").toLowerCase();
      if (existingColor !== color.toLowerCase()) {
        result[key] = color;
      }
    }
    return result;
  }, [deferredPending, getBaseColor]);

  const hasForeignOverwrite = useMemo(() => {
    if (!isAuthenticated || !user?._id) {
      return false;
    }
    // Without per-pixel userId, assume overwrite if pixel exists in snapshot
    // (not from our optimistic merge). Server handles real permission check.
    return Object.keys(effectivePending).some((key) => {
      const inOptimistic = serverPixelMap.get(key);
      if (inOptimistic) {return inOptimistic.userId !== user._id;}
      return _snapshotLookup(key) !== undefined;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePending, isAuthenticated, serverPixelVer, _snapshotLookup, user?._id]);

  useEffect(() => {
    setPendingPriceBaseline((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(effectivePending)) {
        if (next[key] === undefined) {
          const ex = serverPixelMap.get(key);
          if (ex) {
            // Known price from optimistic/server data
            next[key] = ex.price;
          } else if (priceMap) {
            // Accurate price from reactive price map chunks
            const ci = key.indexOf(",");
            const px = +key.substring(0, ci);
            const py = +key.substring(ci + 1);
            const mp = priceMap[py * gridWidth + px];
            next[key] = mp > 0 ? mp : (hasBasePixel(key) ? pixelPrice : null);
          } else {
            // priceMap not loaded yet — don't set baseline (skip detection for now)
            // Once priceMap loads, this effect re-runs and sets the accurate baseline.
          }
          if (next[key] !== undefined) {changed = true;}
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
  }, [effectivePending, hasBasePixel, pixelPrice, serverPixelMap, priceMap, gridWidth]);

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
      const optimistic = serverPixelMap.get(key);
      if (optimistic) {
        cost += nextPixelPrice(pixelPrice, optimistic.price);
      } else {
        // Vectorized lookup: priceMap[y * width + x] — O(1), no string keys
        const ci = key.indexOf(",");
        const px = +key.substring(0, ci);
        const py = +key.substring(ci + 1);
        const mapPrice = priceMap ? priceMap[py * gridWidth + px] : 0;
        if (mapPrice > 0) {
          cost += nextPixelPrice(pixelPrice, mapPrice);
        } else if (hasBasePixel(key)) {
          cost += nextPixelPrice(pixelPrice, pixelPrice);
        } else {
          cost += pixelPrice;
        }
      }
    }
    return cost;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePending, serverPixelVer, pixelPrice, hasBasePixel, priceMap, gridWidth]);

  const priceIncreaseDetected = useMemo(() => {
    return Object.keys(effectivePending).some((key) => {
      const baselinePrice = pendingPriceBaseline[key];
      if (baselinePrice === undefined) {
        return false;
      }
      const baselineCost = nextPixelPrice(pixelPrice, baselinePrice ?? undefined);
      const optimistic = serverPixelMap.get(key);
      let currentPrice: number | undefined;
      if (optimistic) {
        currentPrice = optimistic.price;
      } else {
        const ci = key.indexOf(",");
        const px = +key.substring(0, ci);
        const py = +key.substring(ci + 1);
        const mapPrice = priceMap ? priceMap[py * gridWidth + px] : 0;
        currentPrice = mapPrice > 0 ? mapPrice : (hasBasePixel(key) ? pixelPrice : undefined);
      }
      const currentCost = nextPixelPrice(pixelPrice, currentPrice);
      return currentCost > baselineCost;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePending, pendingPriceBaseline, pixelPrice, serverPixelVer, hasBasePixel, priceMap, gridWidth]);

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

  const highlightedPixelSet = useMemo(
    () => (confirmOpen ? new Set(Object.keys(effectivePending)) : undefined),
    [confirmOpen, effectivePending],
  );

  const canUndo = pendingState.history.length > 0 || pendingCount > 0;
  const canRedo = pendingState.redo.length > 0;
  const canClear = pendingCount > 0;

  const handleUndo = () => {
    startTransition(() => {
      if (pendingState.history.length > 0) {
        dispatch({ type: "undo" });
      } else if (pendingCount > 0) {
        dispatch({ type: "reset" });
      }
    });
  };

  const handleRedo = () => {
    startTransition(() => {
      if (pendingState.redo.length > 0) {
        dispatch({ type: "redo" });
      }
    });
  };

  const LARGE_THRESHOLD = 1000;

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
    if (activeTool === "move") {
      setMoveDraft(null);
      setActiveTool("paint");
    }
    if (tutorialStep === 3) {
      setTutorialStep(null);
      localStorage.setItem("pixagora-tutorial-done", "1");
    }
    setPopupOpen(false);
    setCommitWarning(null);
    preUploadedBlobRef.current = null;
    setConfirmOpen(true);

    // Pre-upload blob for large commits so "Potvrdit" is instant.
    // Cost displayed in dialog = totalCost from useMemo (uses priceMap chunks + serverPixelMap).
    // Server charges actual cost at commit time — no PRICE_CHANGED errors.
    const payload = Object.entries(effectivePending).map(([key, color]) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, color };
    });
    if (payload.length > LARGE_THRESHOLD && canvasId) {
      (async () => {
        try {
          const buffer = new ArrayBuffer(payload.length * 7);
          const view = new DataView(buffer);
          for (let i = 0; i < payload.length; i++) {
            const px = payload[i];
            const offset = i * 7;
            view.setUint16(offset, px.x, true);
            view.setUint16(offset + 2, px.y, true);
            const hex = px.color.replace("#", "");
            view.setUint8(offset + 4, parseInt(hex.substring(0, 2), 16));
            view.setUint8(offset + 5, parseInt(hex.substring(2, 4), 16));
            view.setUint8(offset + 6, parseInt(hex.substring(4, 6), 16));
          }

          const uploadUrl = fixConvexUrl(await generateUploadUrl());
          const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: new Blob([buffer]),
          });
          if (!uploadResponse.ok) {throw new Error("Upload failed");}
          const { storageId } = await uploadResponse.json();
          preUploadedBlobRef.current = storageId;
        } catch (err) {
          console.warn("Pre-upload failed:", err);
        }
      })();
    }
  };

  const handleCancelConfirm = () => {
    preUploadedBlobRef.current = null;
    setConfirmOpen(false);
  };

  const handleConfirm = async () => {
    setCommitWarning(null);
    const ok = await handleCommit();
    if (ok) {
      setConfirmOpen(false);
    }
  };

  const handlePixelClick = (x: number, y: number) => {
    if (activeTool === "move" && moveDraft) {
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
      setActiveTool("paint");
      return;
    }
    if (activeTool === "stamp") {
      if (!stampTool.stampReady || stampTool.stampPixels.length === 0) {
        return;
      }
      const changes: { key: string; nextPending?: string }[] = [];
      for (const px of stampTool.stampPixels) {
        const targetX = x + px.x;
        const targetY = y + px.y;
        if (
          targetX < 0 ||
          targetY < 0 ||
          targetX >= gridWidth ||
          targetY >= gridHeight
        ) {
          continue;
        }
        const key = `${targetX},${targetY}`;
        const baseColor = getBaseColor(key) ?? "#ffffff";
        const visibleColor = (
          pendingState.pending[key] ?? baseColor
        ).toLowerCase();
        const nextColor = px.color.toLowerCase();
        if (nextColor === visibleColor) {
          continue;
        }
        const nextPending =
          nextColor === baseColor.toLowerCase() ? undefined : px.color;
        changes.push({ key, nextPending });
      }
      if (changes.length > 0) {
        dispatch({ type: "applyBatch", changes });
      }
      return;
    }
    // Paint with brush size
    const half = Math.floor(brushSize / 2);
    if (brushSize <= 1) {
      const key = `${x},${y}`;
      const baseColor = getBaseColor(key) ?? "#ffffff";
      const visibleColor = (
        pendingState.pending[key] ?? baseColor
      ).toLowerCase();
      if (selectedColor.toLowerCase() === visibleColor) {
        dispatch({ type: "apply", key, nextPending: undefined });
      } else {
        const nextPending =
          selectedColor.toLowerCase() === baseColor.toLowerCase()
            ? undefined
            : selectedColor;
        dispatch({ type: "apply", key, nextPending });
      }
    } else {
      const changes: { key: string; nextPending?: string }[] = [];
      for (let dy = -half; dy < brushSize - half; dy++) {
        for (let dx = -half; dx < brushSize - half; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= gridWidth || py >= gridHeight) {continue;}
          const key = `${px},${py}`;
          const baseColor = getBaseColor(key) ?? "#ffffff";
          const visibleColor = (
            pendingState.pending[key] ?? baseColor
          ).toLowerCase();
          if (selectedColor.toLowerCase() === visibleColor) {continue;}
          const nextPending =
            selectedColor.toLowerCase() === baseColor.toLowerCase()
              ? undefined
              : selectedColor;
          changes.push({ key, nextPending });
        }
      }
      if (changes.length > 0) {
        dispatch({ type: "applyBatch", changes });
      }
    }
  };

  const handleFreePaintBatch = (points: { x: number; y: number }[]) => {
    if (activeTool !== "paint") {return;}

    const half = Math.floor(brushSize / 2);
    const selPacked = hexToPacked(selectedColor);
    const changes: { key: string; nextPending?: string }[] = [];
    const seen = new Set<string>();

    for (const { x, y } of points) {
      for (let dy = -half; dy < brushSize - half; dy++) {
        for (let dx = -half; dx < brushSize - half; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= gridWidth || py >= gridHeight) {continue;}
          const key = `${px},${py}`;
          if (seen.has(key)) {continue;}
          seen.add(key);
          const basePacked = _getBasePacked(key);
          const pendingHex = pendingState.pending[key];
          if (pendingHex !== undefined) {
            if (selPacked === hexToPacked(pendingHex)) {continue;}
          } else {
            if (selPacked === basePacked) {continue;}
          }
          const nextPending = selPacked === basePacked ? undefined : selectedColor;
          changes.push({ key, nextPending });
        }
      }
    }

    if (changes.length > 0) {
      dispatch({ type: "applyBatch", changes });
    }
  };

  const rawPendingRef = useRef(pendingState.pending);
  rawPendingRef.current = pendingState.pending;
  const handleSetActiveTool = useCallback((next: ActiveTool) => {
    setActiveTool((prev) => {
      // Leaving move: clear draft
      if (prev === "move" && next !== "move") {
        setMoveDraft(null);
      }
      // Entering move: capture pending pixels into relative coords
      // Use raw pending (not effectivePending) to preserve ALL user-drawn
      // pixels, including those whose color matches the base canvas.
      if (next === "move") {
        const ep = rawPendingRef.current;
        const keys = Object.keys(ep);
        if (keys.length === 0) {return prev;}
        const pixels = keys.map((key) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, color: ep[key] };
        });
        let minX = Infinity;
        let minY = Infinity;
        for (const p of pixels) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
        }
        setMoveDraft({
          pixels: pixels.map((p) => ({
            x: p.x - minX,
            y: p.y - minY,
            color: p.color,
          })),
        });
      }
      return next;
    });
  }, []);

  // Optimistically merge committed pixels into serverPixelMap so they
  // appear immediately without waiting for paginated query to catch up.
  const optimisticMergeCommitted = useCallback(
    (pending: Record<string, string>) => {
      const map = serverPixelMapRef.current;
      for (const key in pending) {
        const existing = map.get(key);
        map.set(key, {
          color: pending[key],
          price: existing?.price ?? pixelPrice,
          userId: existing?.userId ?? "",
        });
      }
      setServerPixelVer((v) => v + 1);
    },
    [pixelPrice],
  );

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

      // Capture pending before reset for optimistic merge
      const committedPending = { ...effectivePending };

      // Large commits: upload blob → commitFromBlob (single action, no two-phase)
      // Cost in dialog = FE estimate from price matrix. Server charges actual cost.
      if (payload.length > LARGE_THRESHOLD) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let storageId: any;
        if (preUploadedBlobRef.current) {
          storageId = preUploadedBlobRef.current;
          preUploadedBlobRef.current = null;
        } else {
          const buffer = new ArrayBuffer(payload.length * 7);
          const view = new DataView(buffer);
          for (let i = 0; i < payload.length; i++) {
            const px = payload[i];
            const offset = i * 7;
            view.setUint16(offset, px.x, true);
            view.setUint16(offset + 2, px.y, true);
            const hex = px.color.replace("#", "");
            view.setUint8(offset + 4, parseInt(hex.substring(0, 2), 16));
            view.setUint8(offset + 5, parseInt(hex.substring(2, 4), 16));
            view.setUint8(offset + 6, parseInt(hex.substring(4, 6), 16));
          }
          const uploadUrl = fixConvexUrl(await generateUploadUrl());
          const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: new Blob([buffer]),
          });
          if (!uploadResponse.ok) {throw new Error("Failed to upload pixel data");}
          ({ storageId } = await uploadResponse.json());
        }
        const result = await commitFromBlob({ token, canvasId, storageId, expectedCost: totalCost });
        if (result && "error" in result && result.error) {
          if (result.error === "PRICE_CHANGED") {
            setConfirmOpen(false);
          } else if (result.error === "NOT_ENOUGH_CREDITS") {
            setConfirmOpen(false);
            handleOpenBuyCredits();
          } else if (result.error === "MIN_PAYMENT_REQUIRED") {
            setConfirmOpen(false);
            setMinPaymentBlockedOpen(true);
          } else if (result.error === "OVERWRITE_LOCKED") {
            setConfirmOpen(false);
            setOverwriteBlockedOpen(true);
          } else if (result.error === "CANVAS_LOCKED") {
            setConfirmOpen(false);
          }
          return false;
        }
        optimisticMergeCommitted(committedPending);
        dispatch({ type: "reset" });
        return true;
      }

      // Small commit: single mutation with expectedCost check
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
        } else if (result.error === "MIN_PAYMENT_REQUIRED") {
          setConfirmOpen(false);
          setMinPaymentBlockedOpen(true);
        } else if (result.error === "OVERWRITE_LOCKED") {
          setConfirmOpen(false);
          setOverwriteBlockedOpen(true);
        } else if (result.error === "CANVAS_LOCKED") {
          setConfirmOpen(false);
        } else if (result.error === "PRICE_CHANGED") {
          setCommitWarning("Ceny se změnily. Zkontroluj novou cenu a potvrď znovu.");
          return false;
        }
        return false;
      }
      optimisticMergeCommitted(committedPending);
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
        canCommit={pendingCount > 0 && !!canvasId && activeTool !== "move" && !isCanvasLocked}
        commitLocked={isCanvasLocked}
        isCommitting={isCommitting}
        onClearPending={handleOpenClearConfirm}
        canClear={canClear}
        activeTool={activeTool}
        onToolChange={handleSetActiveTool}
        canMove={pendingCount > 0}
        showMoveHint={priceIncreaseDetected && !moveHintDismissed}
        onDismissMoveHint={() => setMoveHintDismissed(true)}
        showFooter={true}
        onHowItWorks={() => setHowItWorksOpen(true)}
        replayCanvasId={canvasId}
        isFreeModePainting={isFreeModePainting}
        onFreeModePaintingChange={setIsFreeModePainting}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        toolContextControls={<StampToolControls stamp={stampTool} />}
      >
        {totalCanvases === 0 && !snapshotBitmap ? (
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
            count={totalCanvases || 1}
            onIndexChange={handleReelIndexChange}
            renderItem={(index) => (
              <div className="flex h-full w-full items-center justify-center overflow-hidden">
                {isLoadingUser ? (
                  <div className="text-sm text-muted-foreground">
                    Načítám uživatele…
                  </div>
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                    <Canvas
                      basePixelMap={
                        index === activeReelIndex ? canvasBasePixelMap : EMPTY_PIXEL_MAP
                      }
                      snapshotBitmap={
                        index === activeReelIndex ? snapshotBitmap : null
                      }
                      overlayPixels={
                        index === activeReelIndex ? overlayPixels : undefined
                      }
                      pendingPixels={
                        index === activeReelIndex ? pendingForRender : EMPTY_PENDING
                      }
                      width={canvases?.[index]?.width ?? gridWidth}
                      height={canvases?.[index]?.height ?? gridHeight}
                      selectedColor={selectedColor}
                      onPixelClick={(x, y) => {
                        if (index === activeReelIndex) {
                          handlePixelClick(x, y);
                        }
                      }}
                      onFreePaintBatch={(points) => {
                        if (index === activeReelIndex) {
                          handleFreePaintBatch(points);
                        }
                      }}
                      movePreviewPixels={
                        index === activeReelIndex ? moveDraft?.pixels ?? null : null
                      }
                      movePreviewActive={index === activeReelIndex && activeTool === "move" && !!moveDraft}
                      highlightedPixels={
                        index === activeReelIndex
                          ? highlightedPixelSet
                          : undefined
                      }
                      stampOverlayPixels={
                        index === activeReelIndex && activeTool === "stamp" && stampTool.stampReady
                          ? stampTool.stampPixels
                          : null
                      }
                      onWheelStampResize={(delta) => {
                        stampTool.setStampSize((prev) =>
                          Math.max(stampTool.minStampSize, Math.min(stampTool.maxStampSize, prev + delta))
                        );
                      }}
                      isFreeModePainting={activeTool === "paint" && isFreeModePainting}
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
                    {index === activeReelIndex && !snapshotReady && (
                      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                        Načítám snapshot…
                      </div>
                    )}
                    {index === activeReelIndex && snapshotReady && !hasSnapshot && fullStatus !== "Exhausted" && (
                      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                        Načítám pixely…
                      </div>
                    )}
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

      {minPaymentBlockedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Minimum pro kreslení je 69 Kč</h2>
              <p className="text-sm text-muted-foreground">
                Aby bylo možné kreslit, je potřeba podpořit projekt
                částkou alespoň <strong>69 Kč</strong>. Dobij si kredity
                pomocí tlačítek níže.
              </p>
            </div>
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
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMinPaymentBlockedOpen(false);
                    setBtcPayPurchaseOpen(true);
                  }}
                  className="flex h-10 items-center justify-between gap-3 rounded-md px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: "#F7931A" }}
                >
                  <span className="flex-1 text-left">Zaplatit Bitcoinem</span>
                </button>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => setMinPaymentBlockedOpen(false)}
              className="w-full"
            >
              Zavřít
            </Button>
          </div>
        </div>
      )}

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
                odměny za alespoň <strong>669 Kč</strong>. Přesuň svoji malbu
                pomocí nástroje přesunout, nebo si dobij kredity pomocí
                tlačítek níže.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setOverwriteBlockedOpen(false);
                handleSetActiveTool("move");
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

      {confirmOpen && (() => {
        const balance = user?.credits ?? 0;
        const canAfford = balance >= totalCost;
        return (
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
                {pendingCount}{" "}
                {pendingCount === 1
                  ? "pixel"
                  : pendingCount < 5
                    ? "pixely"
                    : "pixelů"}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cena</span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Coins className="h-3.5 w-3.5" />
                  {totalCost}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tvůj zůstatek</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${canAfford ? "text-foreground" : "text-red-500"}`}>
                  <Coins className="h-3.5 w-3.5" />
                  {balance}
                </span>
              </div>
              {canAfford && (
                <div className="flex items-center justify-between border-t pt-1.5 text-xs text-muted-foreground">
                  <span>Po nákupu</span>
                  <span className="inline-flex items-center gap-1">
                    <Coins className="h-3 w-3" />
                    {balance - totalCost}
                  </span>
                </div>
              )}
            </div>

            {!canAfford && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                <p className="font-medium">Nedostatek kreditů</p>
                <p className="mt-0.5 text-xs">
                  Chybí ti cca <strong>{totalCost - balance}</strong> kreditů.
                </p>
              </div>
            )}

            {commitWarning && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                {commitWarning}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={handleConfirm}
                disabled={isCommitting || !canAfford}
                className="flex-1 gap-2"
              >
                {isCommitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isCommitting ? "Odesílám…" : "Potvrdit"}
              </Button>
              {!isCommitting && (
                <Button variant="secondary" onClick={handleCancelConfirm}>
                  Zrušit
                </Button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

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
        totalPaidCzk={paymentSummary?.totalPaidCzk}
        onClose={() => setBtcPayPurchaseOpen(false)}
      />
    </>
  );
}
