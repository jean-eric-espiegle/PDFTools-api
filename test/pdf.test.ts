import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { compressPdf, getPageCount, mergePdfs, parsePageRanges, splitPdf } from "../src/lib/pdf.js";

async function makeTestPdf(pageCount: number, label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([200, 200]);
    page.drawText(`${label} page ${i + 1}`, { x: 20, y: 100 });
  }
  return Buffer.from(await doc.save());
}

describe("parsePageRanges", () => {
  it("parses single pages and ranges", () => {
    expect(parsePageRanges("1,3-5,8", 10)).toEqual([0, 2, 3, 4, 7]);
  });

  it("dedupes overlapping segments", () => {
    expect(parsePageRanges("1-3,2-4", 10)).toEqual([0, 1, 2, 3]);
  });

  it("rejects out-of-bounds pages", () => {
    expect(() => parsePageRanges("1-11", 10)).toThrow();
  });

  it("rejects malformed segments", () => {
    expect(() => parsePageRanges("abc", 10)).toThrow();
  });
});

describe("mergePdfs", () => {
  it("merges pages from multiple PDFs in order", async () => {
    const a = await makeTestPdf(2, "A");
    const b = await makeTestPdf(3, "B");

    const merged = await mergePdfs([a, b]);
    const pageCount = await getPageCount(merged);

    expect(pageCount).toBe(5);
  });

  it("rejects fewer than 2 files", async () => {
    const a = await makeTestPdf(1, "A");
    await expect(mergePdfs([a])).rejects.toThrow();
  });
});

describe("splitPdf", () => {
  it("splits into one PDF per page when no range is given", async () => {
    const doc = await makeTestPdf(4, "S");
    const results = await splitPdf(doc);

    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(await getPageCount(result.buffer)).toBe(1);
    }
  });

  it("extracts a single PDF containing just the requested range", async () => {
    const doc = await makeTestPdf(6, "S");
    const results = await splitPdf(doc, "2-4");

    expect(results).toHaveLength(1);
    expect(await getPageCount(results[0].buffer)).toBe(3);
  });
});

describe("compressPdf", () => {
  it("returns a valid, still-readable PDF", async () => {
    const doc = await makeTestPdf(3, "C");
    const compressed = await compressPdf(doc);

    expect(await getPageCount(compressed)).toBe(3);
  });
});
