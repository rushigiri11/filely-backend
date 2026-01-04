import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import supabase from "../supabase.js";

const router = express.Router();

// Store file in memory (we upload directly to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

// Generate short share code
function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const code = generateCode();
    const fileId = uuidv4();

    const storagePath = `${fileId}/${file.originalname}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("files")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype
      });

    if (uploadError) {
      throw uploadError;
    }

    // Save metadata in DB
    const { error: dbError } = await supabase.from("files").insert({
      code,
      original_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      storage_path: storagePath,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h expiry
    });

    if (dbError) {
      throw dbError;
    }

    res.json({
      success: true,
      code,
      expiresIn: "24 hours"
    });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
