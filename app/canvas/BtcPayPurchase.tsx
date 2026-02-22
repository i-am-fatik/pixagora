"use client";

import { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    btcpay?: {
      showInvoice: (invoiceId: string) => void;
      onModalWillLeave: () => void;
      onModalReceiveMessage: (event: any) => void;
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

  const handleBtcPayEvent = (event: any) => {
    console.log("BTCPay event:", event.data);
    if (event.data === "loaded") {
      // TODO: show help text
    }
    else if (event.data.status === "Settled") {
      setTimeout(() => window.btcpay!.hideFrame(), 1000)
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || isCreating) return;

    setIsCreating(true);
    try {
      const { invoiceId, checkoutLink } = await createInvoice({
        email,
        redirectUrl: window.location.href,
      });
      if (window.btcpay) {
        window.btcpay.showInvoice(invoiceId);
        window.btcpay.onModalReceiveMessage(handleBtcPayEvent);
        onClose();
      } else if (checkoutLink) {
        window.location.href = checkoutLink;
      } else {
        throw new Error("Failed to open BTCPay invoice");
      }
    } catch (error: any) {
      alert(error?.message || "Failed to create invoice");
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Zadej e-mail</h2>
          <p className="text-sm text-muted-foreground">
            Pro možnost se později přihlásit
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email..."
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
            <Button variant="secondary" onClick={onClose} disabled={isCreating}>
              Zavřít
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
