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


const upload = multer({ dest: "uploads/" });

/* ============================================================
   📌 SYSTEME DE COMPTEUR DE VISITES
============================================================ */

// ▶️ Incrémenter le compteur
app.get("/visit", async (req, res) => {
  const { data: current, error: fetchErr } = await supabase
    .from("stats")
    .select("*")
    .eq("id", 1)
    .single();

  if (fetchErr) return res.status(500).json(fetchErr);

  const newCount = (current?.visits || 0) + 1;

  const { error: updateErr } = await supabase
    .from("stats")
    .update({ visits: newCount })
    .eq("id", 1);

  if (updateErr) return res.status(500).json(updateErr);

  res.json({ visits: newCount });
});

// ▶️ Obtenir le compteur
app.get("/visits", async (req, res) => {
  const { data, error } = await supabase
    .from("stats")
    .select("visits")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
});

/* ============================================================
   📌 CRUD ITEMS
============================================================ */

// -------------------------
// CREATE – Ajouter item
// -------------------------
app.post("/items", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    const description = req.body.description;

    if (!file) return res.status(400).json({ error: "Image requise." });

    const filePath = `items/${Date.now()}-${file.originalname}`;

    // Upload dans Supabase Storage
    const { error: storageError } = await supabase.storage
      .from("items-images")
      .upload(filePath, fs.readFileSync(file.path), {
        contentType: file.mimetype,
      });

    fs.unlinkSync(file.path);

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
// READ – Lire tout
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
// READ BY ID
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
// UPDATE
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
// DELETE + SUPPRESSION IMAGE STORAGE
// -------------------------
app.delete("/items/:id", async (req, res) => {
  // 1️⃣ Récupérer item
  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (fetchErr || !item) return res.status(404).json({ error: "Not found" });

  // 2️⃣ Extraire le chemin du fichier dans Supabase Storage
  const url = item.image_url;
  const filePath = url.split("/items-images/")[1];

  // 3️⃣ Supprimer fichier dans Supabase Storage
  const { error: storageErr } = await supabase.storage
    .from("items-images")
    .remove([filePath]);

  if (storageErr) console.log("Erreur suppression image :", storageErr);

  // 4️⃣ Supprimer dans la base
  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json(error);

  res.json({ success: true });
});

/* ============================================================
   SERVER
============================================================ */

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
