"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Canvas } from "./Canvas";

const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;

const COLORS = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff00ff",
  "#ff8800",
];

export default function CanvasPage() {
  const [token, setToken] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const user = useQuery(
    api.users.getByToken,
    loggedIn ? { token } : "skip"
  );
  const pixels = useQuery(api.pixels.getAll);
  const paintPixel = useMutation(api.pixels.paint);

  // Try to restore token from localStorage
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
  };

  const handlePixelClick = async (x: number, y: number) => {
    if (!loggedIn) return;
    try {
      await paintPixel({ token, x, y, color: selectedColor });
    } catch (e: any) {
      alert(e.message || "Failed to paint pixel");
    }
  };

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col gap-4 rounded-lg border p-8">
          <h1 className="text-2xl font-bold">Pixagora</h1>
          <p className="text-muted-foreground">Enter your token to start painting</p>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Your token..."
            className="rounded border px-3 py-2"
          />
          <button
            onClick={handleLogin}
            className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header with credits */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-bold">Pixagora</h1>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-lg font-semibold">
              Credits: <strong className="text-2xl">{user.credits}</strong>
            </span>
          )}
          {user === null && (
            <span className="text-sm text-destructive">Invalid token</span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Canvas area */}
      <div className="flex flex-1 items-center justify-center p-4">
        <Canvas
          pixels={pixels ?? []}
          width={GRID_WIDTH}
          height={GRID_HEIGHT}
          selectedColor={selectedColor}
          onPixelClick={handlePixelClick}
        />
      </div>

      {/* Color picker */}
      <footer className="flex items-center justify-center gap-2 border-t px-4 py-3">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setSelectedColor(c)}
            className="h-8 w-8 rounded-full border-2"
            style={{
              backgroundColor: c,
              borderColor: c === selectedColor ? "#3b82f6" : "transparent",
              boxShadow: c === selectedColor ? "0 0 0 2px #3b82f6" : "none",
            }}
          />
        ))}
      </footer>
    </div>
  );
}
