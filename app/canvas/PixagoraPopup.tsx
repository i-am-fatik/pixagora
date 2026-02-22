"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

const STARTOVAC_URL = "https://www.startovac.cz/projects/anarchoagorismus";

type PixagoraPopupProps = {
  open: boolean;
  onClose: () => void;
  mode: "anonymous" | "buy-credits";
  onOpenBtcPay: () => void;
};

type Status = "idle" | "sending" | "sent" | "error";

export function PixagoraPopup({ open, onClose, mode, onOpenBtcPay }: PixagoraPopupProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [devLoginUrl, setDevLoginUrl] = useState<string | null>(null);
  const isSendingRef = useRef(false);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    setEmail("");
    setStatus("idle");
    setErrorMsg("");
    setDevLoginUrl(null);
    onClose();
  };

  const handleSendLink = async () => {
    const trimmed = email.trim();
    if (!trimmed || isSendingRef.current) {
      return;
    }
    isSendingRef.current = true;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "USER_NOT_FOUND") {
          throw new Error("K emailu zatím neevidujeme příspěvek. Podpoř projekt skrz odměnu s kredity pomocí odkazů výše.");
        }
        throw new Error(data.error ?? "Nepodařilo se odeslat email");
      }
      if (data.devLoginUrl) {
        setDevLoginUrl(data.devLoginUrl);
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Nepodařilo se odeslat email");
    } finally {
      isSendingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start justify-between">
              <h2 className="text-xl font-semibold">
                {mode === "anonymous" ? "Začni kreslit" : "Potřebuješ kredity"}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
                aria-label="Zavřít"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {mode === "anonymous" && (
              <p className="text-sm text-muted-foreground">
                Pixagora je společné plátno. Podpoř projekt a získej kredity na
                malování.
              </p>
            )}
            {mode === "buy-credits" && (
              <p className="text-sm text-muted-foreground">
                Na malování nemáš dost kreditů. Ale můžeš si je dobít:
              </p>
            )}

            <div className="flex flex-col gap-2">
              <a
                href={STARTOVAC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Podpořit na Startovači
              </a>
              <button
                type="button"
                onClick={onOpenBtcPay}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Zaplatit Bitcoinem
              </button>
            </div>

            {mode === "anonymous" && (
              <>
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 border-t" />
                  <span className="text-xs text-muted-foreground">
                    nebo se přihlásit
                  </span>
                  <div className="flex-1 border-t" />
                </div>

                {status === "sent" ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                      Odkaz jsme ti poslali na{" "}
                      <strong>{email.trim()}</strong>. Zkontroluj svou schránku.
                    </div>
                    {devLoginUrl && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        <span className="font-medium">[DEV]</span>{" "}
                        <a href={devLoginUrl} className="underline break-all">
                          {devLoginUrl}
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
                      placeholder="tvuj@email.cz"
                      disabled={status === "sending"}
                    />
                    {status === "error" && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-foreground">
                        {errorMsg}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      onClick={handleSendLink}
                      disabled={!email.trim() || status === "sending"}
                      className="w-full"
                    >
                      {status === "sending" ? "Odesílám…" : "Odeslat odkaz"}
                    </Button>
                  </>
                )}
              </>
            )}
      </div>
    </div>
  );
}
