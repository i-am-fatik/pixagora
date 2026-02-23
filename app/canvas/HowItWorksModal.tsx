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

  const badgeClass =
    "font-semibold text-foreground/90 transition hover:text-foreground underline";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
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
            <strong className="text-foreground">PixAgora</strong> je společné
            plátno, kde každý pixel má svou cenu.
          </p>
          <p>
            Kredity získáte podpořením projektu na{" "}
            <a
              href="https://www.startovac.cz/projects/anarchoagorismus"
              target="_blank"
              className={badgeClass}
            >
              Startovači
            </a>{" "}
            (kartou nebo převodem) nebo přes{" "}
            <button
              type="button"
              onClick={onOpenBtcPay}
              className={badgeClass}
            >
              BTCPay (Bitcoin on-chain i lightning)
            </button>
            .
          </p>
          <p>
            Základní cena pixelu je{" "}
            <strong className="text-foreground">1 kredit</strong>.
            Přemalování cizího pixelu stojí{" "}
            <strong className="text-foreground">2× tolik</strong>, co zaplatil
            předchozí autor a je potřeba nakoupit kredity alespoň za 666 Kč.
          </p>
          <p>
            Po nákupu na Startovači může trvat až 5 minut než se kredity připíšou.
            Při nákupu bitcoinem se připíší hned po potvrzení transakce.
          </p>
          <p>
            Negarantujeme tisknutelnost, je možné že to na papíru v knize bude vypadat jinak než se zdá tady.
            Neslibujeme jak budou vypadat další stránky ani kdy a jestli je otevřeme, protože to záleží na spoustě okolnostech které teď nejdou předvídat.
          </p>
          <p>
            Více informací o kampani získáš na{" "}
            <a
              href="https://kniha.urza.cz"
              target="_blank"
              className={badgeClass}
            >
              kniha.urza.cz
            </a>{" "}
            a na{" "}
            <a
              href="https://www.startovac.cz/projects/anarchoagorismus"
              target="_blank"
              className={badgeClass}
            >
              Startovači
            </a>
            .
          </p>
          <p>
            Aplikaci vytvořili{" "}
            <a href="https://x.com/honzapoboril/" target="_blank" className={badgeClass}>Honza Pobořil</a>,
            ,
            a
          </p>
          <p>
            Tvořte s ♥️ a ohleduplností.
          </p>
        </div>
      </div>
    </div>
  );
}
