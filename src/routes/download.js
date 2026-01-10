import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

/**
 * GET /api/download/:code
 * Unlimited access until expiry
 */
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    // 1️⃣ Fetch file
    const { data: file, error } = await supabase
      .from("files")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !file) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired link"
      });
    }

    // 2️⃣ Expiry check ONLY
    if (new Date(file.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: "File has expired"
      });
    }

    // 3️⃣ Generate signed URL (60 seconds)
    const { data: signed, error: urlError } =
      await supabase.storage
        .from("files")
        .createSignedUrl(file.storage_path, 60);

    if (urlError) throw urlError;

    // 4️⃣ Increment count (analytics only)
    await supabase
      .from("files")
      .update({
        download_count: file.download_count + 1
      })
      .eq("id", file.id);

    // 5️⃣ Respond
    res.json({
      success: true,
      fileName: file.original_name,
      downloadUrl: signed.signedUrl
    });

  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

export default router;
