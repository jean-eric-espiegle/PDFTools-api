import multer from "multer";
import { MAX_UPLOAD_BYTES } from "../config.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only application/pdf files are accepted"));
      return;
    }
    cb(null, true);
  },
});
