"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Crown, ChevronRight, Trophy, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type LeaderboardEntry = {
  userId: string;
  count: number;
  displayName: string;
  displayColor: string;
  displayEmail?: string;
};

function formatPx(count: number) {
  return `${count} px`;
}

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function withAlpha(hex: string, alpha: string) {
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    return `${hex}${alpha}`;
  }
  return hex;
}

function LeaderboardRow({
  entry,
  rank,
  dense = false,
  showEmail = false,
}: {
  entry: LeaderboardEntry;
  rank: number;
  dense?: boolean;
  showEmail?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex min-w-0 items-baseline gap-1">
        <span className="w-4 shrink-0 text-[11px] text-muted-foreground">
          {rank}.
        </span>
        {rank === 1 && (
          <Crown className="h-3 w-3 shrink-0 text-amber-400" />
        )}
        <span
          className="truncate text-xs font-semibold sm:overflow-visible sm:text-clip sm:whitespace-normal"
          style={{ color: entry.displayColor }}
        >
          {entry.displayName}
        </span>
        {showEmail && entry.displayEmail && (
          <span className="truncate text-[10px] text-muted-foreground/60">
            ({entry.displayEmail})
          </span>
        )}
      </div>
      <span
        className={`shrink-0 text-[11px] text-muted-foreground ${
          dense ? "min-w-[52px] text-right" : ""
        }`}
      >
        {formatPx(entry.count)}
      </span>
    </div>
  );
}

