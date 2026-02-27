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
  if (amountCzk < 666) {
    return Math.floor(amountCzk / (69 / 11));
  }
  return Math.floor(amountCzk / (666 / 169));
}
