import "./canvasPolyfill.js";
import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import path from "node:path";
// Legacy build targets Node.js (no DOM/worker assumptions). pdfjs-dist
// auto-detects Node and uses its built-in @napi-rs/canvas-backed factory
// internally; we still create our own canvas per page since page.render()
// needs a concrete canvasContext sized to that page's viewport.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PdfToolkitError, getPageCount, parsePageRanges } from "./pdf.js";

// Standard font glyph data (for PDFs that reference the base 14 fonts by
// name rather than embedding them) ships inside the pdfjs-dist package
// itself; point pdf.js at it directly instead of fetching over the network.
// Node's fetch path for these ends up calling fs.readFile(url) with the raw
// string, which only works with a plain filesystem path, not a file:// URL.
const require = createRequire(import.meta.url);
const pdfjsDistDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = path.join(pdfjsDistDir, "standard_fonts") + path.sep;
const cMapUrl = path.join(pdfjsDistDir, "cmaps") + path.sep;

export type ImageFormat = "png" | "jpeg";

export interface RenderedPage {
  name: string;
  buffer: Buffer;
}

/**
 * Rasterize PDF pages to images. If `rangeSpec` is omitted, renders every
 * page. `scale` controls output resolution (1.0 ~= 72 DPI, 2.0 ~= 144 DPI).
 */
export async function pdfToImages(
  buffer: Buffer,
  format: ImageFormat = "png",
  rangeSpec?: string,
  scale = 2.0
): Promise<RenderedPage[]> {
  const pageCount = await getPageCount(buffer);
  const pageIndices = rangeSpec
    ? parsePageRanges(rangeSpec, pageCount)
    : Array.from({ length: pageCount }, (_, i) => i);

  const uint8 = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    disableFontFace: true,
    isEvalSupported: false,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const results: RenderedPage[] = [];

  try {
    for (const index of pageIndices) {
      const page = await pdf.getPage(index + 1); // pdf.js pages are 1-indexed
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");

      // @napi-rs/canvas's context is API-compatible with the canvas context
      // pdf.js expects at runtime; this project has no DOM lib loaded, so
      // the precise DOM type isn't available to check the shape against.
      await page.render({
        canvasContext: context,
        viewport,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).promise;

      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const buf = canvas.toBuffer(mime as "image/png");
      results.push({ name: `page-${index + 1}.${format}`, buffer: Buffer.from(buf) });

      page.cleanup();
    }
  } catch (err) {
    throw new PdfToolkitError(
      `Failed to render PDF page: ${err instanceof Error ? err.message : String(err)}`,
      422
    );
  } finally {
    await pdf.destroy();
  }

  return results;
}
