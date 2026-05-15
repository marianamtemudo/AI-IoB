require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const groq = new Groq({
  apiKey: process.env."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"
});

const upload = multer({
  dest: "uploads/"
});

// ─────────────────────────────────────────────
// TEST ROUTE
// ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Voice Contact API running"
  });
});

// ─────────────────────────────────────────────
// TRANSCRIBE AUDIO
// ─────────────────────────────────────────────
app.post("/ai/transcribe", upload.single("audio"), async (req, res) => {
  try {
    console.log(req.file);

    // adicionar extensão .webm
    const audioPath = req.file.path + ".webm";

    fs.renameSync(req.file.path, audioPath);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-large-v3",
      response_format: "text"
    });

    // apagar ficheiro depois
    fs.unlinkSync(audioPath);

    res.json({
      text: transcription
    });

  } catch (error) {
    console.error("TRANSCRIBE ERROR:");
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
// PARSE CONTACT INFO
// ─────────────────────────────────────────────
app.post("/ai/parse", async (req, res) => {
  try {
    const text = req.body.text || "";

    // limpar transcrição
    const cleanResponse = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content:
            `Clean up this voice transcript into clear text. ` +
            `Fix grammar and punctuation. ` +
            `Return only the cleaned text:\n\n${text}`
        }
      ]
    });

    const cleaned =
      cleanResponse.choices[0].message.content.trim();

    // extrair contacto
    const parseResponse = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content:
            `Extract contact information from this text:\n\n${cleaned}\n\n` +
            `Reply ONLY with valid JSON:\n` +
            `{"name":"","company":"","role":"","location":"","topics":[],"energy":"","follow_up":"","notes":""}`
        }
      ]
    });

    const raw =
      parseResponse.choices[0].message.content
        .trim()
        .replace(/```json/g, "")
        .replace(/```/g, "");

    const contact = JSON.parse(raw);

    contact.transcript = cleaned;

    // sugestão IA
    const actionResponse = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content:
            `Based on this contact:\n${JSON.stringify(contact)}\n\n` +
            `Suggest one follow-up action in max 2 sentences.`
        }
      ]
    });

    contact.suggested_action =
      actionResponse.choices[0].message.content.trim();

    res.json(contact);

  } catch (error) {
    console.error("PARSE ERROR:");
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
// SEARCH CONTACTS
// ─────────────────────────────────────────────
app.post("/ai/search", async (req, res) => {
  try {
    const { query, contacts } = req.body;

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content:
            `You have these contacts:\n${JSON.stringify(contacts)}\n\n` +
            `User question:\n${query}\n\n` +
            `Reply helpfully and concisely.`
        }
      ]
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch (error) {
    console.error("SEARCH ERROR:");
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});