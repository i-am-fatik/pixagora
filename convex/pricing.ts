export function nextPixelPrice(
  basePrice: number,
  currentPrice: number | undefined,
): number {
  return currentPrice !== undefined ? currentPrice * 2 : basePrice;
}

export function calculateCredits(amountCzk: number): number {
  const amountCents = Math.round(amountCzk * 100);
  if (amountCents < 66600) {
    return Math.floor((amountCents * 11) / 6900);
  }
  return Math.floor((amountCents * 169) / 66600);
}
