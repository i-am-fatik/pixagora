#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const MAX_BATCH_SIZE = 500;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = value;
      i += 1;
    }
  }
  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {return;}
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {continue;}
    const idx = trimmed.indexOf("=");
    if (idx === -1) {continue;}
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normalizeHex(value) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {return null;}
  if (trimmed.startsWith("#")) {return trimmed;}
  return `#${trimmed}`;
}

function hexToRgb(hex) {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (normalized.length !== 6) {return null;}
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {return null;}
  return { r, g, b };
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function rgbToHex(r, g, b) {
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function usage() {
  console.log(`Usage:
  node scripts/import-image.mjs --image path/to/file.png --token TOKEN [options]

Options:
  --canvas-id <id>       Canvas ID (default: first canvas)
  --canvas-index <n>     Canvas index from getAll (default: 0)
  --convex-url <url>     Convex HTTP URL (default: NEXT_PUBLIC_CONVEX_URL)
  --palette <hexes>      Comma-separated palette override (e.g. "#000000,#7f7f7f,#ffd400")
  --color-mode <mode>    palette | full (default: palette)
  --full-color           Shortcut for --color-mode full
  --transparent <hex>    Skip pixels that map to this palette color (e.g. #ffffff)
  --fit <mode>           contain | cover | stretch (default: contain)
  --grid-width <n>       Fit area width in pixels (default: canvas width)
  --grid-height <n>      Fit area height in pixels (default: canvas height)
  --alpha-cutoff <0-255> Skip pixels with alpha <= cutoff (default: 0)
  --dry-run              Only print summary, do not commit
  --batch-size <n>       Max pixels per batch (default: 500)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const imagePath = args.image;
  const token = args.token;
  if (!imagePath || !token) {
    usage();
    process.exit(1);
  }

  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadEnvFile(path.resolve(process.cwd(), ".env"));

  const convexUrl = args["convex-url"] ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.error("Missing Convex URL. Use --convex-url or set NEXT_PUBLIC_CONVEX_URL.");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), imagePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Image not found: ${resolvedPath}`);
    process.exit(1);
  }

  const batchSize = Math.min(
    Number.parseInt(args["batch-size"] ?? `${MAX_BATCH_SIZE}`, 10) ||
      MAX_BATCH_SIZE,
    MAX_BATCH_SIZE,
  );
  const transparentHex = args.transparent
    ? String(args.transparent).toLowerCase()
    : null;
  const colorMode = String(
    args["color-mode"] ?? (args["full-color"] ? "full" : "palette"),
  ).toLowerCase();
  const paletteOverride = args.palette
    ? String(args.palette)
        .split(/[,\s]+/)
        .map(normalizeHex)
        .filter(Boolean)
    : null;
  const fitMode = String(args.fit ?? "contain").toLowerCase();
  const gridWidth = args["grid-width"]
    ? Number.parseInt(args["grid-width"], 10)
    : null;
  const gridHeight = args["grid-height"]
    ? Number.parseInt(args["grid-height"], 10)
    : null;
  const alphaCutoff = Math.min(
    Math.max(Number.parseInt(args["alpha-cutoff"] ?? "0", 10) || 0, 0),
    255,
  );
  const dryRun = Boolean(args["dry-run"]);

  let JimpModule;
  try {
    JimpModule = await import("jimp");
  } catch (error) {
    console.error(
      "Missing dependency 'jimp'. Install it with: npm install -D jimp",
    );
    throw error;
  }

  const Jimp =
    JimpModule?.default ?? JimpModule?.Jimp ?? JimpModule;
  if (!Jimp?.read) {
    throw new Error("Unsupported Jimp import: missing read()");
  }
  const client = new ConvexHttpClient(convexUrl);

  let canvas = null;
  if (args["canvas-id"]) {
    canvas = await client.query("canvases:getById", { id: args["canvas-id"] });
  } else {
    const canvases = await client.query("canvases:getAll", {});
    if (!canvases || canvases.length === 0) {
      throw new Error("No canvases found.");
    }
    const index = Number.parseInt(args["canvas-index"] ?? "0", 10) || 0;
    canvas = canvases[index];
  }

  if (!canvas) {
    throw new Error("Canvas not found.");
  }

  const fitWidth = gridWidth && gridWidth > 0 ? gridWidth : canvas.width;
  const fitHeight = gridHeight && gridHeight > 0 ? gridHeight : canvas.height;
  if (fitWidth > canvas.width || fitHeight > canvas.height) {
    console.warn(
      `Fit area ${fitWidth}x${fitHeight} exceeds canvas ${canvas.width}x${canvas.height}.`,
    );
  }

  let paletteRgb = [];
  if (colorMode !== "full") {
    let palette = canvas.colors.map((hex) => hex.toLowerCase());
    if (paletteOverride && paletteOverride.length > 0) {
      const allowed = new Set(paletteOverride);
      const filtered = palette.filter((hex) => allowed.has(hex));
      const missing = paletteOverride.filter((hex) => !palette.includes(hex));
      if (missing.length > 0) {
        console.warn(
          `Palette override colors not in canvas: ${missing.join(", ")}`,
        );
      }
      if (filtered.length === 0) {
        throw new Error("Palette override produced empty palette.");
      }
      palette = filtered;
    }

    paletteRgb = palette
      .map((hex) => ({ hex, rgb: hexToRgb(hex) }))
      .filter((item) => item.rgb);

    if (paletteRgb.length === 0) {
      throw new Error("Canvas palette is empty.");
    }
  }

  const image = await Jimp.read(resolvedPath);
  const sourceWidth = image.bitmap?.width ?? image.getWidth?.();
  const sourceHeight = image.bitmap?.height ?? image.getHeight?.();
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image dimensions.");
  }

  let targetWidth = canvas.width;
  let targetHeight = canvas.height;
  let offsetX = 0;
  let offsetY = 0;

  if (fitMode === "contain" || fitMode === "cover") {
    const scale =
      fitMode === "cover"
        ? Math.max(fitWidth / sourceWidth, fitHeight / sourceHeight)
        : Math.min(fitWidth / sourceWidth, fitHeight / sourceHeight);
    targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    offsetX = Math.floor((fitWidth - targetWidth) / 2);
    offsetY = Math.floor((fitHeight - targetHeight) / 2);
  } else if (fitMode === "stretch") {
    targetWidth = fitWidth;
    targetHeight = fitHeight;
    offsetX = 0;
    offsetY = 0;
  } else {
    throw new Error(`Unknown fit mode: ${fitMode}`);
  }

  if (image.resize) {
    const resizeOptions =
      Jimp?.ResizeStrategy?.NEAREST_NEIGHBOR ??
      Jimp?.ResizeStrategy?.NearestNeighbor ??
      Jimp?.RESIZE_NEAREST_NEIGHBOR;
    if (resizeOptions) {
      try {
        image.resize({ w: targetWidth, h: targetHeight, mode: resizeOptions });
      } catch {
        image.resize(targetWidth, targetHeight, resizeOptions);
      }
    } else {
      try {
        image.resize({ w: targetWidth, h: targetHeight });
      } catch {
        image.resize(targetWidth, targetHeight);
      }
    }
  }

  let composed = image;
  if (fitMode === "contain" || fitMode === "cover" || fitMode === "stretch") {
    let base;
    try {
      base = new Jimp({
        width: canvas.width,
        height: canvas.height,
        color: 0x00000000,
      });
    } catch {
      base = new Jimp(canvas.width, canvas.height, 0x00000000);
    }
    const baseOffsetX = Math.floor((canvas.width - fitWidth) / 2);
    const baseOffsetY = Math.floor((canvas.height - fitHeight) / 2);
    const placeX = baseOffsetX + offsetX;
    const placeY = baseOffsetY + offsetY;
    if (base.composite) {
      base.composite(image, placeX, placeY);
    } else if (base.blit) {
      base.blit(image, placeX, placeY);
    }
    composed = base;
  }

  const pixels = [];
  let skippedTransparent = 0;

  const bitmap = composed.bitmap;
  if (!bitmap?.data) {
    throw new Error("Image bitmap data not available.");
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const idx = (y * canvas.width + x) * 4;
      const r = bitmap.data[idx];
      const g = bitmap.data[idx + 1];
      const b = bitmap.data[idx + 2];
      const a = bitmap.data[idx + 3];
      if (a <= alphaCutoff) {
        skippedTransparent += 1;
        continue;
      }

      if (colorMode === "full") {
        const hex = rgbToHex(r, g, b);
        if (transparentHex && hex === transparentHex) {
          skippedTransparent += 1;
          continue;
        }
        pixels.push({ x, y, color: hex });
        continue;
      }

      let best = paletteRgb[0];
      let bestDist = colorDistance(best.rgb, { r, g, b });
      for (let i = 1; i < paletteRgb.length; i += 1) {
        const candidate = paletteRgb[i];
        const dist = colorDistance(candidate.rgb, { r, g, b });
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }

      if (transparentHex && best.hex === transparentHex) {
        skippedTransparent += 1;
        continue;
      }

      pixels.push({ x, y, color: best.hex });
    }
  }

  const batches = chunkArray(pixels, batchSize);

  console.log(`Canvas: ${canvas.name} (${canvas.width}x${canvas.height})`);
  console.log(`Image: ${resolvedPath}`);
  console.log(`Pixels to commit: ${pixels.length}`);
  console.log(`Skipped (transparent): ${skippedTransparent}`);
  console.log(`Batches: ${batches.length} (batch size ${batchSize})`);
  console.log(`Color mode: ${colorMode}`);

  if (dryRun) {
    console.log("Dry-run enabled: no commits were sent.");
    return;
  }

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    if (batch.length === 0) {continue;}
    console.log(`Committing batch ${i + 1}/${batches.length}...`);
    await client.mutation("pixels:commit", {
      token,
      canvasId: canvas._id,
      pixels: batch,
    });
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
