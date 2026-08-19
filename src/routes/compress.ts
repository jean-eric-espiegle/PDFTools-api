import { Router } from "express";
import { upload } from "../lib/upload.js";
import { compressPdf } from "../lib/pdf.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendError } from "../lib/response.js";

export const compressRouter = Router();

compressRouter.post(
  "/compress",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;

    if (!file) {
      return sendError(res, 400, "Upload a PDF file under the 'file' field");
    }

    const compressed = await compressPdf(file.buffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="compressed.pdf"');
    res.setHeader("X-Original-Size-Bytes", String(file.buffer.length));
    res.setHeader("X-Compressed-Size-Bytes", String(compressed.length));
    res.send(compressed);
  })
);
