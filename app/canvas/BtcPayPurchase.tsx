"use client";

import { useState, useEffect, useRef } from "react";
import * as React from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { calculateCredits } from "../../convex/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X, Check, Ban } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

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
  prefillEmail?: string | null;
  totalPaidCzk?: number;
  onClose: () => void;
};

export function BtcPayPurchase({
  open,
  prefillEmail,
  totalPaidCzk = 0,
  onClose,
}: BtcPayPurchaseProps) {
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [amountCzk, setAmountCzk] = useState(666);
  const [isCreating, setIsCreating] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [, setScriptReady] = useState(false);
  const createInvoice = useAction(api.btcpay.createInvoice);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const credits = calculateCredits(amountCzk);
  const currentTotal = totalPaidCzk + amountCzk;
  const canOverwrite = currentTotal >= 666;
  const betterPrice = amountCzk >= 666;

  const handleClose = () => {
    setInvoiceOpen(false);
    setIsCreating(false);
    setScriptReady(false);
    try {
      window.btcpay?.hideFrame?.();
    } catch {
      // Ignore errors when hiding frame (e.g. if already removed)
    }
    onClose();
  };

  useEffect(() => {
    if (open) {
      // Preload BTCPay script
      const scriptId = "btcpay-modal-js";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `${process.env.NEXT_PUBLIC_BTCPAY_URL}/modal/btcpay.js`;
        script.async = true;
        script.onload = () => setScriptReady(true);
        document.body.appendChild(script);
      } else if (window.btcpay) {
        setScriptReady(true);
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setInvoiceOpen(false);
      setIsCreating(false);
      setScriptReady(false);
      return;
    }
    if (prefillEmail) {
      setEmail(prefillEmail);
    }
  }, [open, prefillEmail]);

  const waitForBtcPay = () =>
    new Promise<boolean>((resolve) => {
      if (window.btcpay) {
        resolve(true);
        return;
      }
      const start = Date.now();
      const interval = window.setInterval(() => {
        if (window.btcpay) {
          window.clearInterval(interval);
          resolve(true);
          return;
        }
        if (Date.now() - start > 1500) {
          window.clearInterval(interval);
          resolve(false);
        }
      }, 50);
    });

  const handleBtcPayEvent = (event: MessageEvent) => {
    console.log("BTCPay event:", event.data);
    if (event.data.status === "Settled") {
      setTimeout(() => {
        try {
          window.btcpay?.hideFrame?.();
        } catch {
          // Ignore errors
        }
      }, 1000);
    }
  };

  const startInvoice = async (emailValue: string) => {
    if (!emailValue || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const { invoiceId, checkoutLink } = await createInvoice({
        email: emailValue,
        redirectUrl: window.location.href,
        amount: amountCzk,
      });
      const ready = window.btcpay ? true : await waitForBtcPay();
      if (ready && window.btcpay) {
        setInvoiceOpen(true);
        window.btcpay.showInvoice(invoiceId);
        window.btcpay.onModalReceiveMessage(handleBtcPayEvent);
        window.btcpay.onModalWillLeave = () => {
          handleClose();
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await startInvoice(email);
  };

  if (!open) {
    return null;
  }

  if (invoiceOpen) {
    return null;
  }

  const hideEmailForm = Boolean(prefillEmail?.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
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
            <h2 className="text-xl font-semibold">Dobít kredity</h2>
            <p className="text-sm text-muted-foreground">
              Vyber si množství kreditů.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 py-2">
          <div className="space-y-4">
            <div className="flex justify-between text-sm font-medium">
              <span>{credits} kreditů</span>
              <span>{amountCzk} Kč</span>
            </div>
            <Slider
              min={69}
              max={1332}
              step={1}
              value={[amountCzk]}
              onValueChange={(value) => setAmountCzk(value[0])}
            />
          </div>

          <div className="space-y-2 text-sm">
            <div
              className={cn(
                "flex items-center gap-2",
                canOverwrite ? "text-foreground" : "text-muted-foreground/50"
              )}
            >
              {canOverwrite ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              <span className={cn(!canOverwrite && "line-through")}>
                Možnost překreslovat pixely
              </span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2",
                betterPrice ? "text-foreground" : "text-muted-foreground/50"
              )}
            >
              {betterPrice ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              <span className={cn(!betterPrice && "line-through")}>
                Výhodnější cena při nákupu min 169 kreditů
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!hideEmailForm && (
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  E-mail pro potvrzení
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tvuj@email.cz"
                  autoComplete="email"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Pro možnost se později přihlásit
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isCreating || !email}
              className="w-full"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Připravuji platbu...
                </>
              ) : (
                `Zaplatit ${amountCzk} Kč`
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
