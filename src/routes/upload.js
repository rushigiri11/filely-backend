import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import supabase from "../supabase.js";

const router = express.Router();

/**
 * Multer config (store file in memory)
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

/**
 * Allowed expiry times (minutes)
 */
const ALLOWED_EXPIRY_MINUTES = [5, 10, 20, 30, 60];

/**
 * Generate a unique 6-digit numeric code
 */
async function generateUniqueNumericCode() {
  let code;
  let exists = true;

  while (exists) {
    code = Math.floor(100000 + Math.random() * 900000).toString();

    const { data } = await supabase
      .from("files")
      .select("id")
      .eq("code", code)
      .single();

    exists = !!data;
  }

  return code;
}

/**
 * POST /api/upload
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    // 1️⃣ Validate file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    const file = req.file;

    // 2️⃣ Validate expiry (from frontend)
    const expiryMinutes = Number(req.body.expiryMinutes);

    if (!ALLOWED_EXPIRY_MINUTES.includes(expiryMinutes)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expiry time"
      });
    }

    // 3️⃣ Generate expiry timestamp
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // 4️⃣ Generate unique numeric code
    const code = await generateUniqueNumericCode();
    const fileId = uuidv4();

    const storagePath = `${fileId}/${file.originalname}`;

    // 5️⃣ Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("files")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype
      });

    if (uploadError) {
      throw uploadError;
    }

    // 6️⃣ Save metadata in database
    const { error: dbError } = await supabase.from("files").insert({
      code,
      original_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      storage_path: storagePath,
      expires_at: expiresAt,
      max_downloads: 1,
      download_count: 0
    });

    if (dbError) {
      throw dbError;
    }

    // 7️⃣ Response
    res.json({
      success: true,
      code,
      expiresIn: `${expiryMinutes} minutes`
    });

  } catch (err) {
    console.error("Upload error:", err);

    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

export default router;
