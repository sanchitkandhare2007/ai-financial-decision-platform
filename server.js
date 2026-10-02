require("dotenv").config();
const path = require("path");
const express = require("express");
const { askClaude } = require("./services/claude");
const sheets = require("./services/sheets");

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));

// Very small in-memory rate limiter (30 requests / minute / IP) for /api
const hits = new Map();
app.use("/api", (req, res, next) => {
  const now = Date.now(), ip = req.ip, list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list);
  if (list.length > 30) return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  next();
});

const num = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const sendError = (res, e) => res.status(e.status || 500).json({ error: e.message || "Server error." });

app.get("/api/health", (req, res) => res.json({
  ok: true, claudeConfigured: !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_"),
  sheetsConfigured: !!sheets.configured(),
}));

app.post("/api/ai", async (req, res) => {
  const q = typeof req.body.question === "string" ? req.body.question.trim() : "";
  if (q.length < 5 || q.length > 500) return res.status(400).json({ error: "Question must be 5 to 500 characters." });
  try { res.json({ answer: await askClaude(q) }); } catch (e) { sendError(res, e); }
});

app.post("/api/records", async (req, res) => {
  const b = req.body || {};
  const okEmp = ["Salaried", "Self-employed", "Business owner", "Other"].includes(b.employment);
  if (typeof b.sessionId !== "string" || !/^[a-z0-9-]{8,64}$/i.test(b.sessionId) || !okEmp ||
      !num(b.income, 1, 1e8) || !num(b.age, 18, 100) || !num(b.creditScore, 300, 900) ||
      !num(b.loanAmount, 1, 1e9) || !num(b.tenure, 1, 480) || !num(b.emi, 0, 1e9) ||
      !["Eligible", "Not Eligible"].includes(b.result))
    return res.status(400).json({ error: "Invalid record data." });
  try { await sheets.addRecord(b); res.json({ ok: true }); } catch (e) { sendError(res, e); }
});

app.get("/api/records", async (req, res) => {
  const id = String(req.query.sessionId || "");
  if (!/^[a-z0-9-]{8,64}$/i.test(id)) return res.status(400).json({ error: "Invalid session id." });
  try { res.json({ records: await sheets.getRecords(id) }); } catch (e) { sendError(res, e); }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Unknown API route." }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
