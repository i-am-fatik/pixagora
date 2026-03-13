"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { nextPixelPrice, OWNERSHIP_CONFLICT_MSG } from "./pricing";

// ---------------------------------------------------------------------------
// Binary pixel format: 7 bytes per pixel
//   [x: uint16 LE] [y: uint16 LE] [r: uint8] [g: uint8] [b: uint8]
// ---------------------------------------------------------------------------
const BYTES_PER_PIXEL = 7;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const UPSERT_BATCH_SIZE = 400;
const UPSERT_PARALLELISM = 10;
const FINALIZE_CHUNK_SIZE = 3000;

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Retry helper: retries on transient Convex timeout errors
// ---------------------------------------------------------------------------
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("TimeoutError") || msg.includes("timed out");
      if (!isTimeout || attempt === MAX_RETRIES) {
        throw err;
      }
      console.warn(`[${label}] Attempt ${attempt}/${MAX_RETRIES} timed out, retrying...`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// Fetch blob from storage via V8 runtime query + fetch with URL fix.
// Self-hosted Convex Node.js actions can't access storage directly.
// ---------------------------------------------------------------------------
function fixStorageUrl(url: string): string {
  const override = process.env.CONVEX_STORAGE_URL;
  if (!override) {return url;}
  try {
    const u = new URL(url);
    const base = new URL(override);
    u.protocol = base.protocol;
    u.host = base.host;
    return u.toString();
  } catch {
    return url;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchStorageBlob(ctx: any, storageId: Id<"_storage">): Promise<ArrayBuffer | null> {
  // Get URL from V8 runtime query (bypasses broken Node.js storage routing)
  const url: string | null = await ctx.runQuery(internal.pixels.getStorageBlobUrl, { storageId });
  if (!url) {return null;}
  const fixedUrl = fixStorageUrl(url);
  console.log("[fetchStorageBlob] original:", url, "fixed:", fixedUrl);
  const res = await fetch(fixedUrl);
  if (!res.ok) {
    console.error("[fetchStorageBlob] fetch failed:", res.status);
    return null;
  }
  return await res.arrayBuffer();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPriceMap(ctx: any, canvasId: Id<"canvases">, W: number, H: number): Promise<Uint16Array> {
  const priceMap = new Uint16Array(W * H);
  const chunks = await ctx.runQuery(api.priceMapChunks.getChunksForCanvas, { canvasId });
  for (const chunk of chunks) {
    const src = new Uint16Array(chunk.data);
    priceMap.set(src, chunk.rowStart * W);
  }
  return priceMap;
}

function decodePixelBlob(
  buffer: ArrayBuffer,
): { x: number; y: number; color: string }[] {
  const view = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / BYTES_PER_PIXEL);
  const pixels: { x: number; y: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * BYTES_PER_PIXEL;
    const x = view.getUint16(offset, true);
    const y = view.getUint16(offset + 2, true);
    const r = view.getUint8(offset + 4);
    const g = view.getUint8(offset + 5);
    const b = view.getUint8(offset + 6);
    const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    pixels.push({ x, y, color });
  }
  return pixels;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function nearestColor(color: string, palette: string[]): string {
  const [r, g, b] = parseHex(color);
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const [pr, pg, pb] = parseHex(c);
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Minimal uncompressed PNG encoder (no dependencies).
// ---------------------------------------------------------------------------
function encodePngUncompressed(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const rowLen = 1 + w * 4;
  const rawLen = h * rowLen;
  const MAX_BLOCK = 65535;
  const numBlocks = Math.ceil(rawLen / MAX_BLOCK);
  const deflateLen = rawLen + numBlocks * 5 + 6;
  const deflate = new Uint8Array(deflateLen);
  let dp = 0;
  deflate[dp++] = 0x78;
  deflate[dp++] = 0x01;
  const raw = new Uint8Array(rawLen);
  for (let y = 0; y < h; y++) {
    const rowOff = y * rowLen;
    raw[rowOff] = 0;
    const srcOff = y * w * 4;
    raw.set(rgba.subarray(srcOff, srcOff + w * 4), rowOff + 1);
  }
  for (let i = 0; i < rawLen; i += MAX_BLOCK) {
    const remaining = rawLen - i;
    const blockLen = Math.min(remaining, MAX_BLOCK);
    const isLast = i + blockLen >= rawLen;
    deflate[dp++] = isLast ? 0x01 : 0x00;
    deflate[dp++] = blockLen & 0xff;
    deflate[dp++] = (blockLen >> 8) & 0xff;
    deflate[dp++] = ~blockLen & 0xff;
    deflate[dp++] = (~blockLen >> 8) & 0xff;
    deflate.set(raw.subarray(i, i + blockLen), dp);
    dp += blockLen;
  }
  let a = 1, b = 0;
  for (let i = 0; i < rawLen; i++) {
    a = (a + raw[i]) % 65521;
    b = (b + a) % 65521;
  }
  deflate[dp++] = (b >> 8) & 0xff;
  deflate[dp++] = b & 0xff;
  deflate[dp++] = (a >> 8) & 0xff;
  deflate[dp++] = a & 0xff;
  const idatData = deflate.subarray(0, dp);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;}
    crcTable[n] = c;
  }
  function crc32(buf: Uint8Array, start: number, len: number): number {
    let c = 0xffffffff;
    for (let i = start; i < start + len; i++) {c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);}
    return (c ^ 0xffffffff) >>> 0;
  }
  const pngLen = 8 + (12 + 13) + (12 + idatData.length) + 12;
  const png = new Uint8Array(pngLen);
  const view = new DataView(png.buffer);
  let p = 0;
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  p = 8;
  view.setUint32(p, 13); p += 4;
  const ihdrStart = p;
  png.set([73, 72, 68, 82], p); p += 4;
  view.setUint32(p, w); p += 4;
  view.setUint32(p, h); p += 4;
  png[p++] = 8;
  png[p++] = 6;
  png[p++] = 0;
  png[p++] = 0;
  png[p++] = 0;
  view.setUint32(p, crc32(png, ihdrStart, 17)); p += 4;
  view.setUint32(p, idatData.length); p += 4;
  const idatStart = p;
  png.set([73, 68, 65, 84], p); p += 4;
  png.set(idatData, p); p += idatData.length;
  view.setUint32(p, crc32(png, idatStart, 4 + idatData.length)); p += 4;
  view.setUint32(p, 0); p += 4;
  const iendStart = p;
  png.set([73, 69, 78, 68], p); p += 4;
  view.setUint32(p, crc32(png, iendStart, 4)); p += 4;
  return png;
}

// ---------------------------------------------------------------------------
// Generate preview PNG from pixel list (in-memory, no DB)
// ---------------------------------------------------------------------------
function generatePreviewPng(
  pixels: Iterable<{ x: number; y: number; color: string }>,
): Uint8Array {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const arr: { x: number; y: number; color: string }[] = [];
  for (const px of pixels) {
    arr.push(px);
    if (px.x < minX) {minX = px.x;}
    if (px.y < minY) {minY = px.y;}
    if (px.x > maxX) {maxX = px.x;}
    if (px.y > maxY) {maxY = px.y;}
  }
  const pw = maxX - minX + 1;
  const ph = maxY - minY + 1;
  const rgba = new Uint8Array(pw * ph * 4);
  for (const c of arr) {
    const [cr, cg, cb] = parseHex(c.color);
    const idx = ((c.y - minY) * pw + (c.x - minX)) * 4;
    rgba[idx] = cr;
    rgba[idx + 1] = cg;
    rgba[idx + 2] = cb;
    rgba[idx + 3] = 255;
  }
  return encodePngUncompressed(pw, ph, rgba);
}

type ValidationOk = {
  error: null;
  userId: Id<"users">;
  canvasWidth: number;
  canvasHeight: number;
  basePrice: number;
  enforceColors: boolean;
  palette: string[];
  totalPaidCzk: number;
  credits: number;
  nickname: string;
  showEmail: boolean;
  email: string;
};

type ValidationError = {
  error: string;
  requiredCzk?: number;
  totalPaidCzk?: number;
};

// ---------------------------------------------------------------------------
// Action: commit pixels from an uploaded binary blob
//
// Uses per-pixel point lookups via upsertPixelBatch for all users.
// When the user can't overwrite (totalPaidCzk < 666), a pre-flight
// ownership check and mutation-level ownership validation are enabled.
// ---------------------------------------------------------------------------
export const commitFromBlob = action({
  args: {
    token: v.string(),
    canvasId: v.id("canvases"),
    storageId: v.id("_storage"),
    expectedCost: v.optional(v.number()),
  },
  handler: async (ctx, { token, canvasId, storageId, expectedCost }): Promise<
    | { error: string; totalCost?: number; balance?: number; requiredCzk?: number; totalPaidCzk?: number; pixelCount?: number }
    | { error: null; totalCost: number; committed: number; remaining: number }
  > => {
    // =========== Phase A: Gather data ===========

    // A1: Download and decode the pixel blob (via V8 query + fetch workaround)
    const blobBuffer = await fetchStorageBlob(ctx, storageId);
    if (!blobBuffer) {throw new Error("Pixel blob not found in storage");}
    const rawPixels = decodePixelBlob(blobBuffer);
    await ctx.runMutation(internal.pixels.deleteStorageBlob, { storageId });

    if (rawPixels.length === 0) {throw new Error("No pixels in blob");}

    // A2: Pre-validate user, canvas, permissions, credits
    const validation: ValidationOk | ValidationError = await ctx.runQuery(
      internal.pixels.preValidateCommit,
      { token, canvasId },
    );
    if (validation.error) {return validation as ValidationError;}
    const v_ = validation as ValidationOk;

    // A3: Deduplicate & validate BEFORE fetching
    const deduped = new Map<string, { x: number; y: number; color: string }>();
    const allowedColors = v_.enforceColors
      ? new Set(v_.palette.map((c) => c.toLowerCase()))
      : null;
    for (const px of rawPixels) {
      if (!Number.isInteger(px.x) || px.x < 0 || px.x >= v_.canvasWidth) {continue;}
      if (!Number.isInteger(px.y) || px.y < 0 || px.y >= v_.canvasHeight) {continue;}
      if (!HEX_COLOR_RE.test(px.color)) {continue;}

      let color = px.color;
      if (allowedColors && !allowedColors.has(color.toLowerCase())) {
        color = nearestColor(color, v_.palette);
      }
      deduped.set(`${px.x},${px.y}`, { x: px.x, y: px.y, color });
    }

    if (deduped.size === 0) {
      return { error: null, totalCost: 0, committed: 0, remaining: v_.credits };
    }

    const canOverwrite = v_.totalPaidCzk >= 666;
    return executeCommit(ctx, canvasId, deduped, v_, canOverwrite, expectedCost);
  },
});

// ---------------------------------------------------------------------------
// Unified commit: per-pixel point lookups via upsertPixelBatch for all users.
// When canOverwrite=false (totalPaidCzk < 666), runs a pre-flight ownership
// check and enables ownership validation inside each upsert mutation.
// ---------------------------------------------------------------------------
async function executeCommit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  canvasId: Id<"canvases">,
  deduped: Map<string, { x: number; y: number; color: string }>,
  v_: ValidationOk,
  canOverwrite: boolean,
  expectedCost?: number,
): Promise<
  | { error: string; totalCost?: number; balance?: number; requiredCzk?: number; totalPaidCzk?: number; pixelCount?: number }
  | { error: null; totalCost: number; committed: number; remaining: number }
> {
  // --- Pre-checks using priceMap (no DB pixel scans) ---
  const lowerBound = v_.basePrice * deduped.size;
  if (v_.credits < lowerBound) {
    return { error: "NOT_ENOUGH_CREDITS", totalCost: lowerBound, balance: v_.credits };
  }

  // Load priceMap when needed: for !canOverwrite cost/ownership checks,
  // or for expectedCost price-change detection.
  const needsPriceMap = !canOverwrite || expectedCost !== undefined;
  let estimatedCost: number | undefined;
  if (needsPriceMap) {
    try {
      const priceMap = await loadPriceMap(ctx, canvasId, v_.canvasWidth, v_.canvasHeight);
      estimatedCost = 0;
      for (const [, px] of deduped) {
        const mapPrice = priceMap[px.y * v_.canvasWidth + px.x];
        estimatedCost += nextPixelPrice(v_.basePrice, mapPrice > 0 ? mapPrice : undefined);
      }

      // Price-change detection: compare server estimate with client's expectedCost
      if (expectedCost !== undefined && estimatedCost !== expectedCost) {
        return { error: "PRICE_CHANGED", totalCost: estimatedCost, balance: v_.credits };
      }

      // Credit sufficiency check (more accurate than lowerBound)
      if (!canOverwrite && estimatedCost > v_.credits) {
        return { error: "NOT_ENOUGH_CREDITS", totalCost: estimatedCost, balance: v_.credits };
      }
    } catch (err) {
      console.warn("[executeCommit] priceMap pre-check failed, proceeding:", err);
    }
  }

  // For users who can't overwrite: run pre-flight ownership check
  if (!canOverwrite) {
    const allCoords = [...deduped.values()].map(({ x, y }) => ({ x, y }));
    for (let i = 0; i < allCoords.length; i += UPSERT_BATCH_SIZE) {
      const batch = allCoords.slice(i, i + UPSERT_BATCH_SIZE);
      const result = await withRetry("ownershipCheck", () =>
        ctx.runQuery(internal.pixels.checkOwnershipBatch, {
          canvasId,
          userId: v_.userId,
          coords: batch,
        }),
      ) as { conflict: boolean };
      if (result.conflict) {
        return { error: "OVERWRITE_LOCKED", requiredCzk: 666, totalPaidCzk: v_.totalPaidCzk };
      }
    }
  }

  // --- Generate preview PNG (in-memory, from all incoming pixels) ---
  let previewStorageId: Id<"_storage"> | undefined;
  try {
    const pngBuffer = generatePreviewPng(deduped.values());
    const pngBlob = new Blob([pngBuffer.buffer as ArrayBuffer], { type: "image/png" });
    previewStorageId = await ctx.storage.store(pngBlob);
  } catch (err) {
    console.warn("Preview PNG generation failed, skipping:", err);
  }

  // --- Build upsert batches ---
  const allPixels = [...deduped.values()];
  const batches: { x: number; y: number; color: string }[][] = [];
  for (let i = 0; i < allPixels.length; i += UPSERT_BATCH_SIZE) {
    batches.push(allPixels.slice(i, i + UPSERT_BATCH_SIZE));
  }

  // --- Run upsert batches ---
  // When !canOverwrite, run sequentially so a conflict stops before further
  // batches write (the failing mutation rolls back its own batch atomically).
  const now = Date.now();
  let totalCost = 0;
  let totalChanged = 0;
  const allPriceUpdates: { x: number; y: number; price: number; color: string }[] = [];
  const parallelism = canOverwrite ? UPSERT_PARALLELISM : 1;

  try {
    for (let i = 0; i < batches.length; i += parallelism) {
      const round = batches.slice(i, i + parallelism);
      const results = await Promise.all(
        round.map((batch) =>
          withRetry("upsert", () =>
            ctx.runMutation(internal.pixels.upsertPixelBatch, {
              canvasId,
              userId: v_.userId,
              now,
              basePrice: v_.basePrice,
              canvasWidth: v_.canvasWidth,
              canvasHeight: v_.canvasHeight,
              checkOwnership: !canOverwrite,
              pixels: batch,
            }),
          ) as Promise<{ batchCost: number; changed: number; priceUpdates: { x: number; y: number; price: number; color: string }[] }>,
        ),
      );
      for (const r of results) {
        totalCost += r.batchCost;
        totalChanged += r.changed;
        for (const pu of r.priceUpdates) {allPriceUpdates.push(pu);}
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(OWNERSHIP_CONFLICT_MSG)) {
      return { error: "OVERWRITE_LOCKED", requiredCzk: 666, totalPaidCzk: v_.totalPaidCzk };
    }
    throw err;
  }

  if (totalChanged === 0) {
    return { error: null, totalCost: 0, committed: 0, remaining: v_.credits };
  }

  // --- Apply price map updates sequentially (avoids OCC contention) ---
  const PRICE_BATCH = 8000;
  for (let i = 0; i < allPriceUpdates.length; i += PRICE_BATCH) {
    await withRetry("patchChunks", () =>
      ctx.runMutation(internal.priceMapChunks.patchChunks, {
        canvasId,
        canvasWidth: v_.canvasWidth,
        canvasHeight: v_.canvasHeight,
        pixels: allPriceUpdates.slice(i, i + PRICE_BATCH).map(({ x, y, price }) => ({ x, y, price })),
      }),
    );
  }

  // --- Finalize: store changes in chunked transactions ---
  const changes = allPriceUpdates.map((pu) => ({
    x: pu.x,
    y: pu.y,
    color: pu.color,
    price: pu.price,
  }));

  let remaining = v_.credits;
  let creditError: string | null = null;
  for (let i = 0; i < changes.length; i += FINALIZE_CHUNK_SIZE) {
    const chunk = changes.slice(i, i + FINALIZE_CHUNK_SIZE);
    const isFirst = i === 0;
    const result = await withRetry("finalize", () =>
      ctx.runMutation(internal.pixels.finalizeCommit, {
        canvasId,
        userId: v_.userId,
        changes: chunk,
        totalCost: isFirst ? totalCost : 0,
        actorName: v_.nickname,
        actorEmail: v_.showEmail ? v_.email : undefined,
        isFirstChunk: isFirst,
        totalPixelCount: changes.length,
        ...(isFirst && previewStorageId ? { previewStorageId } : {}),
      }),
    ) as { remaining: number; creditError: string | null };
    remaining = result.remaining;
    if (result.creditError) {creditError = result.creditError;}
  }

  // Schedule snapshot once
  await ctx.runMutation(internal.pixels.scheduleSnapshot, { canvasId });

  if (creditError) {
    return { error: "NOT_ENOUGH_CREDITS", totalCost, balance: remaining };
  }
  return { error: null, totalCost, committed: totalChanged, remaining };
}

// ---------------------------------------------------------------------------
// Action: estimate cost for a blob WITHOUT writing anything.
// Uses the snapshot price map (Uint16Array) for O(1) per-pixel lookup
// instead of paginated DB queries — much faster for large commits.
// The blob is NOT deleted — it can be reused by commitFromBlob afterwards.
// ---------------------------------------------------------------------------
export const estimateCost = action({
  args: {
    token: v.string(),
    canvasId: v.id("canvases"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { token, canvasId, storageId }): Promise<
    | { error: string; totalCost?: number }
    | { error: null; totalCost: number; pixelCount: number }
  > => {
    const blobBuffer = await fetchStorageBlob(ctx, storageId);
    if (!blobBuffer) {return { error: "Blob not found" };}
    const rawPixels = decodePixelBlob(blobBuffer);
    if (rawPixels.length === 0) {return { error: null, totalCost: 0, pixelCount: 0 };}

    const validation: ValidationOk | ValidationError = await ctx.runQuery(
      internal.pixels.preValidateCommit,
      { token, canvasId },
    );
    if (validation.error) {return { error: validation.error as string };}
    const v_ = validation as ValidationOk;

    // Deduplicate & validate
    const deduped = new Map<string, { x: number; y: number; color: string }>();
    const allowedColors = v_.enforceColors
      ? new Set(v_.palette.map((c) => c.toLowerCase()))
      : null;
    for (const px of rawPixels) {
      if (!Number.isInteger(px.x) || px.x < 0 || px.x >= v_.canvasWidth) {continue;}
      if (!Number.isInteger(px.y) || px.y < 0 || px.y >= v_.canvasHeight) {continue;}
      if (!HEX_COLOR_RE.test(px.color)) {continue;}
      let color = px.color;
      if (allowedColors && !allowedColors.has(color.toLowerCase())) {
        color = nearestColor(color, v_.palette);
      }
      deduped.set(`${px.x},${px.y}`, { x: px.x, y: px.y, color });
    }
    if (deduped.size === 0) {return { error: null, totalCost: 0, pixelCount: 0 };}

    // Load price map from chunks for O(1) per-pixel lookups
    const priceMap = await loadPriceMap(ctx, canvasId, v_.canvasWidth, v_.canvasHeight);

    let totalCost = 0;
    let pixelCount = 0;
    for (const [, px] of deduped) {
      const mapPrice = priceMap[px.y * v_.canvasWidth + px.x];
      totalCost += nextPixelPrice(v_.basePrice, mapPrice > 0 ? mapPrice : undefined);
      pixelCount++;
    }

    return { error: null, totalCost, pixelCount };
  },
});
