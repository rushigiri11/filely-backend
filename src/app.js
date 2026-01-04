import express from "express";
import cors from "cors";
import supabase from "./supabase.js";
import uploadRoute from "./routes/upload.js";
import downloadRoute from "./routes/download.js";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Filely backend is running 🚀");
});

app.use("/api/upload", uploadRoute);
app.use("/api/download", downloadRoute);

app.get("/health/db", async (req, res) => {
  const { data, error } = await supabase
    .from("files")
    .select("id")
    .limit(1);

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  res.json({
    success: true,
    message: "Database connected successfully",
    data
  });
});

export default app;
