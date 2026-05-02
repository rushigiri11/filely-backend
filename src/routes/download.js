import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

async function getFilesByCode(code) {
  const { data: files, error } = await supabase
    .from("files")
    .select("*")
    .eq("code", code)
    .order("original_name", { ascending: true });

  if (error) {
    throw error;
  }

  return files || [];
}

function getActiveFiles(files) {
  const now = new Date();

  return files.filter((file) => new Date(file.expires_at) >= now);
}

function formatFile(file) {
  return {
    id: file.id,
    fileName: file.original_name,
    fileSize: file.file_size,
    mimeType: file.mime_type
  };
}

async function createSignedDownload(file) {
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(file.storage_path, 60, {
      download: file.original_name
    });

  if (error) {
    throw error;
  }

  return {
    ...formatFile(file),
    downloadUrl: data.signedUrl
  };
}

async function incrementDownloadCount(file) {
  await supabase
    .from("files")
    .update({
      download_count: (file.download_count || 0) + 1
    })
    .eq("id", file.id);
}

/**
 * GET /api/download/:code
 * Returns all downloadable files for a code
 */
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const files = await getFilesByCode(code);

    if (!files.length) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired link"
      });
    }

    const activeFiles = getActiveFiles(files);

    if (!activeFiles.length) {
      return res.status(410).json({
        success: false,
        error: "Files have expired"
      });
    }

    res.json({
      success: true,
      code,
      fileCount: activeFiles.length,
      expiresAt: activeFiles[0].expires_at,
      files: activeFiles.map(formatFile)
    });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * GET /api/download/:code/files/:fileId
 * Returns a fresh signed URL for one file
 */
router.get("/:code/files/:fileId", async (req, res) => {
  try {
    const { code, fileId } = req.params;
    const files = await getFilesByCode(code);

    if (!files.length) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired link"
      });
    }

    const file = files.find((entry) => entry.id === fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found"
      });
    }

    if (new Date(file.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: "File has expired"
      });
    }

    const signedFile = await createSignedDownload(file);
    await incrementDownloadCount(file);

    res.json({
      success: true,
      ...signedFile
    });
  } catch (err) {
    console.error("Single download error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * GET /api/download/:code/all
 * Returns fresh signed URLs for all active files
 */
router.get("/:code/all", async (req, res) => {
  try {
    const { code } = req.params;
    const files = await getFilesByCode(code);

    if (!files.length) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired link"
      });
    }

    const activeFiles = getActiveFiles(files);

    if (!activeFiles.length) {
      return res.status(410).json({
        success: false,
        error: "Files have expired"
      });
    }

    const signedFiles = await Promise.all(
      activeFiles.map(createSignedDownload)
    );

    await Promise.all(activeFiles.map(incrementDownloadCount));

    res.json({
      success: true,
      code,
      fileCount: signedFiles.length,
      files: signedFiles
    });
  } catch (err) {
    console.error("Download all error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

export default router;
