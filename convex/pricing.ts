export function nextPixelPrice(
  basePrice: number,
  currentPrice: number | undefined,
): number {
  return currentPrice !== undefined ? currentPrice * 2 : basePrice;
}

export function calculateCredits(amountCzk: number): number {
  if (amountCzk < 666) {
    return Math.floor(amountCzk * (11 / 69));
  }
  return Math.floor(amountCzk * (169 / 666));
}
