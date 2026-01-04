import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import cron from "node-cron"; // ✅ REQUIRED
import { cleanupExpiredFiles } from "./jobs/cleanupExpiredFiles.js"; // ✅ REQUIRED

const PORT = process.env.PORT || 5000;

// ⏰ Run cleanup every 60 minutes
cron.schedule("0 * * * *", () => {
  console.log("⏰ Hourly cleanup triggered");
  cleanupExpiredFiles();
});

app.listen(PORT, () => {
  console.log(`✅ Filely backend running on port ${PORT}`);
});
