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

const MAX_FILES = 15;

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
      .maybeSingle(); // safer than single()

    exists = !!data;
  }

  return code;
}

/**
 * POST /api/upload
 */
router.post(
  "/",
  upload.fields([
    { name: "files", maxCount: MAX_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const uploadedFiles = [
      ...(req.files?.files || []),
      ...(req.files?.file || [])
    ];

    // 1. Validate files
    if (!uploadedFiles.length) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded"
      });
    }

    if (uploadedFiles.length > MAX_FILES) {
      return res.status(400).json({
        success: false,
        error: `You can upload up to ${MAX_FILES} files at once`
      });
    }

    // 2. Validate expiry
    const expiryMinutes = Number(req.body.expiryMinutes);
    if (!ALLOWED_EXPIRY_MINUTES.includes(expiryMinutes)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expiry time"
      });
    }

    // 3. Expiry timestamp
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // 4. Generate one shared code for the whole upload batch
    const code = await generateUniqueNumericCode();

    const uploadedStoragePaths = [];
    const records = [];

    // 5. Upload all files to Supabase Storage
    for (const file of uploadedFiles) {
      const fileId = uuidv4();
      const storagePath = `${code}/${fileId}/${file.originalname}`;

      const { error: uploadError } = await supabase.storage
        .from("files")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadedStoragePaths.push(storagePath);
      records.push({
        code,
        original_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
        storage_path: storagePath,
        expires_at: expiresAt,
        download_count: 0
      });
    }

    // 6. Save metadata in DB
    const { error: dbError } = await supabase.from("files").insert(records);

    if (dbError) {
      await Promise.all(
        uploadedStoragePaths.map((storagePath) =>
          supabase.storage.from("files").remove([storagePath])
        )
      );

      throw dbError;
    }

    // 7. Increment global upload counter once per file
    const rpcCalls = Array.from({ length: uploadedFiles.length }, () =>
      supabase.rpc("increment_total_uploads")
    );

    const rpcResults = await Promise.all(rpcCalls);
    const hasRpcError = rpcResults.some(({ error }) => error);

    if (hasRpcError) {
      console.error(
        "RPC error:",
        rpcResults.find(({ error }) => error)?.error
      );
    }

    // 8. Response
    res.json({
      success: true,
      code,
      expiresIn: `${expiryMinutes} minutes`,
      fileCount: uploadedFiles.length,
      files: uploadedFiles.map((file) => ({
        fileName: file.originalname,
        fileSize: file.size
      }))
    });
  } catch (err) {
    console.error("Upload error:", err);

    const isDuplicateCodeError =
      err?.code === "23505" &&
      typeof err?.message === "string" &&
      err.message.toLowerCase().includes("code");

    if (isDuplicateCodeError) {
      return res.status(500).json({
        success: false,
        error:
          "Database schema still has a unique constraint on files.code. Remove that unique constraint to allow multi-file uploads with one shared code."
      });
    }

    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err?.message || "Internal server error"
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
      .limit(1)
      .maybeSingle(); // avoids crash if multiple rows

    if (error) throw error;

    res.json({
      success: true,
      totalUploads: data?.total_uploads || 0
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
