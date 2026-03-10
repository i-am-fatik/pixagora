"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Bitcoin,
  ExternalLink,
  Image as ImageIcon,
  MessageCircle,
  Send,
  Settings,
  Smile,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { PixelPreview } from "./PixelPreview";
import { StartovacLogo } from "./StartovacLogo";

type ChatWidgetProps = {
  isLoggedIn: boolean;
  token: string;
  onRequestAuth: () => void;
};

const LAST_READ_KEY = "pixagora-chat-last-read";
const MAX_MESSAGE_LENGTH = 280;
const CHAT_COLORS = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];
const EMOJI_SET = [
  "😀", "😅", "😂", "🙂", "😉", "😍",
  "😎", "🤔", "😴", "😮", "😬", "🙃",
  "👍", "👎", "👏", "🙏", "🤝", "💪",
  "🔥", "✨", "🎉", "💯", "❤️", "🧠",
];
const STARTOVAC_URL = "https://www.startovac.cz/projekty/anarchoagorismus/";
const RESERVED_NICKNAMES = new Set([
  "pixagora",
  "pixagora bot",
  "pixagorabot",
  "admin",
  "moderator",
  "support",
  "system",
]);

function normalizeNicknameForReserved(nickname: string): string {
  return nickname
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isReservedNickname(nickname: string): boolean {
  const normalized = normalizeNicknameForReserved(nickname);
  return RESERVED_NICKNAMES.has(normalized);
}

function formatCzk(amount: number | undefined) {
  if (typeof amount !== "number") {
    return "";
  }
  const rounded = Math.round(amount * 100) / 100;
  let formatted = rounded.toFixed(2);
  formatted = formatted.replace(/\.?0+$/, "");
  return `${formatted} Kč`;
}

function formatTime(ts: number) {
  try {
    const now = Date.now();
    const diffMs = Math.max(0, now - ts);
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) {
      return `${Math.max(1, minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return "";
  }
}

function mapSendError(code?: string) {
  switch (code) {
    case "RATE_LIMIT":
      return "Zpomal. Nádech. Výdech. A zkus to znovu.";
    case "TOO_LONG":
      return "Zpráva je moc dlouhá.";
    case "EMPTY":
      return "Napiš zprávu.";
    case "DUPLICATE":
      return "Tohle už jsi poslal.";
    default:
      return "Nepodařilo se odeslat zprávu.";
  }
}

export function ChatWidget({ isLoggedIn, token, onRequestAuth }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [lastRead, setLastRead] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0;
    }
    const now = Date.now();
    const raw = localStorage.getItem(LAST_READ_KEY);
    const parsed = raw ? Number(raw) : now;
    const safe = Number.isFinite(parsed) ? parsed : now;
    if (!raw) {
      localStorage.setItem(LAST_READ_KEY, String(safe));
    }
    return safe;
  });

  const unread = useQuery(
    api.chat.getUnreadCount,
    lastRead ? { since: lastRead } : "skip",
  );
  const unreadCount = open ? 0 : unread?.count ?? 0;
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  const markRead = (ts: number) => {
    setLastRead(ts);
    localStorage.setItem(LAST_READ_KEY, String(ts));
  };

  const handleToggle = () => {
    setOpen((prev) => {
      if (!prev) {
        markRead(Date.now());
      }
      return !prev;
    });
  };

  return (
    <>
      <div className="fixed bottom-16 right-4 z-40 sm:bottom-[4.5rem]">
        {!open && (
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        )}
        <button
          type="button"
          onClick={handleToggle}
          className="relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-background/70 shadow-lg backdrop-blur transition hover:bg-background/80 dark:border-white/10"
          aria-label="Otevřít chat"
        >
          <MessageCircle className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {unreadLabel}
            </span>
          )}
        </button>
      </div>

      {open && (
        <ChatPanel
          isLoggedIn={isLoggedIn}
          token={token}
          onClose={() => setOpen(false)}
          onRequestAuth={onRequestAuth}
          onRead={markRead}
        />
      )}
    </>
  );
}

function ChatPanel({
  isLoggedIn,
  token,
  onClose,
  onRequestAuth,
  onRead,
}: {
  isLoggedIn: boolean;
  token: string;
  onClose: () => void;
  onRequestAuth: () => void;
  onRead: (ts: number) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.list,
    {},
    { initialNumItems: 20 },
  );
  const messages = useMemo(() => [...results].reverse(), [results]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevScrollHeight = useRef<number | null>(null);
  const prevScrollTop = useRef<number | null>(null);
  const loadingOlder = useRef(false);
  const newestIdRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);

  const sendMessage = useMutation(api.chat.send);
  const profile = useQuery(
    api.chat.getProfile,
    isLoggedIn ? { token } : "skip",
  );
  const updateProfile = useMutation(api.chat.updateProfile);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameColor, setNicknameColor] = useState(CHAT_COLORS[0]);
  const [showEmail, setShowEmail] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [previewCommitId, setPreviewCommitId] = useState<Id<"transactions"> | null>(
    null,
  );
  const [previewAbove, setPreviewAbove] = useState(true);

  const previewData = useQuery(
    api.transactions.getPreview,
    previewCommitId ? { commitId: previewCommitId } : "skip",
  );

  useEffect(() => {
    if (!settingsOpen || !profile) {
      return;
    }
    setNickname(profile.nickname ?? "");
    setNicknameColor(profile.effectiveColor ?? CHAT_COLORS[0]);
    setShowEmail(profile.showEmail ?? false);
  }, [profile, settingsOpen]);

  const nicknameLocked = !!profile?.nickname?.trim();

  useEffect(() => {
    const newestId = messages.length ? messages[messages.length - 1]._id : null;
    const isNewMessage = newestId && newestId !== newestIdRef.current;
    newestIdRef.current = newestId;
    if (
      !isNewMessage ||
      !isAtBottom ||
      loadingOlder.current ||
      prevScrollHeight.current !== null
    ) {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, isAtBottom]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const latest = messages[messages.length - 1];
    if (latest) {
      onRead(latest.createdAt);
    }
  }, [messages, onRead]);

  useEffect(() => {
    if (!previewCommitId) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest("[data-commit-preview]")) {
        return;
      }
      setPreviewCommitId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [previewCommitId]);

  useEffect(() => {
    if (prevScrollHeight.current === null) {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const delta = el.scrollHeight - prevScrollHeight.current;
    const baseScrollTop = prevScrollTop.current ?? el.scrollTop;
    el.scrollTop = baseScrollTop + delta;
    prevScrollHeight.current = null;
    prevScrollTop.current = null;
    loadingOlder.current = false;
  }, [messages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const nearTop = el.scrollTop < 80;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(nearBottom);
    if (nearTop && status === "CanLoadMore") {
      setIsAtBottom(false);
      prevScrollHeight.current = el.scrollHeight;
      prevScrollTop.current = el.scrollTop;
      loadingOlder.current = true;
      loadMore(20);
    }
  };

  const handleSend = async () => {
    if (!isLoggedIn) {
      onRequestAuth();
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed || sending) {
      return;
    }
    setSending(true);
    setEmojiOpen(false);
    setError(null);
    try {
      const res = await sendMessage({ token, text: trimmed });
      if (!res.ok) {
        setError(mapSendError(res.error));
      } else {
        setDraft("");
      }
    } catch {
      setError("Nepodařilo se odeslat zprávu.");
    } finally {
      setSending(false);
    }
  };


  const handleSaveProfile = async () => {
    if (!isLoggedIn) {
      onRequestAuth();
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    if (!nicknameLocked) {
      const trimmed = nickname.normalize("NFKC").trim();
      if (trimmed && isReservedNickname(trimmed)) {
        setProfileSaving(false);
        setProfileError("Tahle přezdívka je vyhrazená.");
        return;
      }
    }
    try {
      const res = await updateProfile({
        token,
        nickname: nicknameLocked ? undefined : nickname,
        nicknameColor,
        showEmail,
      });
      if (!res.ok) {
        if (res.error === "NICK_TOO_LONG") {
          setProfileError("Přezdívka je moc dlouhá.");
        } else if (res.error === "NICK_RESERVED") {
          setProfileError("Tahle přezdívka je vyhrazená.");
        } else if (res.error === "NICK_TAKEN") {
          setProfileError("Tahle přezdívka už existuje.");
        } else if (res.error === "NICK_LOCKED") {
          setProfileError("Přezdívku lze nastavit jen jednou.");
        } else {
          setProfileError("Nepodařilo se uložit profil.");
        }
        return;
      }
      setSettingsOpen(false);
    } catch {
      setProfileError("Nepodařilo se uložit profil.");
    } finally {
      setProfileSaving(false);
    }
  };

  const remaining = MAX_MESSAGE_LENGTH - draft.length;

  const handleEmojiToggle = () => {
    if (!isLoggedIn) {
      onRequestAuth();
      return;
    }
    setEmojiOpen((prev) => !prev);
  };

  const scrollRefForPreview = scrollRef;
  const togglePreview = useCallback((commitId?: Id<"transactions">, buttonEl?: HTMLElement) => {
    if (!commitId) {
      return;
    }
    setPreviewCommitId((prev) => {
      if (prev === commitId) return null;
      if (buttonEl && scrollRefForPreview.current) {
        const scrollRect = scrollRefForPreview.current.getBoundingClientRect();
        const buttonRect = buttonEl.getBoundingClientRect();
        const spaceAbove = buttonRect.top - scrollRect.top;
        setPreviewAbove(spaceAbove >= 180);
      } else {
        setPreviewAbove(true);
      }
      return commitId;
    });
  }, [scrollRefForPreview]);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setDraft((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + emoji.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  useEffect(() => {
    if (!emojiOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (emojiPanelRef.current?.contains(target)) {
        return;
      }
      if (emojiButtonRef.current?.contains(target)) {
        return;
      }
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emojiOpen]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-end p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-black/10 bg-card/95 shadow-2xl backdrop-blur dark:border-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-semibold">Veřejný chat</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!isLoggedIn) {
                  onRequestAuth();
                  return;
                }
                setSettingsOpen(true);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-muted-foreground transition hover:text-foreground dark:border-white/10"
              aria-label="Nastavení profilu"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-muted-foreground transition hover:text-foreground dark:border-white/10"
              aria-label="Zavřít chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!isLoggedIn && (
          <div className="border-b px-4 py-2 text-xs text-muted-foreground">
            Chceš psát do chatu?{" "}
            <button
              type="button"
              onClick={onRequestAuth}
              className="font-semibold text-foreground underline"
            >
              Přihlas se nebo přispěj
            </button>
            .
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-1 overflow-y-auto px-4 py-3 text-sm"
        >
          {status === "LoadingMore" && (
            <div className="text-center text-xs text-muted-foreground">
              Načítám starší zprávy…
            </div>
          )}
          {messages.length === 0 && status !== "Exhausted" && (
            <div className="flex flex-col gap-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1">
                  <div className="h-3 w-16 rounded bg-muted-foreground/10" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 rounded bg-muted-foreground/10" style={{ width: `${40 + (i * 17) % 50}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {messages.map((message, index) => {
            const timeLabel = formatTime(message.createdAt);
            const prevLabel =
              index > 0 ? formatTime(messages[index - 1].createdAt) : null;
            const showTime = timeLabel !== prevLabel;
            const isReward = message.kind === "reward";
            const isCommit = message.kind === "commit";
            const isPreviewOpen =
              !!message.commitId && previewCommitId === message.commitId;
            return (
            <div
              key={message._id}
              className={`relative flex items-start gap-2 rounded-lg px-2 py-1 -mx-2 transition-colors ${
                isPreviewOpen ? "z-30" : ""
              } ${
                isCommit
                  ? "border border-black/5 bg-black/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/8"
                  : isReward
                    ? "bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-cyan-500/10"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              {isCommit ? (
                <div className="flex w-full flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="bg-gradient-to-r from-pink-400 via-yellow-400 to-cyan-400 bg-clip-text font-semibold text-transparent">
                      PixAgora bot
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/90">
                    {message.commitActorName ? (
                      <>
                        <span className="inline-flex items-baseline gap-1 font-semibold">
                          <span>{message.commitActorName}</span>
                          {message.commitActorEmail && (
                            <span className="text-[10px] font-normal text-muted-foreground/60">
                              ({message.commitActorEmail})
                            </span>
                          )}
                        </span>
                        <span>zakreslil(a)</span>
                        <span className="font-semibold">
                          {message.commitPixelCount ?? 0}
                        </span>
                        <span>px.</span>
                      </>
                    ) : (
                      <span>{message.text}</span>
                    )}
                    <div className="relative inline-flex items-center gap-2" data-commit-preview>
                      <button
                        type="button"
                        onClick={(e) => togglePreview(message.commitId, e.currentTarget)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        <ImageIcon className="h-3 w-3" />
                        Náhled
                      </button>
                      {isPreviewOpen && (
                        <div className={`absolute right-0 z-30 rounded-2xl border border-black/10 bg-card/95 p-3 shadow-xl backdrop-blur dark:border-white/10 ${previewAbove ? "bottom-full mb-1" : "top-full mt-1"}`}>
                          {previewData === null ? (
                            <div className="text-xs text-muted-foreground">
                              Náhled není dostupný.
                            </div>
                          ) : previewData?.previewUrl ? (
                            <img
                              src={previewData.previewUrl}
                              alt="Náhled commitu"
                              className="max-w-[200px] max-h-[200px] rounded-lg bg-white"
                              style={{ imageRendering: "pixelated" }}
                            />
                          ) : !previewData?.changes?.length ? (
                            <div className="text-xs text-muted-foreground">
                              Načítám náhled…
                            </div>
                          ) : (
                            <PixelPreview pixels={previewData.changes} />
                          )}
                        </div>
                      )}
                    </div>
                    {showTime && (
                      <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/60">
                        {timeLabel}
                      </span>
                    )}
                  </div>
                </div>
              ) : isReward ? (
                <>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="bg-gradient-to-r from-pink-400 via-yellow-400 to-cyan-400 bg-clip-text text-xs font-semibold text-transparent">
                        PixAgora bot
                      </span>
                      {showTime && (
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/60">
                          {timeLabel}
                        </span>
                      )}
                    </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-foreground/90">
                    <span className="inline-flex items-baseline gap-1 font-semibold">
                      <span>{message.rewardDisplayName ?? "Anonym"}</span>
                      {message.rewardDisplayEmail && (
                        <span className="text-[10px] font-normal text-muted-foreground/60">
                          ({message.rewardDisplayEmail})
                        </span>
                      )}
                    </span>
                    <span>podpořil(a) projekt přes</span>
                    {message.rewardSource === "btcpay" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Bitcoin className="h-3 w-3 text-amber-400" />
                        BTCPay
                      </span>
                    ) : (
                      <a
                        href={STARTOVAC_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        <StartovacLogo className="h-3.5 w-auto" />
                        Startovač
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                      <span>částkou</span>
                      <span className="font-semibold">
                        {formatCzk(message.rewardAmountCzk)}
                      </span>
                      {message.rewardName && (
                        <span className="text-[10px] text-muted-foreground/70">
                          ({message.rewardName})
                        </span>
                      )}
                      <span>a získal(a)</span>
                      <span className="font-semibold">
                        {message.rewardCreditsDelta ?? 0}
                      </span>
                      <span>kreditů.</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <span className="shrink-0 text-xs font-semibold">
                    <span style={{ color: message.authorColor }}>
                      {message.authorName}
                    </span>
                    {message.authorEmail && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">
                        ({message.authorEmail})
                      </span>
                    )}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-end gap-2">
                      <p className="flex-1 break-words">{message.text}</p>
                      {showTime && (
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/60">
                          {timeLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
          })}
          {messages.length === 0 && status === "Exhausted" && (
            <div className="text-center text-xs text-muted-foreground">
              Zatím žádné zprávy.
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                isLoggedIn ? "Napiš zprávu…" : "Přihlas se pro psaní…"
              }
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-black/10 bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary dark:border-white/10"
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={!isLoggedIn}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="relative flex items-center gap-2">
              <button
                ref={emojiButtonRef}
                type="button"
                onClick={handleEmojiToggle}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-background/70 text-muted-foreground transition hover:text-foreground dark:border-white/10"
                aria-label="Vložit emoji"
              >
                <Smile className="h-4 w-4" />
              </button>
              {emojiOpen && (
                <div
                  ref={emojiPanelRef}
                  className="absolute bottom-14 right-0 z-20 grid w-[240px] grid-cols-6 gap-1 rounded-2xl border border-black/10 bg-card/95 p-2 shadow-lg backdrop-blur dark:border-white/10"
                >
                  {EMOJI_SET.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        insertEmoji(emoji);
                        setEmojiOpen(false);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition hover:bg-black/5 dark:hover:bg-white/5"
                      aria-label={`Emoji ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <Button
                onClick={handleSend}
                disabled={!isLoggedIn || sending || draft.trim().length === 0}
                className="h-11 w-11 rounded-full p-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{error ?? ""}</span>
            <span>{remaining}</span>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nastavení chatu</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full p-1 text-muted-foreground transition hover:text-foreground"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Přezdívka
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Anonymous"
                className="w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-primary dark:border-white/10"
                maxLength={32}
                disabled={nicknameLocked}
              />
              {nicknameLocked && (
                <p className="text-[11px] text-muted-foreground">
                  Přezdívku lze nastavit jen jednou.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showEmail}
                onChange={(event) => setShowEmail(event.target.checked)}
                className="h-4 w-4 rounded border border-black/10 bg-background dark:border-white/10"
              />
              Zobrazit email v chatu
            </label>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Barva přezdívky
              </label>
              <div className="flex flex-wrap gap-2">
                {CHAT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNicknameColor(color)}
                    className={`h-7 w-7 rounded-full border ${nicknameColor === color ? "ring-2 ring-primary" : ""}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Barva ${color}`}
                  />
                ))}
              </div>
            </div>
            {profileError && (
              <p className="text-xs text-destructive">{profileError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="flex-1"
              >
                Uložit
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSettingsOpen(false)}
              >
                Zrušit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
