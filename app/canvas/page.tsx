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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStampTool } from "./useStampTool";
import { StampToolControls } from "./StampToolControls";

type PendingChange = {
  kind: "single";
  key: string;
  prevPending?: string;
  nextPending?: string;
};

type PendingChangeBatch = {
  kind: "batch";
  changes: PendingChange[];
};

type PendingState = {
  pending: Record<string, string>;
  history: Array<PendingChange | PendingChangeBatch>;
  redo: Array<PendingChange | PendingChangeBatch>;
};

type PendingAction =
  | { type: "apply"; key: string; nextPending?: string }
  | { type: "applyBatch"; changes: { key: string; nextPending?: string }[] }
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
          {
            kind: "single",
            key: action.key,
            prevPending,
            nextPending: action.nextPending,
          },
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
        changes.push({
          kind: "single",
          key,
          prevPending,
          nextPending,
        });
      });
      if (changes.length === 0) {
        return state;
      }
      return {
        pending: nextPendingMap,
        history: [...state.history, { kind: "batch", changes }],
        redo: [],
      };
    }
    case "undo": {
      const last = state.history[state.history.length - 1];
      if (!last) {
        return state;
      }
      const nextPendingMap = { ...state.pending };
      const applyUndo = (change: PendingChange) => {
        if (change.prevPending === undefined) {
          delete nextPendingMap[change.key];
        } else {
          nextPendingMap[change.key] = change.prevPending;
        }
      };
      if (last.kind === "batch") {
        for (const change of last.changes) {
          applyUndo(change);
        }
      } else {
        applyUndo(last);
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
      const nextPendingMap = { ...state.pending };
      const applyRedo = (change: PendingChange) => {
        if (change.nextPending === undefined) {
          delete nextPendingMap[change.key];
        } else {
          nextPendingMap[change.key] = change.nextPending;
        }
      };
      if (last.kind === "batch") {
        for (const change of last.changes) {
          applyRedo(change);
        }
      } else {
        applyRedo(last);
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);
  const stampTool = useStampTool();
  const [selectedColor, setSelectedColorRaw] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("pixagora-color") : null) ?? "#000000",
  );
  const setSelectedColor = useCallback((color: string) => {
    setSelectedColorRaw(color);
    localStorage.setItem("pixagora-color", color);
  }, []);
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingState, dispatch] = useReducer(
    pendingReducer,
    initialPendingState,
  );
  const loginDialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
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

  const colors = activeCanvas?.colors ?? ["#000000"];
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
      if (Object.keys(pendingState.pending).length === 0 && pendingState.history.length === 0) {
        localStorage.removeItem(`pixagora-pending-${id}`);
      } else {
        localStorage.setItem(`pixagora-pending-${id}`, JSON.stringify(pendingState));
      }
    } catch {}
  }, [pendingState]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (colors.length > 0 && !colors.includes(selectedColor)) {
      setSelectedColor(colors[0]);
    }
  }, [colors]);

  const applyLogin = useCallback((nextToken: string) => {
    const trimmed = nextToken.trim();
    if (!trimmed) {
      return;
    }
    localStorage.setItem("pixagora-token", trimmed);
    setToken(trimmed);
    setLoggedIn(true);
    setInvalidToken(false);
    setLoginOpen(false);
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

  const handleLogin = () => {
    applyLogin(token);
  };

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
  };

  const showInvalidToken = loggedIn && user === null;
  const isAuthenticated = loggedIn && !!user;
  const isLoadingUser = loggedIn && user === undefined;
  const toolControls = <StampToolControls stamp={stampTool} />;

  useEffect(() => {
    if (showInvalidToken) {
      localStorage.removeItem("pixagora-token");
      setToken("");
      setLoggedIn(false);
      setInvalidToken(true);
      dispatch({ type: "reset" });
      setLoginOpen(true);
    }
  }, [showInvalidToken]);

  useEffect(() => {
    if (!loginOpen) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = loginDialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable) {
      focusable.focus();
    } else {
      dialog?.focus();
    }
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [loginOpen]);

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setLoginOpen(false);
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const dialog = loginDialogRef.current;
    if (!dialog) {
      return;
    }
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const isShift = event.shiftKey;

    if (isShift && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!isShift && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  };

  const handleTokenChange = (value: string) => {
    setToken(value);
    if (invalidToken) {
      setInvalidToken(false);
    }
  };

  const serverPixelMap = useMemo(() => {
    const map = new Map<string, { color: string; price: number }>();
    (pixels ?? []).forEach((pixel) => {
      map.set(`${pixel.x},${pixel.y}`, { color: pixel.color, price: pixel.price });
    });
    return map;
  }, [pixels]);

  const combinedPixelMap = useMemo(() => {
    const map = new Map<string, string>();
    serverPixelMap.forEach((val, key) => {
      map.set(key, val.color);
    });
    Object.entries(pendingState.pending).forEach(([key, color]) => {
      map.set(key, color);
    });
    return map;
  }, [serverPixelMap, pendingState.pending]);

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
      const serverColor = (serverPixelMap.get(key)?.color ?? "#ffffff").toLowerCase();
      if (serverColor !== color.toLowerCase()) {
        result[key] = color;
      }
    }
    return result;
  }, [pendingState.pending, serverPixelMap]);

  const pendingCount = Object.keys(effectivePending).length;
  const totalCost = useMemo(() => {
    let cost = 0;
    for (const key of Object.keys(effectivePending)) {
      const existing = serverPixelMap.get(key);
      cost += existing ? existing.price + 1 : pixelPrice;
    }
    return cost;
  }, [effectivePending, serverPixelMap, pixelPrice]);

  const handlePixelClick = (x: number, y: number) => {
    if (!isAuthenticated) {
      return;
    }
    if (stampTool.tool === "stamp") {
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
        const serverColor = serverPixelMap.get(key)?.color ?? "#ffffff";
        const visibleColor = (
          pendingState.pending[key] ?? serverColor
        ).toLowerCase();
        const nextColor = px.color.toLowerCase();
        if (nextColor === visibleColor) {
          continue;
        }
        const nextPending =
          nextColor === serverColor.toLowerCase() ? undefined : px.color;
        changes.push({ key, nextPending });
      }
      if (changes.length > 0) {
        dispatch({ type: "applyBatch", changes });
      }
      return;
    }
    const key = `${x},${y}`;
    const serverColor = serverPixelMap.get(key)?.color;
    const visibleColor = (pendingState.pending[key] ?? serverColor ?? "#ffffff").toLowerCase();

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

  const handleCommit = async () => {
    if (!isAuthenticated || pendingCount === 0 || isCommitting || !canvasId) {
      return;
    }
    setIsCommitting(true);
    try {
      const payload = Object.entries(effectivePending).map(
        ([key, color]) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, color };
        },
      );
      if (payload.length === 0) {
        return;
      }
      const BATCH_SIZE = 500;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        await commitPixels({ token, canvasId, pixels: batch });
      }
      dispatch({ type: "reset" });
    } catch (error: any) {
      alert(error?.message || "Commit failed");
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
        onSignIn={() => setLoginOpen(true)}
        onSignOut={handleLogout}
        signInDisabled={false}
        showInvalidToken={invalidToken}
        colors={colors}
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
        changedCount={pendingCount}
        totalCost={totalCost}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onCommit={handleCommit}
        canUndo={pendingState.history.length > 0}
        canRedo={pendingState.redo.length > 0}
        canCommit={isAuthenticated && pendingCount > 0 && !!canvasId}
        isCommitting={isCommitting}
        showFooter={isAuthenticated}
        toolControls={toolControls}
      >
        {totalCanvases === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-sm text-muted-foreground">
              {canvases === undefined ? "Načítám plátna…" : "Žádná plátna k zobrazení."}
            </div>
          </div>
        ) : (
          <CanvasReels
            ref={reelsRef}
            count={totalCanvases}
            enableTouchSwipe={false}
            onIndexChange={handleReelIndexChange}
            renderItem={(index) => (
              <div className="flex h-full w-full items-center justify-center p-6 box-border overflow-hidden">
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
                      width={
                        canvases?.[index]?.width ?? gridWidth
                      }
                      height={
                        canvases?.[index]?.height ?? gridHeight
                      }
                      selectedColor={selectedColor}
                      onPixelClick={(x, y) => {
                        if (index === activeReelIndex) {
                          handlePixelClick(x, y);
                        }
                      }}
                      onEdgeSwipe={
                        index === activeReelIndex ? handleEdgeSwipe : undefined
                      }
                    />
                  </div>
                )}
              </div>
            )}
          />
        )}
      </CanvasPageLayout>

      {loginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={loginDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            aria-describedby="login-desc"
            tabIndex={-1}
            onKeyDown={handleModalKeyDown}
            className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
          >
            <div className="space-y-1">
              <h2 id="login-title" className="text-xl font-semibold">
                Přihlášení
              </h2>
              <p id="login-desc" className="text-sm text-muted-foreground">
                Zadej token a začni malovat.
              </p>
            </div>
            <Input
              value={token}
              onChange={(event) => handleTokenChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleLogin()}
              placeholder="Token..."
              autoFocus
            />
            {invalidToken && (
              <p className="text-sm text-destructive">
                Tento token není platný. Zkus to prosím znovu.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleLogin}
                disabled={!token.trim()}
                className="flex-1"
              >
                Přihlásit
              </Button>
              <Button variant="secondary" onClick={() => setLoginOpen(false)}>
                Zavřít
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
