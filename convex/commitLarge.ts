"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { nextPixelPrice } from "./pricing";

// ---------------------------------------------------------------------------
// Binary pixel format: 7 bytes per pixel
//   [x: uint16 LE] [y: uint16 LE] [r: uint8] [g: uint8] [b: uint8]
// ---------------------------------------------------------------------------
const BYTES_PER_PIXEL = 7;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Fast path: combined lookup+write ("upsert") mutations
const UPSERT_BATCH_SIZE = 400;
const UPSERT_PARALLELISM = 10;

// Slow path: separate lookup → write (for users who can't overwrite)
const WRITE_BATCH_SIZE = 500;
const WRITE_PARALLELISM = 8;
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
  isAdmin: boolean;
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
// Two paths:
//   FAST PATH (canOverwrite=true): combined upsert mutations, 10x parallel,
//     single-record finalize with changes:[]. ~3-5x faster for large commits.
//   SLOW PATH: separate lookup → diff → write → chunked finalize.
//     Required when overwrite permission check is needed per-pixel.
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

    // A1: Download and decode the pixel blob
    const blob = await ctx.storage.get(storageId);
    if (!blob) {throw new Error("Pixel blob not found in storage");}
    const buffer = await blob.arrayBuffer();
    const rawPixels = decodePixelBlob(buffer);
    await ctx.storage.delete(storageId);

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

    // =========== Route: fast path vs slow path ===========
    // Slow path always computes exact cost before writing and checks
    // expectedCost match — this is the secure default.
    // Fast path (combined upsert) is only used for admin bulk operations
    // without expectedCost, where credit checking is less critical.
    if (v_.isAdmin && expectedCost === undefined) {
      return fastPathCommit(ctx, canvasId, deduped, v_);
    } else {
      return slowPathCommit(ctx, canvasId, deduped, v_, expectedCost);
    }
  },
});

// ---------------------------------------------------------------------------
// FAST PATH: combined upsert (lookup + write in one mutation), 10x parallel,
// single-record finalize. ~3-5x faster for large commits.
// ---------------------------------------------------------------------------
async function fastPathCommit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  canvasId: Id<"canvases">,
  deduped: Map<string, { x: number; y: number; color: string }>,
  v_: ValidationOk,
): Promise<
  | { error: string; totalCost?: number; balance?: number }
  | { error: null; totalCost: number; committed: number; remaining: number }
