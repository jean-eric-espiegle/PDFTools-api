import { PDFDocument } from "pdf-lib";

export class PdfToolkitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Merge multiple PDFs, in the given order, into a single PDF buffer. */
export async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length < 2) {
    throw new PdfToolkitError("Provide at least 2 PDF files to merge");
  }

  const merged = await PDFDocument.create();

  for (const buffer of buffers) {
    const source = await loadPdf(buffer);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return Buffer.from(await merged.save());
}

/**
 * Parse a page-range string like "1-3,5,8-9" (1-indexed, inclusive) into a
 * sorted, deduplicated list of 0-indexed page numbers.
 */
export function parsePageRanges(rangeSpec: string, pageCount: number): number[] {
  const indices = new Set<number>();

  for (const part of rangeSpec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) {
      throw new PdfToolkitError(`Invalid page range segment: "${part}"`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;

    if (start < 1 || end < start || end > pageCount) {
      throw new PdfToolkitError(
        `Page range "${part}" is out of bounds for a ${pageCount}-page document`
      );
    }

    for (let page = start; page <= end; page++) indices.add(page - 1);
  }

  return [...indices].sort((a, b) => a - b);
}

export interface SplitResult {
  name: string;
  buffer: Buffer;
}

/**
 * Split a PDF. If `rangeSpec` is provided, produces a single PDF containing
 * just those pages. If omitted, produces one single-page PDF per page.
 */
export async function splitPdf(buffer: Buffer, rangeSpec?: string): Promise<SplitResult[]> {
  const source = await loadPdf(buffer);
  const pageCount = source.getPageCount();

  if (rangeSpec) {
    const indices = parsePageRanges(rangeSpec, pageCount);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(source, indices);
    for (const page of pages) doc.addPage(page);
    return [{ name: "split.pdf", buffer: Buffer.from(await doc.save()) }];
  }

  const results: SplitResult[] = [];
  for (let i = 0; i < pageCount; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(source, [i]);
    doc.addPage(page);
    results.push({ name: `page-${i + 1}.pdf`, buffer: Buffer.from(await doc.save()) });
  }
  return results;
}

/**
 * MVP compression: rewrites the PDF with object streams enabled, which
 * dedupes shared objects and compresses cross-reference data. This is a
 * modest, dependency-free win (typically 5-20% on documents with many
 * repeated objects/fonts). Deeper image-recompression is a planned v1.1
 * enhancement, not required for the MVP.
 */
export async function compressPdf(buffer: Buffer): Promise<Buffer> {
  const doc = await loadPdf(buffer);
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}

async function loadPdf(buffer: Buffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(buffer);
  } catch {
    throw new PdfToolkitError("Uploaded file is not a valid PDF");
  }
}

export async function getPageCount(buffer: Buffer): Promise<number> {
  const doc = await loadPdf(buffer);
  return doc.getPageCount();
}
