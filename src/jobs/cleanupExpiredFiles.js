import supabase from "../supabase.js";

export async function cleanupExpiredFiles() {
  console.log("🧹 Cleanup job started");

  const { data: files, error } = await supabase
    .from("files")
    .select("id, storage_path")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  if (!files || files.length === 0) {
    console.log("✅ No expired files");
    return;
  }

  // Delete from storage
  const paths = files.map(f => f.storage_path);

  const { error: storageError } = await supabase.storage
    .from("files")
    .remove(paths);

  if (storageError) {
    console.error("Storage delete error:", storageError);
    return;
  }

  // Delete DB rows
  const ids = files.map(f => f.id);

  const { error: dbError } = await supabase
    .from("files")
    .delete()
    .in("id", ids);

  if (dbError) {
    console.error("DB delete error:", dbError);
    return;
  }

  console.log(`🗑 Deleted ${files.length} expired files`);
}
