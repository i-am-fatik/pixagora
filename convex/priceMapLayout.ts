// ---------------------------------------------------------------------------
// Pure math functions for price map chunk layout.
// Shared between server (priceMapChunks.ts, snapshot.ts) and client (usePriceMap.ts).
// No Convex imports — safe to import from any environment.
// ---------------------------------------------------------------------------

// Target chunk size: ~500KB = 250,000 uint16 values (2 bytes each)
const TARGET_CHUNK_PIXELS = 250_000;

/** How many rows fit in one chunk for a canvas of given width. */
export function rowsPerChunk(canvasWidth: number): number {
  return Math.max(1, Math.floor(TARGET_CHUNK_PIXELS / canvasWidth));
}

/** Total number of chunks needed for the full canvas. */
export function chunkCount(canvasWidth: number, canvasHeight: number): number {
  return Math.ceil(canvasHeight / rowsPerChunk(canvasWidth));
}

/** Which chunk index does row `y` belong to? */
export function chunkIndexForRow(y: number, canvasWidth: number): number {
  return Math.floor(y / rowsPerChunk(canvasWidth));
}

/** Row range for a given chunk index (rowEnd is exclusive). */
export function chunkRowRange(
  chunkIndex: number,
  canvasWidth: number,
  canvasHeight: number,
): { rowStart: number; rowEnd: number } {
  const rpc = rowsPerChunk(canvasWidth);
  const rowStart = chunkIndex * rpc;
  const rowEnd = Math.min(rowStart + rpc, canvasHeight);
  return { rowStart, rowEnd };
}
