import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// --- Supabase Client (service role) ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Multer (pour recevoir fichiers) ---
const upload = multer({ dest: "uploads/" });

// -------------------------
// 📌 CREATE – Ajouter item
// -------------------------
app.post("/items", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    const description = req.body.description;

    if (!file) return res.status(400).json({ error: "Image requise." });

    const filePath = `items/${Date.now()}-${file.originalname}`;

    // Upload dans Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from("items-images")
      .upload(filePath, fs.readFileSync(file.path), {
        contentType: file.mimetype,
      });

    fs.unlinkSync(file.path); // delete temp file

    if (storageError) return res.status(500).json(storageError);

    // URL publique
    const { data: publicUrl } = supabase.storage
      .from("items-images")
      .getPublicUrl(filePath);

    // Insert DB
    const { data, error } = await supabase
      .from("items")
      .insert({
        image_url: publicUrl.publicUrl,
        description,
      })
      .select();

    if (error) return res.status(500).json(error);

    res.json({ success: true, item: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// 📌 READ – Lire tout
// -------------------------
app.get("/items", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json(error);

  res.json(data);
});

// -------------------------
// 📌 READ BY ID
// -------------------------
app.get("/items/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
});

// -------------------------
// 📌 UPDATE (description seulement)
// -------------------------
app.put("/items/:id", async (req, res) => {
  const { description } = req.body;

  const { data, error } = await supabase
    .from("items")
    .update({ description })
    .eq("id", req.params.id)
    .select();

  if (error) return res.status(500).json(error);

  res.json(data[0]);
});

// -------------------------
// 📌 DELETE
// -------------------------
app.delete("/items/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json(error);

  res.json({ success: true });
});

// -------------------------
// Start Server
// -------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