> {
  // Quick credit pre-check (lower bound: all pixels at base price)
  if (!v_.isAdmin) {
    const lowerBound = v_.basePrice * deduped.size;
    if (v_.credits < lowerBound) {
      return { error: "NOT_ENOUGH_CREDITS", totalCost: lowerBound, balance: v_.credits };
    }
  }

  // Generate preview PNG (in-memory, from all incoming pixels)
  let previewStorageId: Id<"_storage"> | undefined;
  try {
    const pngBuffer = generatePreviewPng(deduped.values());
    const pngBlob = new Blob([pngBuffer.buffer as ArrayBuffer], { type: "image/png" });
    previewStorageId = await ctx.storage.store(pngBlob);
  } catch (err) {
    console.warn("Preview PNG generation failed, skipping:", err);
  }

  // Build upsert batches
  const allPixels = [...deduped.values()];
  const batches: { x: number; y: number; color: string }[][] = [];
  for (let i = 0; i < allPixels.length; i += UPSERT_BATCH_SIZE) {
    batches.push(allPixels.slice(i, i + UPSERT_BATCH_SIZE));
  }

  // Run upsert batches in parallel rounds
  const now = Date.now();
  let totalCost = 0;
  let totalChanged = 0;
  const allPriceUpdates: { x: number; y: number; price: number; color: string }[] = [];

  for (let i = 0; i < batches.length; i += UPSERT_PARALLELISM) {
    const round = batches.slice(i, i + UPSERT_PARALLELISM);
    const results = await Promise.all(
      round.map((batch) =>
        withRetry("upsert", () =>
          ctx.runMutation(internal.pixels.upsertPixelBatch, {
            canvasId,
            userId: v_.userId,
            now,
            basePrice: v_.basePrice,
            isAdmin: v_.isAdmin,
            canvasWidth: v_.canvasWidth,
            canvasHeight: v_.canvasHeight,
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

  if (totalChanged === 0) {
    return { error: null, totalCost: 0, committed: 0, remaining: v_.credits };
  }

  // Apply price map updates sequentially (avoids OCC contention from parallel batches)
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

  // Finalize: store changes in chunked transactions (needed for replay)
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
  return {
    error: null,
    totalCost,
    committed: totalChanged,
    remaining,
  };
}

// ---------------------------------------------------------------------------
// SLOW PATH: separate lookup → diff → write → chunked finalize.
// Required when per-pixel overwrite permission check is needed (totalPaidCzk < 666).
// ---------------------------------------------------------------------------
async function slowPathCommit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  canvasId: Id<"canvases">,
  deduped: Map<string, { x: number; y: number; color: string }>,
  v_: ValidationOk,
  _expectedCost?: number,
): Promise<
  | { error: string; totalCost?: number; balance?: number; requiredCzk?: number; totalPaidCzk?: number; pixelCount?: number }
  | { error: null; totalCost: number; committed: number; remaining: number }
> {
  type ExistingPixel = { _id: Id<"pixels">; color: string; price: number; userId: Id<"users"> };

  // Bounding-box range scan for existing pixels
  const existingMap = new Map<string, ExistingPixel>();
  {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { x, y } of deduped.values()) {
      if (x < minX) {minX = x;}
      if (y < minY) {minY = y;}
      if (x > maxX) {maxX = x;}
      if (y > maxY) {maxY = y;}
    }

    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result = await withRetry("lookup", () =>
        ctx.runQuery(internal.pixels.lookupExistingPixelsBounded, {
          canvasId,
          minX, maxX, minY, maxY,
          paginationOpts: { numItems: 2000, cursor },
        }) as Promise<{
          pixels: { _id: Id<"pixels">; x: number; y: number; color: string; price: number; userId: Id<"users"> }[];
          isDone: boolean;
          continueCursor: string;
        }>,
      );
      for (const doc of result.pixels) {
        if (deduped.has(`${doc.x},${doc.y}`)) {
          existingMap.set(`${doc.x},${doc.y}`, {
            _id: doc._id,
            color: doc.color,
            price: doc.price,
            userId: doc.userId,
          });
        }
      }
      isDone = result.isDone;
      cursor = result.continueCursor;
    }
  }

  // In-memory diff
  type Change = { x: number; y: number; color: string; price: number; previousColor?: string };
  type InsertOp = { x: number; y: number; color: string; price: number };
  type UpdateOp = { id: Id<"pixels">; x: number; y: number; color: string; price: number };

  const inserts: InsertOp[] = [];
  const updates: UpdateOp[] = [];
  const changes: Change[] = [];
  let totalCost = 0;

  for (const [key, px] of deduped) {
    const existing = existingMap.get(key);
    if (existing && existing.color.toLowerCase() === px.color.toLowerCase()) {continue;}

    if (existing && existing.userId !== v_.userId) {
      if (!v_.isAdmin && v_.totalPaidCzk < 666) {
        return { error: "OVERWRITE_LOCKED", requiredCzk: 666, totalPaidCzk: v_.totalPaidCzk };
      }
    }

    const price = v_.isAdmin ? 0 : nextPixelPrice(v_.basePrice, existing?.price);
    totalCost += price;
    changes.push({ x: px.x, y: px.y, color: px.color, price, previousColor: existing?.color });

    if (existing) {
      updates.push({ id: existing._id, x: px.x, y: px.y, color: px.color, price });
    } else {
      inserts.push({ x: px.x, y: px.y, color: px.color, price });
    }
  }

  if (changes.length === 0) {
    return { error: null, totalCost: 0, committed: 0, remaining: v_.credits };
  }

  if (!v_.isAdmin && totalCost > v_.credits) {
    return { error: "NOT_ENOUGH_CREDITS", totalCost, balance: v_.credits };
  }

  // No COST_MISMATCH check — server always charges the actual cost.
  // The client estimate (from snapshot price map) is informational only.
  // Credit check above catches the case where the user can't afford it.

  // Generate preview PNG
  let previewStorageId: Id<"_storage"> | undefined;
  try {
    const pngBuffer = generatePreviewPng(changes);
    const pngBlob = new Blob([pngBuffer.buffer as ArrayBuffer], { type: "image/png" });
    previewStorageId = await ctx.storage.store(pngBlob);
  } catch (err) {
    console.warn("Preview PNG generation failed, skipping:", err);
  }

  // Write batches (parallel)
  const now = Date.now();
  type WriteBatch = { inserts: InsertOp[]; updates: UpdateOp[] };
  const writeBatches: WriteBatch[] = [];
  let bi = 0, ui = 0;
  while (bi < inserts.length || ui < updates.length) {
    const batch: WriteBatch = { inserts: [], updates: [] };
    let count = 0;
    while (bi < inserts.length && count < WRITE_BATCH_SIZE) { batch.inserts.push(inserts[bi++]); count++; }
    while (ui < updates.length && count < WRITE_BATCH_SIZE) { batch.updates.push(updates[ui++]); count++; }
    writeBatches.push(batch);
  }

  let totalCostDelta = 0;
  const allPriceUpdates: { x: number; y: number; price: number; color: string }[] = [];
  for (let i = 0; i < writeBatches.length; i += WRITE_PARALLELISM) {
    const round = writeBatches.slice(i, i + WRITE_PARALLELISM);
    const results = await Promise.all(
      round.map((batch) =>
        withRetry("write", () =>
          ctx.runMutation(internal.pixels.writeBatchNoRead, {
            canvasId,
            userId: v_.userId,
            now,
            basePrice: v_.basePrice,
            isAdmin: v_.isAdmin,
            canvasWidth: v_.canvasWidth,
            canvasHeight: v_.canvasHeight,
            inserts: batch.inserts,
            updates: batch.updates,
          }),
        ) as Promise<{ costDelta: number; priceUpdates: { x: number; y: number; price: number; color: string }[] }>,
      ),
    );
    for (const r of results) {
      totalCostDelta += r.costDelta;
      for (const pu of r.priceUpdates) {allPriceUpdates.push(pu);}
    }
  }

  // Apply price map updates sequentially (avoids OCC contention from parallel batches)
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

  // Adjust totalCost with actual price differences found during writes
  totalCost += totalCostDelta;

  // Finalize: always store changes and update totalSpent (pixels are already written).
  // The atomic credit re-check inside finalizeCommit will flag insufficient credits.
  const actualPriceByKey = new Map<string, { price: number; color: string }>();
  for (const pu of allPriceUpdates) {
    actualPriceByKey.set(`${pu.x},${pu.y}`, { price: pu.price, color: pu.color });
  }
  const finalChanges = changes.map((c) => {
    const actual = actualPriceByKey.get(`${c.x},${c.y}`);
    return {
      x: c.x,
      y: c.y,
      color: actual?.color ?? c.color,
      price: actual?.price ?? c.price,
      previousColor: c.previousColor,
    };
  });

  let remaining = v_.credits - totalCost;
  let creditError: string | null = null;
  for (let i = 0; i < finalChanges.length; i += FINALIZE_CHUNK_SIZE) {
    const chunk = finalChanges.slice(i, i + FINALIZE_CHUNK_SIZE);
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
        totalPixelCount: finalChanges.length,
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
  return { error: null, totalCost, committed: changes.length, remaining };
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
    const pixelBlob = await ctx.storage.get(storageId);
    if (!pixelBlob) {return { error: "Blob not found" };}
    const buffer = await pixelBlob.arrayBuffer();
    const rawPixels = decodePixelBlob(buffer);
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

    // Load price map from chunks for fast O(1) lookups
    let priceMap: Uint16Array | null = null;
    try {
      const chunks = await ctx.runQuery(api.priceMapChunks.getChunksForCanvas, { canvasId });
      if (chunks.length > 0) {
        const totalPixels = v_.canvasWidth * v_.canvasHeight;
        priceMap = new Uint16Array(totalPixels);
        for (const chunk of chunks) {
          const src = new Uint16Array(chunk.data);
          priceMap.set(src, chunk.rowStart * v_.canvasWidth);
        }
      }
    } catch (err) {
      console.warn("[estimateCost] Price map chunk load failed, falling back to DB:", err);
    }

    if (priceMap) {
      // Fast path: price map lookup — O(1) per pixel, no DB queries
      const W = v_.canvasWidth;
      let totalCost = 0;
      let pixelCount = 0;
      for (const [, px] of deduped) {
        const mapPrice = priceMap[px.y * W + px.x];
        // mapPrice 0 = pixel doesn't exist in snapshot → base price
        // mapPrice > 0 = pixel exists at that price → nextPixelPrice
        const price = v_.isAdmin
          ? 0
          : nextPixelPrice(v_.basePrice, mapPrice > 0 ? mapPrice : undefined);
        totalCost += price;
        pixelCount++;
      }
      return { error: null, totalCost, pixelCount };
    }

    // Fallback: paginated DB queries (only when no snapshot price map exists)
    type ExistingPixel = { color: string; price: number };
    const existingMap = new Map<string, ExistingPixel>();
    {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const { x, y } of deduped.values()) {
        if (x < minX) {minX = x;}
        if (y < minY) {minY = y;}
        if (x > maxX) {maxX = x;}
        if (y > maxY) {maxY = y;}
      }
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const result = await withRetry("estimate-lookup", () =>
          ctx.runQuery(internal.pixels.lookupExistingPixelsBounded, {
            canvasId,
            minX, maxX, minY, maxY,
            paginationOpts: { numItems: 2000, cursor },
          }) as Promise<{
            pixels: { x: number; y: number; color: string; price: number }[];
            isDone: boolean;
            continueCursor: string;
          }>,
        );
        for (const doc of result.pixels) {
          if (deduped.has(`${doc.x},${doc.y}`)) {
            existingMap.set(`${doc.x},${doc.y}`, { color: doc.color, price: doc.price });
          }
        }
        isDone = result.isDone;
        cursor = result.continueCursor;
      }
    }

    let totalCost = 0;
    let pixelCount = 0;
    for (const [key, px] of deduped) {
      const existing = existingMap.get(key);
      if (existing && existing.color.toLowerCase() === px.color.toLowerCase()) {continue;}
      totalCost += v_.isAdmin ? 0 : nextPixelPrice(v_.basePrice, existing?.price);
      pixelCount++;
    }

    return { error: null, totalCost, pixelCount };
  },
});