export function LeaderboardWidget({
  viewerId,
}: {
  viewerId?: Id<"users">;
}) {
  const [open, setOpen] = useState(false);
  const preview = useQuery(api.leaderboard.list, { limit: 4 });
  const full = useQuery(api.leaderboard.list, open ? {} : "skip");
  const rank = useQuery(
    api.leaderboard.getRank,
    viewerId ? { userId: viewerId } : "skip",
  );
  const previewLoading = preview === undefined;
  const fullLoading = open && full === undefined;

  const topThree = useMemo(() => {
    return (preview?.entries ?? []).slice(0, 3) as LeaderboardEntry[];
  }, [preview?.entries]);

  const allEntries = (full?.entries ?? []) as LeaderboardEntry[];
  const modalTop = allEntries.slice(0, 3);

  return (
    <>
      <div className="fixed bottom-20 left-4 z-40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative w-auto overflow-hidden rounded-2xl border border-black/10 bg-background/70 p-3 text-left shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background/80 hover:shadow-xl dark:border-white/10 sm:w-52"
          aria-label="Otevřít leaderboard"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            <Trophy className="h-3.5 w-3.5 text-amber-400/90" />
            <span className="sm:inline">Top malíři</span>
          </div>
          <div className="mt-2 space-y-1 hidden sm:block">
            {previewLoading ? (
              <div className="text-[11px] text-muted-foreground">
                Načítám…
              </div>
            ) : topThree.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-black/5 px-2 py-1 dark:bg-white/5">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold"
                      style={{
                        borderColor: topThree[0].displayColor,
                        color: topThree[0].displayColor,
                        backgroundColor: withAlpha(topThree[0].displayColor, "22"),
                      }}
                    >
                      1
                    </div>
                    <span
                      className="truncate text-xs font-semibold sm:overflow-visible sm:text-clip sm:whitespace-normal"
                      style={{ color: topThree[0].displayColor }}
                    >
                      {topThree[0].displayName}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatPx(topThree[0].count)}
                  </span>
                </div>
                <div className="hidden sm:block">
                  {topThree.slice(1).map((entry, index) => (
                    <div
                      key={entry.userId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-black/5 px-2 py-1 dark:bg-white/5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold"
                          style={{
                            borderColor: entry.displayColor,
                            color: entry.displayColor,
                            backgroundColor: withAlpha(entry.displayColor, "22"),
                          }}
                        >
                          {index + 2}
                        </div>
                        <span
                          className="truncate text-xs font-semibold sm:overflow-visible sm:text-clip sm:whitespace-normal"
                          style={{ color: entry.displayColor }}
                        >
                          {entry.displayName}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatPx(entry.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Zatím nikdo.
              </div>
            )}
            {rank && (
              <div className="flex items-baseline justify-between gap-2 rounded-lg bg-primary/10 px-2 py-1 text-[11px] text-muted-foreground">
                <span>
                  Ty jsi na{" "}
                  <span
                    className="font-semibold"
                    style={{ color: rank.displayColor ?? "#facc15" }}
                  >
                    {rank.rank}.
                  </span>{" "}
                  místě s{" "}
                  <span className="font-semibold">{rank.count}</span> px
                  .
                </span>
              </div>
            )}
            <div className="hidden items-center justify-between gap-2 text-[11px] text-muted-foreground/70 sm:flex">
              <span>Více…</span>
              <ChevronRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </div>
          </div>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-black/10 bg-card/90 p-5 shadow-xl backdrop-blur dark:border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Leaderboard</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalTop.length > 0 && (
              <div className="mt-4 rounded-2xl bg-gradient-to-br from-black/5 via-black/0 to-black/10 p-4 dark:from-white/10 dark:via-white/5 dark:to-white/10">
                <div className="flex items-end justify-center gap-5">
                  {modalTop[1] && (
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-semibold"
                        style={{
                          borderColor: modalTop[1].displayColor,
                          color: modalTop[1].displayColor,
                          backgroundColor: withAlpha(modalTop[1].displayColor, "22"),
                        }}
                      >
                        {initials(modalTop[1].displayName)}
                      </div>
                      <div className="text-center">
                        <div
                          className="text-xs font-semibold"
                          style={{ color: modalTop[1].displayColor }}
                        >
                          {modalTop[1].displayName}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPx(modalTop[1].count)}
                        </div>
                      </div>
                      <div className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-white/10">
                        2
                      </div>
                    </div>
                  )}
                  {modalTop[0] && (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-1 text-amber-400">
                        <Crown className="h-4 w-4" />
                      </div>
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-full border-2 text-base font-semibold"
                        style={{
                          borderColor: modalTop[0].displayColor,
                          color: modalTop[0].displayColor,
                          backgroundColor: withAlpha(modalTop[0].displayColor, "22"),
                        }}
                      >
                        {initials(modalTop[0].displayName)}
                      </div>
                      <div className="text-center">
                        <div
                          className="text-sm font-semibold"
                          style={{ color: modalTop[0].displayColor }}
                        >
                          {modalTop[0].displayName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatPx(modalTop[0].count)}
                        </div>
                      </div>
                      <div className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                        1
                      </div>
                    </div>
                  )}
                  {modalTop[2] && (
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-semibold"
                        style={{
                          borderColor: modalTop[2].displayColor,
                          color: modalTop[2].displayColor,
                          backgroundColor: withAlpha(modalTop[2].displayColor, "22"),
                        }}
                      >
                        {initials(modalTop[2].displayName)}
                      </div>
                      <div className="text-center">
                        <div
                          className="text-xs font-semibold"
                          style={{ color: modalTop[2].displayColor }}
                        >
                          {modalTop[2].displayName}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPx(modalTop[2].count)}
                        </div>
                      </div>
                      <div className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-white/10">
                        3
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {fullLoading ? (
                <div className="text-sm text-muted-foreground">
                  Načítám…
                </div>
              ) : allEntries.length > 0 ? (
                allEntries.map((entry, index) => (
                  <div
                    key={entry.userId}
                    className={`rounded-xl border px-3 py-2 ${
                      entry.userId === viewerId
                        ? "border-primary/40 bg-primary/10"
                        : "border-black/5 bg-background/60 dark:border-white/5"
                    }`}
                  >
                    <LeaderboardRow
                      entry={entry}
                      rank={index + 1}
                      showEmail
                    />
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  Zatím žádní malíři.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
