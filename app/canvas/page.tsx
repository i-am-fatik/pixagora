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

type PendingChange = {
  key: string;
  prevPending?: string;
  nextPending?: string;
};

type PendingState = {
  pending: Record<string, string>;
  history: PendingChange[];
  redo: PendingChange[];
};

type PendingAction =
  | { type: "apply"; key: string; nextPending?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

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
    case "undo": {
      const last = state.history[state.history.length - 1];
      if (!last) {
        return state;
      }
      const nextPendingMap = { ...state.pending };
      if (last.prevPending === undefined) {
        delete nextPendingMap[last.key];
      } else {
        nextPendingMap[last.key] = last.prevPending;
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
      if (last.nextPending === undefined) {
        delete nextPendingMap[last.key];
      } else {
        nextPendingMap[last.key] = last.nextPending;
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
    default:
      return state;
  }
}

export default function CanvasPage() {
  const [token, setToken] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingState, dispatch] = useReducer(
    pendingReducer,
    initialPendingState,
  );
  const loginDialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reelsRef = useRef<CanvasReelsHandle | null>(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (colors.length > 0 && !colors.includes(selectedColor)) {
      setSelectedColor(colors[0]);
    }
  }, [colors]);

  useEffect(() => {
    const saved = localStorage.getItem("pixagora-token");
    if (saved) {
      setToken(saved);
      setLoggedIn(true);
    }
  }, []);

  const handleLogin = () => {
    if (!token.trim()) {
      return;
    }
    localStorage.setItem("pixagora-token", token);
    setLoggedIn(true);
    setInvalidToken(false);
    setLoginOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("pixagora-token");
    setToken("");
    setLoggedIn(false);
    dispatch({ type: "reset" });
  };

  const showInvalidToken = loggedIn && user === null;
  const isAuthenticated = loggedIn && !!user;
  const isLoadingUser = loggedIn && user === undefined;

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

  const pendingCount = Object.keys(pendingState.pending).length;
  const totalCost = useMemo(() => {
    let cost = 0;
    for (const key of Object.keys(pendingState.pending)) {
      const existing = serverPixelMap.get(key);
      cost += existing ? existing.price * 2 : pixelPrice;
    }
    return cost;
  }, [pendingState.pending, serverPixelMap, pixelPrice]);

  const handlePixelClick = (x: number, y: number) => {
    if (!isAuthenticated) {
      return;
    }
    const key = `${x},${y}`;
    const serverColor = serverPixelMap.get(key)?.color;
    const visibleColor = pendingState.pending[key] ?? serverColor;

    if (selectedColor === visibleColor) {
      dispatch({ type: "apply", key, nextPending: undefined });
    } else {
      const nextPending =
        selectedColor === serverColor ? undefined : selectedColor;
      dispatch({ type: "apply", key, nextPending });
    }
  };

  const handleCommit = async () => {
    if (!isAuthenticated || pendingCount === 0 || isCommitting || !canvasId) {
      return;
    }
    setIsCommitting(true);
    try {
      const payload = Object.entries(pendingState.pending).map(
        ([key, color]) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, color };
        },
      );
      await commitPixels({ token, canvasId, pixels: payload });
      dispatch({ type: "reset" });
    } catch (error: any) {
      alert(error?.message || "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReelIndexChange = useCallback(
    (index: number) => {
      if (index !== activeReelIndex) {
        dispatch({ type: "reset" });
      }
      setActiveReelIndex(index);
    },
    [activeReelIndex],
  );

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
