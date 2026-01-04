import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

const PORT = process.env.PORT || 5000;

cron.schedule("0 * * * *", () => {
  console.log("⏰ Hourly cleanup triggered");
  cleanupExpiredFiles();
});


app.listen(PORT, () => {
  console.log(`✅ Filely backend running on port ${PORT}`);
});
