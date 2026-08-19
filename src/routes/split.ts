import { Router } from "express";
import { upload } from "../lib/upload.js";
import { splitPdf } from "../lib/pdf.js";
import { zipFiles } from "../lib/zip.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendError } from "../lib/response.js";

export const splitRouter = Router();

splitRouter.post(
  "/split",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;

    if (!file) {
      return sendError(res, 400, "Upload a PDF file under the 'file' field");
    }

    const ranges = typeof req.body?.ranges === "string" ? req.body.ranges : undefined;
    const results = await splitPdf(file.buffer, ranges);

    if (results.length === 1) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${results[0].name}"`);
      return res.send(results[0].buffer);
    }

    const zip = await zipFiles(results);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="split-pages.zip"');
    res.send(zip);
  })
);
