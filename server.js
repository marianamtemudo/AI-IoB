require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();
const PORT = 4000;

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },

  filename: function (req, file, cb) {

    const ext =
      file.mimetype.includes("webm")
        ? ".webm"
        : ".wav";

    cb(
      null,
      Date.now() + ext
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

// ─────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─────────────────────────────────────────────
// TRANSCRIBE
// ─────────────────────────────────────────────

app.post(
  "/ai/transcribe",
  upload.single("audio"),
  async (req, res) => {
    console.log(req.file);
    try {

      if (!req.file) {
        return res.status(400).json({
          error: "No audio file uploaded",
        });
      }

      const transcription =
        await groq.audio.transcriptions.create({
          file: fs.createReadStream(req.file.path),
          model: "whisper-large-v3",
          response_format: "text",
        });

      fs.unlinkSync(req.file.path);

      res.json({
        text: transcription,
      });

    } catch (error) {

      console.error("TRANSCRIBE ERROR:");
      console.error(error);

      if (
        req.file?.path &&
        fs.existsSync(req.file.path)
      ) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        error: "Transcription failed",
      });
    }
  }
);

// ─────────────────────────────────────────────
// PARSE CONTACT
// ─────────────────────────────────────────────

app.post("/ai/parse", async (req, res) => {
  try {

    const text = req.body.text || "";

    const response =
      await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: `
Extract contact information from this text:

"${text}"

Reply ONLY with valid JSON.

{
  "name": "",
  "company": "",
  "role": "",
  "location": "",
  "topics": [],
  "notes": ""
}
            `,
          },
        ],
      });

    const raw =
      response.choices[0].message.content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    const contact = JSON.parse(raw);

    res.json(contact);

  } catch (error) {

    console.error("PARSE ERROR:");
    console.error(error);

    res.status(500).json({
      error: "Parse failed",
    });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});