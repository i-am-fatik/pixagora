"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Canvas } from "./Canvas";
import { CanvasPageLayout } from "./CanvasPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;
const PIXEL_PRICE = 1;

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

function pendingReducer(state: PendingState, action: PendingAction): PendingState {
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
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingState, dispatch] = useReducer(
    pendingReducer,
    initialPendingState,
  );

  const user = useQuery(
    api.users.getByToken,
    loggedIn ? { token } : "skip",
  );
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
      dispatch({ type: "reset" });
    }
  }, [showInvalidToken]);

  const serverPixelMap = useMemo(() => {
    const map = new Map<string, string>();
    (pixels ?? []).forEach((pixel) => {
      map.set(`${pixel.x},${pixel.y}`, pixel.color);
    });
    return map;
  }, [pixels]);

  const displayPixels = useMemo(() => {
    const map = new Map(serverPixelMap);
    Object.entries(pendingState.pending).forEach(([key, color]) => {
      map.set(key, color);
    });
    return Array.from(map.entries()).map(([key, color]) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, color };
    });
  }, [serverPixelMap, pendingState.pending]);

  const pendingCount = Object.keys(pendingState.pending).length;
  const totalCost = pendingCount * PIXEL_PRICE;

  const handlePixelClick = (x: number, y: number) => {
    if (!isAuthenticated) return;
    const key = `${x},${y}`;
    const serverColor = serverPixelMap.get(key);
    const nextPending = selectedColor === serverColor ? undefined : selectedColor;
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
    <CanvasPageLayout
      isLoggedIn={loggedIn}
      credits={user?.credits}
      onSignIn={handleLogin}
      onSignOut={handleLogout}
      signInDisabled={!token.trim()}
      showInvalidToken={showInvalidToken}
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
    >
      <div className="flex min-h-full items-center justify-center p-6">
        {!loggedIn || showInvalidToken ? (
          <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Pixagora</h1>
              <p className="text-sm text-muted-foreground">
                Zadej token a začni malovat.
              </p>
            </div>
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleLogin()}
              placeholder="Token..."
            />
            <Button
              onClick={handleLogin}
              disabled={!token.trim()}
              className="w-full"
            >
              Přihlásit
            </Button>
            {showInvalidToken && (
              <p className="text-sm text-destructive">
                Tento token není platný. Zkus to prosím znovu.
              </p>
            )}
          </div>
        ) : isLoadingUser ? (
          <div className="text-sm text-muted-foreground">Načítám uživatele…</div>
        ) : (
          <Canvas
            pixels={displayPixels}
            width={GRID_WIDTH}
            height={GRID_HEIGHT}
            selectedColor={selectedColor}
            onPixelClick={handlePixelClick}
          />
        )}
      </div>
    </CanvasPageLayout>
  );
}
