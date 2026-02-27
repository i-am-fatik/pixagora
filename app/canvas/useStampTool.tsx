"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type StampToolMode = "paint" | "stamp";
export type StampPixel = { x: number; y: number; color: string };

type StampOptions = {
  defaultSrc?: string;
  defaultName?: string;
};

const DEFAULT_STAMP_SRC = "/stamps/urza.png";
const DEFAULT_STAMP_NAME = "urza.png";
const DEFAULT_STAMP_SIZE = 24;
const MIN_STAMP_SIZE = 8;
const MAX_STAMP_SIZE = 128;
const STAMP_ALPHA_CUTOFF = 20;
const STAMP_FIT_MODE: "contain" | "stretch" = "contain";
const STAMP_UNPREMULTIPLY = true;
const STAMP_SMOOTHING = true;

const toHex = (value: number) => value.toString(16).padStart(2, "0");
const rgbToHex = (r: number, g: number, b: number) =>
  `#${toHex(r)}${toHex(g)}${toHex(b)}`;

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
          pixels.push({ x, y, color: rgbToHex(r, g, b) });
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
  }, [stampSrc, stampSize]);

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
  };
}
