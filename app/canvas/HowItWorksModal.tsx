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
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-lg"
      >
        <div className="flex items-start justify-between px-6 pt-6">
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

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-6 pb-6 text-sm text-muted-foreground sm:max-h-[calc(100vh-8rem)]">
          <p>
            <strong className="text-foreground">24. února</strong> se zrodila
            PixAgora – společné plátno, kde každý pixel má svou cenu. Hrajte si,
            tvořte a podpořte myšlenky svobody; hotové dílo otiskneme přímo v knize.
          </p>
          <p>
            Pro aktuální obrázek o rozměrech{" "}
            <strong className="text-foreground">110 × 169 px</strong> můžete za{" "}
            <strong className="text-foreground">69 Kč</strong> koupit{" "}
            <strong className="text-foreground">222 pixelů</strong> nebo za{" "}
            <strong className="text-foreground">669 Kč</strong>{" "}
            <strong className="text-foreground">4444 pixelů</strong>; odměny lze
            kombinovat i kupovat opakovaně.
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
            . Po nákupu na Startovači může trvat až 5 minut, než se kredity připíšou; při nákupu bitcoinem se připíší hned po potvrzení transakce.
          </p>
          <p>
            Kdo zakoupí <strong className="text-foreground">4444 pixelů za 669 Kč</strong>, může přebarvovat již obarvené pixely (za exponenciálně rostoucí cenu, takže to není levné). Smyslem není mazat cizí díla – prosím respektujte ostatní autory – ale možnost větších přispěvatelů korigovat případné trolly. Když nevychází místo na větší dílo a v cestě stojí něco malého, můžete jej přepsat nebo posunout (vytvořit vedle); hra obsahuje chat, takže spolupráce je snadná.
          </p>
          <p>
            Obrázek v knize může vypadat trošičku jinak v závislosti na možnostech tisku. Neslibujeme, jak budou vypadat další stránky ani kdy a zda je otevřeme, protože to záleží na okolnostech, které teď nejdou předvídat.
          </p>
          <p>
            Pokud bude docházet místo, plátno uzamkneme a vytvoříme nové prázdné (v knize jich může být i víc). Rádi bychom nechali hru běžet až do konce kampaně, ale nemůžeme to slíbit – i když to očekáváme. V závislosti na možnostech tisku možná přijde i větší či barevná verze (spíš ne).
          </p>
          <p>
            Více informací o kampani najdeš na{" "}
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
            Tvořte s ♥️ a ohleduplností.
          </p>
        </div>
      </div>
    </div>
  );
}
