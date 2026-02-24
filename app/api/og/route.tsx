import { ImageResponse } from "next/og";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

export const runtime = "edge";
export const revalidate = 60;

const WIDTH = 1200;
const HEIGHT = 630;
const BG = "#0b0b0b";

type Pixel = { x: number; y: number; color: string };

function buildPreview(
  width: number,
  height: number,
  pixels: Pixel[],
) {
  const targetMaxCells = 4800;
  const scale = Math.max(
    1,
    Math.ceil(Math.sqrt((width * height) / targetMaxCells)),
  );
  const previewWidth = Math.ceil(width / scale);
  const previewHeight = Math.ceil(height / scale);
  const cells = new Array(previewWidth * previewHeight).fill("#f3f4f6");
  for (const px of pixels) {
    const x = Math.floor(px.x / scale);
    const y = Math.floor(px.y / scale);
    if (x < 0 || y < 0 || x >= previewWidth || y >= previewHeight) {
      continue;
    }
    cells[y * previewWidth + x] = px.color;
  }
  return { cells, previewWidth, previewHeight };
}

function packRows(
  cells: string[],
  width: number,
  height: number,
  cellSize: number,
) {
  const rows: { key: number; cells: { key: number; color: string }[] }[] = [];
  for (let y = 0; y < height; y += 1) {
    const start = y * width;
    const rowCells = [];
    for (let x = 0; x < width; x += 1) {
      rowCells.push({ key: start + x, color: cells[start + x] ?? "#f3f4f6" });
    }
    rows.push({ key: y, cells: rowCells });
  }
  return rows;
}

export async function GET() {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
    }

    const client = new ConvexHttpClient(convexUrl);
    const canvases = await client.query(api.canvases.getAll, {});
    const canvas = canvases?.[0];
    if (!canvas) {
      throw new Error("No canvas found");
    }

    const pixels = await client.query(api.pixels.getByCanvas, {
      canvasId: canvas._id,
    });

    const { cells, previewWidth, previewHeight } = buildPreview(
      canvas.width,
      canvas.height,
      pixels as Pixel[],
    );

    const previewMaxW = 560;
    const previewMaxH = 500;
    const cellSize = Math.max(
      1,
      Math.floor(
        Math.min(previewMaxW / previewWidth, previewMaxH / previewHeight),
      ),
    );
    const gridWidth = previewWidth * cellSize;
    const gridHeight = previewHeight * cellSize;
    const rows = packRows(cells, previewWidth, previewHeight, cellSize);

    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: BG,
            color: "#fff",
            padding: "56px",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 44,
                fontWeight: 700,
              }}
            >
              PixAgora
            </div>
            <div style={{ fontSize: 22, color: "#d4d4d4", maxWidth: 420 }}>
              Společné pixelové plátno do knihy. Kup pixely, kresli a tvoř s
              komunitou.
            </div>
            <div style={{ fontSize: 16, color: "#9ca3af" }}>
              pixagora.urza.cz
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
              borderRadius: 24,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                background: "#e5e7eb",
                padding: 1,
                borderRadius: 12,
              }}
            >
              {rows.map((row) => (
                <div key={row.key} style={{ display: "flex", gap: 1 }}>
                  {row.cells.map((cell) => (
                    <div
                      key={cell.key}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        background: cell.color,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: BG,
            color: "#fff",
            fontFamily: "sans-serif",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 46, fontWeight: 700 }}>PixAgora</div>
          <div style={{ fontSize: 20, color: "#d4d4d4" }}>
            Společné pixelové plátno do knihy
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    );
  }
}
