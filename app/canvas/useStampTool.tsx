"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type StampToolMode = "paint" | "stamp";
export type StampPixel = { x: number; y: number; color: string };

type StampOptions = {
  defaultSrc?: string;
  defaultName?: string;
  enforceColors?: boolean;
  palette?: string[];
};

const DEFAULT_STAMP_SRC = "/stamps/urza.png";
const DEFAULT_STAMP_NAME = "urza.png";
const DEFAULT_STAMP_SIZE = 24;
const MIN_STAMP_SIZE = 8;
const MAX_STAMP_SIZE = 256;
const STAMP_ALPHA_CUTOFF = 20;
const STAMP_FIT_MODE: "contain" | "stretch" = "contain";
const STAMP_UNPREMULTIPLY = true;
const STAMP_SMOOTHING = true;

const toHex = (value: number) => value.toString(16).padStart(2, "0");
const rgbToHex = (r: number, g: number, b: number) =>
  `#${toHex(r)}${toHex(g)}${toHex(b)}`;

function parseHexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function nearestPaletteColor(
  r: number, g: number, b: number,
  parsed: { r: number; g: number; b: number; hex: string }[],
): string {
  let best = parsed[0].hex;
  let bestDist = Infinity;
  for (const c of parsed) {
    const dr = r - c.r;
    const dg = g - c.g;
    const db = b - c.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.hex;
    }
  }
  return best;
}

function getImageSize(source: CanvasImageSource) {
  if ("naturalWidth" in source && "naturalHeight" in source) {
    return {
      width: Number(source.naturalWidth),
      height: Number(source.naturalHeight),
    };
  }
  if ("width" in source && "height" in source) {
    return {
      width: Number(source.width),
      height: Number(source.height),
    };
  }
  return null;
}

