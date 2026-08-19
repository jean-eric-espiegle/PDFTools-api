import { createRequire } from "node:module";

/**
 * pdfjs-dist's Node code path (canvas globals, standard-font-file loading)
 * relies on `process.getBuiltinModule`, added in Node 20.16/22.3. On older
 * Node it's undefined, every `process.getBuiltinModule("fs")` /
 * `("module")` call throws, and pdfjs silently falls back to no glyph
 * outlines and no DOMMatrix/ImageData/Path2D — text renders blank instead
 * of erroring loudly. Polyfilling the one missing function fixes all of
 * those call sites at once.
 */
const proc = process as unknown as { getBuiltinModule?: (id: string) => unknown };

if (typeof proc.getBuiltinModule !== "function") {
  const require = createRequire(import.meta.url);
  proc.getBuiltinModule = (id: string) => require(id);
}
