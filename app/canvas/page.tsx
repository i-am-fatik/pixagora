"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Canvas } from "./Canvas";
import { CanvasPageLayout } from "./CanvasPageLayout";
import { CanvasReels } from "./CanvasReels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 10;
const PIXEL_PRICE = 1;
const PAGE_UNLOCK_THRESHOLD = 0.1;
const PAGE_HARD_CAP = 4;

const COLORS = [
  "#000000", // black
  "#7F7F7F", // agorist gray
  "#FFFFFF", // white (peace)
  "#FFD400", // ancap yellow
  "#F7931A", // BTC orange
  "#00AEEF", // cyan
  "#EC008C", // magenta
  "#0057B8", // royal blue
  "#00A651", // green
];

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
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingState, dispatch] = useReducer(
    pendingReducer,
    initialPendingState,
  );
  const loginDialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const user = useQuery(api.users.getByToken, loggedIn ? { token } : "skip");
  const pixels = useQuery(api.pixels.getAll);
  const commitPixels = useMutation(api.pixels.commit);

  useEffect(() => {
    const saved = localStorage.getItem("pixagora-token");
    if (saved) {
      setToken(saved);
      setLoggedIn(true);
    }
  }, []);

  const handleLogin = () => {
    if (!token.trim()) return;
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
    if (!loginOpen) return;
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
    if (event.key !== "Tab") return;

    const dialog = loginDialogRef.current;
    if (!dialog) return;
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
    const map = new Map<string, string>();
    (pixels ?? []).forEach((pixel) => {
      map.set(`${pixel.x},${pixel.y}`, pixel.color);
    });
    return map;
  }, [pixels]);

  const combinedPixelMap = useMemo(() => {
    const map = new Map(serverPixelMap);
    Object.entries(pendingState.pending).forEach(([key, color]) => {
      map.set(key, color);
    });
    return map;
  }, [serverPixelMap, pendingState.pending]);

  const totalPages = useMemo(() => {
    const counts = Array.from({ length: PAGE_HARD_CAP }, () => 0);
    serverPixelMap.forEach((_color, key) => {
      const [, yRaw] = key.split(",");
      const y = Number(yRaw);
      if (!Number.isFinite(y)) return;
      const pageIndex = Math.floor(y / GRID_HEIGHT);
      if (pageIndex >= 0 && pageIndex < PAGE_HARD_CAP) {
        counts[pageIndex] += 1;
      }
    });

    const pageSize = GRID_WIDTH * GRID_HEIGHT;
    let pages = 1;
    while (pages < PAGE_HARD_CAP) {
      const fill = counts[pages - 1] / pageSize;
      if (fill >= PAGE_UNLOCK_THRESHOLD) {
        pages += 1;
      } else {
        break;
      }
    }
    return pages;
  }, [serverPixelMap]);

  const pixelsByPage = useMemo(() => {
    const pages = Array.from(
      { length: totalPages },
      () =>
        [] as {
          x: number;
          y: number;
          color: string;
        }[],
    );
    combinedPixelMap.forEach((color, key) => {
      const [xRaw, yRaw] = key.split(",");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const pageIndex = Math.floor(y / GRID_HEIGHT);
      if (pageIndex < 0 || pageIndex >= totalPages) return;
      pages[pageIndex].push({
        x,
        y: y - pageIndex * GRID_HEIGHT,
        color,
      });
    });
    return pages;
  }, [combinedPixelMap, totalPages]);

  const pendingCount = Object.keys(pendingState.pending).length;
  const totalCost = pendingCount * PIXEL_PRICE;

  const handlePixelClick = (pageIndex: number, x: number, y: number) => {
    if (!isAuthenticated) return;
    const globalY = y + pageIndex * GRID_HEIGHT;
    const key = `${x},${globalY}`;
    const serverColor = serverPixelMap.get(key);
    const nextPending =
      selectedColor === serverColor ? undefined : selectedColor;
    dispatch({ type: "apply", key, nextPending });
  };

  const handleCommit = async () => {
    if (!isAuthenticated || pendingCount === 0 || isCommitting) return;
    setIsCommitting(true);
    try {
      const payload = Object.entries(pendingState.pending).map(
        ([key, color]) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, color };
        },
      );
      await commitPixels({ token, pixels: payload });
      dispatch({ type: "reset" });
    } catch (error: any) {
      alert(error?.message || "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <>
      <CanvasPageLayout
        isLoggedIn={loggedIn}
        credits={user?.credits}
        onSignIn={() => setLoginOpen(true)}
        onSignOut={handleLogout}
        signInDisabled={false}
        showInvalidToken={invalidToken}
        colors={COLORS}
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
        changedCount={pendingCount}
        totalCost={totalCost}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onCommit={handleCommit}
        canUndo={pendingState.history.length > 0}
        canRedo={pendingState.redo.length > 0}
        canCommit={isAuthenticated && pendingCount > 0}
        isCommitting={isCommitting}
        showFooter={isAuthenticated}
      >
        <CanvasReels
          count={totalPages}
          renderItem={(index) => (
            <div className="flex h-full w-full items-start justify-center p-6 box-border overflow-hidden">
              {isLoadingUser ? (
                <div className="text-sm text-muted-foreground">
                  Načítám uživatele…
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 overflow-hidden">
                  <Canvas
                    pixels={pixelsByPage[index] ?? []}
                    width={GRID_WIDTH}
                    height={GRID_HEIGHT}
                    selectedColor={selectedColor}
                    onPixelClick={(x, y) => handlePixelClick(index, x, y)}
                  />
                </div>
              )}
            </div>
          )}
        />
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
