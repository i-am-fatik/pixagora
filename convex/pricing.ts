export const OWNERSHIP_CONFLICT_MSG = "OWNERSHIP_CONFLICT";

export function nextPixelPrice(
  basePrice: number,
  currentPrice: number | undefined,
): number {
  return currentPrice !== undefined ? currentPrice * 2 : basePrice;
}

export function calculateCredits(amountCzk: number): number {
  if (amountCzk < 69) {
    return 0; // Donated money under allowed limit, should not be possible without request manipulation
  }
  if (amountCzk < 669) {
    return Math.floor(amountCzk / (69 / 222));
  }
  return Math.floor(amountCzk / (669 / 4444));
}
