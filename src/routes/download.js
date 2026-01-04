import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

/**
 * GET /api/download/:code
 * Returns a signed download URL
 */
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    // 1️⃣ Fetch file metadata by code
    const { data: file, error } = await supabase
      .from("files")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !file) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired code"
      });
    }

    // 2️⃣ Check expiry
    if (new Date(file.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: "File has expired"
      });
    }

    // 3️⃣ Check download limit
    if (file.download_count >= file.max_downloads) {
      return res.status(403).json({
        success: false,
        error: "Download limit reached"
      });
    }

    // 4️⃣ Generate signed URL (valid for 1 minute)
    const { data: signedUrl, error: urlError } =
      await supabase.storage
        .from("files")
        .createSignedUrl(file.storage_path, 60);

    if (urlError) {
      throw urlError;
    }

    // 5️⃣ Increment download count
    await supabase
      .from("files")
      .update({ download_count: file.download_count + 1 })
      .eq("id", file.id);

    // 6️⃣ Send download URL
    res.json({
      success: true,
      fileName: file.original_name,
      downloadUrl: signedUrl.signedUrl
    });

  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