export function useStampTool(options: StampOptions = {}) {
  const [tool, setTool] = useState<StampToolMode>("paint");
  const [stampSrc, setStampSrc] = useState(
    options.defaultSrc ?? DEFAULT_STAMP_SRC,
  );
  const [stampName, setStampName] = useState(
    options.defaultName ?? DEFAULT_STAMP_NAME,
  );
  const [stampSize, setStampSize] = useState(DEFAULT_STAMP_SIZE);
  const [stampPixels, setStampPixels] = useState<StampPixel[]>([]);
  const [stampReady, setStampReady] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  const stampObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const enforceColors = options.enforceColors ?? false;
  const palette = options.palette;

  // Pre-parse palette for fast nearest-color lookup
  const parsedPaletteRef = useRef<{ r: number; g: number; b: number; hex: string }[] | null>(null);
  const lastPaletteRef = useRef<string[] | undefined>(undefined);
  if (palette !== lastPaletteRef.current) {
    lastPaletteRef.current = palette;
    parsedPaletteRef.current =
      palette && palette.length > 0
        ? palette.map((c) => {
            const [r, g, b] = parseHexRgb(c);
            return { r, g, b, hex: c.charAt(0) === "#" ? c.toUpperCase() : `#${c.toUpperCase()}` };
          })
        : null;
  }

  useEffect(() => {
    let cancelled = false;

    const renderStamp = (img: CanvasImageSource) => {
      const size = getImageSize(img);
      if (!size) {
        setStampError("Stamp image size not available");
        setStampReady(false);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = stampSize;
      canvas.height = stampSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStampError("Stamp canvas not available");
        setStampReady(false);
        return;
      }
      ctx.imageSmoothingEnabled = STAMP_SMOOTHING;
      if (STAMP_SMOOTHING && "imageSmoothingQuality" in ctx) {
        ctx.imageSmoothingQuality = "high";
      }
      ctx.clearRect(0, 0, stampSize, stampSize);

      if (STAMP_FIT_MODE === "stretch") {
        ctx.drawImage(img, 0, 0, stampSize, stampSize);
      } else {
        const scale = Math.min(
          stampSize / size.width,
          stampSize / size.height,
        );
        const drawW = Math.max(1, Math.round(size.width * scale));
        const drawH = Math.max(1, Math.round(size.height * scale));
        const offsetX = Math.floor((stampSize - drawW) / 2);
        const offsetY = Math.floor((stampSize - drawH) / 2);
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
      }

      const { data } = ctx.getImageData(0, 0, stampSize, stampSize);
      const pixels: StampPixel[] = [];
      for (let y = 0; y < stampSize; y += 1) {
        for (let x = 0; x < stampSize; x += 1) {
          const idx = (y * stampSize + x) * 4;
          const a = data[idx + 3];
          if (a <= STAMP_ALPHA_CUTOFF) {
            continue;
          }
          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];
          if (STAMP_UNPREMULTIPLY && a < 255) {
            r = Math.min(255, Math.round((r * 255) / a));
            g = Math.min(255, Math.round((g * 255) / a));
            b = Math.min(255, Math.round((b * 255) / a));
          }
          const color =
            enforceColors && parsedPaletteRef.current
              ? nearestPaletteColor(r, g, b, parsedPaletteRef.current)
              : rgbToHex(r, g, b);
          pixels.push({ x: x - Math.floor(stampSize / 2), y: y - Math.floor(stampSize / 2), color });
        }
      }
      setStampPixels(pixels);
      setStampReady(true);
      setStampError(null);
    };

    const loadStamp = async () => {
      try {
        setStampReady(false);
        setStampError(null);
        const response = await fetch(stampSrc);
        if (!response.ok) {
          throw new Error(`Stamp fetch failed (${response.status})`);
        }
        const blob = await response.blob();
        if ("createImageBitmap" in window) {
          const bitmap = await createImageBitmap(blob);
          if (cancelled) return;
          renderStamp(bitmap);
          return;
        }
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          URL.revokeObjectURL(url);
          if (cancelled) return;
          renderStamp(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          if (cancelled) return;
          setStampError("Stamp image failed to load");
          setStampReady(false);
        };
        img.src = url;
      } catch (error) {
        if (cancelled) return;
        setStampError(
          `Stamp load error: ${error instanceof Error ? error.message : String(error)}`,
        );
        setStampReady(false);
      }
    };

    loadStamp();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stampSrc, stampSize, enforceColors, palette]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      if (file.type !== "image/png") {
        setStampError("Pouze PNG");
        setStampReady(false);
        return;
      }
      const nextUrl = URL.createObjectURL(file);
      if (stampObjectUrlRef.current) {
        URL.revokeObjectURL(stampObjectUrlRef.current);
      }
      stampObjectUrlRef.current = nextUrl;
      setStampSrc(nextUrl);
      setStampName(file.name);
      setTool("stamp");
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (stampObjectUrlRef.current) {
        URL.revokeObjectURL(stampObjectUrlRef.current);
        stampObjectUrlRef.current = null;
      }
    };
  }, []);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const remapToColors = useCallback((palette: string[]) => {
    if (palette.length === 0) {
      return;
    }
    const parsed = palette.map((c) => {
      const hex = c.replace("#", "");
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
        hex: c.toUpperCase(),
      };
    });
    setStampPixels((prev) =>
      prev.map((px) => {
        const hex = px.color.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        let best = parsed[0];
        let bestDist = Infinity;
        for (const c of parsed) {
          const dr = r - c.r;
          const dg = g - c.g;
          const db = b - c.b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            best = c;
          }
        }
        return { ...px, color: best.hex };
      }),
    );
  }, []);

  return {
    tool,
    setTool,
    stampPixels,
    stampReady,
    stampError,
    stampName,
    stampSize,
    setStampSize,
    minStampSize: MIN_STAMP_SIZE,
    maxStampSize: MAX_STAMP_SIZE,
    fileInputRef,
    handleFileChange,
    openFileDialog,
    remapToColors,
  };
}
