/**
 * Synchronous Server Component — embeds the default canvas snapshot URL
 * into SSR HTML via <script> tag. No async queries, no <img>.
 *
 * The URL is consumed by:
 * - page.tsx: shows <img> in canvas area while data loads (no spinner)
 * - useSnapshotLoader: starts decode without waiting for WS queries
 */
export default function SnapshotPreloader() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__SNAPSHOT_PRELOAD_URL__="/api/canvas-snapshot";`,
      }}
    />
  );
}
