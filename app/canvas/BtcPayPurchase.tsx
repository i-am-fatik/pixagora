"use client";

import { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";

declare global {
  interface Window {
    btcpay?: {
      showInvoice: (invoiceId: string) => void;
      onModalWillLeave: () => void;
      onModalReceiveMessage: (handler: (event: MessageEvent) => void) => void;
      hideFrame: () => void;
    };
  }
}

type BtcPayPurchaseProps = {
  open: boolean;
  onClose: () => void;
};

export function BtcPayPurchase({ open, onClose }: BtcPayPurchaseProps) {
  const [email, setEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const createInvoice = useAction(api.btcpay.createInvoice);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      // Preload BTCPay script
      const scriptId = "btcpay-modal-js";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `${process.env.NEXT_PUBLIC_BTCPAY_URL}/modal/btcpay.js`;
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, [open]);

  const handleBtcPayEvent = (event: MessageEvent) => {
    console.log("BTCPay event:", event.data);
    if (event.data === "loaded") {
      setShowOverlay(true);
    } else if (event.data.status === "Settled") {
      setShowOverlay(false);
      setTimeout(() => window.btcpay!.hideFrame(), 1000);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const { invoiceId, checkoutLink } = await createInvoice({
        email,
        redirectUrl: window.location.href,
      });
      if (window.btcpay) {
        setInvoiceOpen(true);
        window.btcpay.showInvoice(invoiceId);
        window.btcpay.onModalReceiveMessage(handleBtcPayEvent);
        window.btcpay.onModalWillLeave = () => {
          onClose();
        };
      } else if (checkoutLink) {
        window.location.href = checkoutLink;
      } else {
        throw new Error("Failed to open BTCPay invoice");
      }
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to create invoice");
      setIsCreating(false);
    }
  };

  if (!open) {
    return null;
  }

  if (showOverlay) {
    return (
      <div className="fixed inset-0 z-[3000] flex pt-6 items-start justify-center pointer-events-none">
        <div className="bg-white text-black text-center text-sm shadow-lg px-6 py-4 rounded-xl font-medium pointer-events-auto max-w-md">
          <h2 className="text-xl">Přispěj kolik chceš</h2>
          <p className="pt-2">Cena za 1 ktedit je 10 Kč</p>
          <p className="pt-2">Pokud pošleš více než 1000 Kč, tak můžeš překreslovat už použité pixely.</p>
        </div>
      </div>
    );
  }

  if (invoiceOpen) {
    return null;
  }

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
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Zadej e-mail</h2>
            <p className="text-sm text-muted-foreground">
              Pro možnost se později přihlásit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email..."
            autoComplete="email"
            required
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isCreating || !email} className="flex-1">
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Připravuji invoice...
                </>
              ) : (
                "Pokračovat k platbě"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
