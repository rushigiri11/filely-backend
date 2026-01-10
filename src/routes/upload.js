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

    // 2️⃣ Validate expiry
    const expiryMinutes = Number(req.body.expiryMinutes);
    if (!ALLOWED_EXPIRY_MINUTES.includes(expiryMinutes)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expiry time"
      });
    }

    // 3️⃣ Expiry timestamp
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // 4️⃣ Generate code + storage path
    const code = await generateUniqueNumericCode();
    const fileId = uuidv4();
    const storagePath = `${fileId}/${file.originalname}`;

    // 5️⃣ Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("files")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype
      });

    if (uploadError) throw uploadError;

    // 6️⃣ Save metadata
    const { error: dbError } = await supabase.from("files").insert({
      code,
      original_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      storage_path: storagePath,
      expires_at: expiresAt,
      download_count: 0
    });

    if (dbError) throw dbError;

    // 7️⃣ Increment global upload counter
    await supabase.rpc("increment_total_uploads");

    // 8️⃣ Response
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

/**
 * GET /api/upload/stats
 * Returns total files uploaded on platform
 */
router.get("/stats", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("stats")
      .select("total_uploads")
      .single();

    if (error) throw error;

    res.json({
      success: true,
      totalUploads: data.total_uploads
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch stats"
    });
  }
});

export default router;
