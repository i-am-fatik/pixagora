export function nextPixelPrice(
  basePrice: number,
  currentPrice: number | undefined,
): number {
  return currentPrice !== undefined ? currentPrice * 2 : basePrice;
}
