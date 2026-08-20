import { Router } from "express";
import { upload } from "../lib/upload.js";
import { pdfToImages, type ImageFormat } from "../lib/pdfToImage.js";
import { zipFiles } from "../lib/zip.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendError } from "../lib/response.js";
import { trackUsage } from "../middleware/usage.js";

export const pdfToImageRouter = Router();

pdfToImageRouter.post(
  "/pdf-to-image",
  trackUsage("pdf-to-image"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;

    if (!file) {
      return sendError(res, 400, "Upload a PDF file under the 'file' field");
    }

    const format: ImageFormat = req.body?.format === "jpeg" ? "jpeg" : "png";
    const ranges = typeof req.body?.ranges === "string" ? req.body.ranges : undefined;
    const scale = req.body?.scale ? Number(req.body.scale) : 2.0;

    const results = await pdfToImages(file.buffer, format, ranges, scale);

    if (results.length === 1) {
      res.setHeader("Content-Type", format === "jpeg" ? "image/jpeg" : "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="${results[0].name}"`);
      return res.send(results[0].buffer);
    }

    const zip = await zipFiles(results);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="pages.zip"');
    res.send(zip);
  })
);
