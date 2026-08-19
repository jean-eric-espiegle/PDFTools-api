import { Router } from "express";
import { upload } from "../lib/upload.js";
import { mergePdfs } from "../lib/pdf.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendError } from "../lib/response.js";

export const mergeRouter = Router();

mergeRouter.post(
  "/merge",
  upload.array("files", 20),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length < 2) {
      return sendError(res, 400, "Upload at least 2 PDF files under the 'files' field");
    }

    const merged = await mergePdfs(files.map((f) => f.buffer));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="merged.pdf"');
    res.send(merged);
  })
);
