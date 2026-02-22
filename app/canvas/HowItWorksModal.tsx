"use client";

import { X } from "lucide-react";

type HowItWorksModalProps = {
  open: boolean;
  onClose: () => void;
  onOpenBtcPay: () => void;
};

export function HowItWorksModal({
  open,
  onClose,
  onOpenBtcPay,
}: HowItWorksModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Jak to funguje?</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Pixagora</strong> je společné
            plátno, kde každý pixel má svou cenu.
          </p>
          <p>
            Kredity získáš podpořením projektu na{" "}
            <a
              href="https://www.startovac.cz/projects/anarchoagorismus"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground hover:underline"
            >
              Startovači
            </a>{" "}
            nebo přes{" "}
            <button
              type="button"
              onClick={onOpenBtcPay}
              className="font-bold text-foreground hover:underline"
            >
              Bitcoin
            </button>
            .
          </p>
          <p>
            Základní cena pixelu je{" "}
            <strong className="text-foreground">1 kredit</strong>.
          </p>
          <p>
            Přemalování cizího pixelu stojí{" "}
            <strong className="text-foreground">2× tolik</strong>, co zaplatil
            předchozí autor.
          </p>
          <p>
            Více informací o kampani získáš na{" "}
            <a
              href="https://kniha.urza.cz"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground hover:underline"
            >
              kniha.urza.cz
            </a>{" "}
            a na{" "}
            <a
              href="https://www.startovac.cz/projects/anarchoagorismus"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground hover:underline"
            >
              Startovači
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
