require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JUDGE0_URL = (process.env.JUDGE0_URL || "https://ce.judge0.com").replace(/\/+$/, "");
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || "";
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || "";
const JUDGE0_AUTH_TOKEN = process.env.JUDGE0_AUTH_TOKEN || "";
const JUDGE0_LANGUAGE_ID = Number(process.env.JUDGE0_LANGUAGE_ID || 54);

const ANSWER_KEY = [0, 1, 2, 3, 0, 1, 2, 3, 0, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 3];
const PROBLEMS = [
  { id: 0, title: "Array Statistics", marks: 5, tests: [
    { input: "10 20 30 40 50\n", expected: "50 10 30" },
    { input: "-5 -1 -9 -3 -7\n", expected: "-1 -9 -5" },
    { input: "2 2 2 2 2\n", expected: "2 2 2" },
    { input: "100 0 50 25 75\n", expected: "100 0 50" }
  ]},
  { id: 1, title: "String Analyzer", marks: 8, tests: [
    { input: "Hello World 123\n", expected: "2 8 3" },
    { input: "ABCxyz007\n", expected: "3 3 3" },
    { input: "NoDigits\n", expected: "2 6 0" },
    { input: "12345\n", expected: "0 0 5" }
  ]},
  { id: 2, title: "Recursive Array Sum", marks: 12, tests: [
    { input: "5\n1 2 3 4 5\n", expected: "15" },
    { input: "5\n-1 -2 -3 -4 -5\n", expected: "-15" },
    { input: "1\n99\n", expected: "99" },
    { input: "6\n10 0 -10 20 -5 5\n", expected: "20" }
  ]},
  { id: 3, title: "Pointer-Based Swap & Sort", marks: 15, tests: [
    { input: "5 4 3 2 1\n", expected: "1 2 3 4 5" },
    { input: "10 10 -1 0 5\n", expected: "-1 0 5 10 10" },
    { input: "7 2 9 2 1\n", expected: "1 2 2 7 9" },
    { input: "-5 -10 0 8 3\n", expected: "-10 -5 0 3 8" }
  ]}
];

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const buckets = new Map();
app.use("/api", (req, res, next) => {
  const key = req.ip || "unknown", now = Date.now();
  const b = buckets.get(key) || { start: now, count: 0 };
  if (now - b.start > 60_000) { b.start = now; b.count = 0; }
  b.count++; buckets.set(key, b);
  if (b.count > 90) return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  next();
});

function judgeHeaders() {
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if (JUDGE0_API_KEY) headers["X-RapidAPI-Key"] = JUDGE0_API_KEY;
  if (JUDGE0_AUTH_TOKEN) headers["X-Auth-Token"] = JUDGE0_AUTH_TOKEN;
  if (JUDGE0_API_HOST) headers["X-RapidAPI-Host"] = JUDGE0_API_HOST;
  return headers;
}
async function executeCpp(source_code, stdin = "") {
  const create = await fetch(`${JUDGE0_URL}/submissions/?base64_encoded=false&wait=false`, {
    method: "POST", headers: judgeHeaders(),
    body: JSON.stringify({ source_code, language_id: JUDGE0_LANGUAGE_ID, stdin,
      cpu_time_limit: 2, cpu_extra_time: 0.5, wall_time_limit: 5,
      memory_limit: 128000, stack_limit: 64000, max_file_size: 1024 })
  });
  const created = await create.json().catch(() => ({}));
  if (!create.ok || !created.token) throw new Error(created.message || created.error || `Judge0 returned HTTP ${create.status}`);
  for (let i = 0; i < 22; i++) {
    await new Promise(resolve => setTimeout(resolve, 650));
    const poll = await fetch(`${JUDGE0_URL}/submissions/${encodeURIComponent(created.token)}?base64_encoded=false`, { headers: judgeHeaders() });
    const result = await poll.json().catch(() => ({}));
    if (!poll.ok) throw new Error(result.message || `Compiler status request failed (${poll.status})`);
    if (result.status && result.status.id > 2) return result;
  }
  throw new Error("Compilation is taking too long. Please try again.");
}
function safeSource(source) { return typeof source === "string" && source.trim().length > 0 && source.length <= 30000 && !source.includes("\u0000"); }
function normalizedTokens(value) { return String(value || "").trim().split(/\s+/).filter(Boolean); }
function outputsMatch(actual, expected) {
  const a = normalizedTokens(actual), e = normalizedTokens(expected);
  return a.length === e.length && a.every((v, i) => {
    const an = Number(v), en = Number(e[i]);
    return v !== "" && e[i] !== "" && Number.isFinite(an) && Number.isFinite(en)
      ? Math.abs(an - en) <= 0.011 * Math.max(1, Math.abs(en)) : v === e[i];
  });
}
function compilerResult(r) {
  return { status: r.status?.description || "Unknown", statusId: r.status?.id || 0,
    stdout: r.stdout || "", stderr: r.stderr || "", compileOutput: r.compile_output || "",
    message: r.message || "", time: r.time || null, memory: r.memory || null };
}

app.post("/api/run", async (req, res) => {
  const { source_code, stdin = "" } = req.body || {};
  if (!safeSource(source_code)) return res.status(400).json({ error: "Enter valid C++ source code (maximum 30,000 characters)." });
  if (typeof stdin !== "string" || stdin.length > 10000) return res.status(400).json({ error: "Input is too long (maximum 10,000 characters)." });
  try { res.json(compilerResult(await executeCpp(source_code, stdin))); }
  catch (error) { res.status(502).json({ error: error.message || "Compiler service error." }); }
});

app.post("/api/submit", async (req, res) => {
  const { name, answers, code } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.length > 100) return res.status(400).json({ error: "Enter your full name." });
  if (!Array.isArray(answers) || answers.length !== 30 || !answers.every(x => x === null || (Number.isInteger(x) && x >= 0 && x <= 3))) return res.status(400).json({ error: "Invalid MCQ answer sheet." });
  if (!Array.isArray(code) || code.length !== 4 || !code.every(x => typeof x === "string" && x.length <= 30000)) return res.status(400).json({ error: "Invalid coding answer sheet." });
  const correct = answers.reduce((sum, answer, i) => sum + (answer === ANSWER_KEY[i] ? 1 : 0), 0);
  const mcqScore = correct * 2, codingResults = [];
  for (const problem of PROBLEMS) {
    const source = code[problem.id];
    if (!source.trim()) { codingResults.push({ id: problem.id, title: problem.title, marks: problem.marks, score: 0, passed: 0, total: problem.tests.length, status: "Not submitted" }); continue; }
    let passed = 0, compileError = null, runtimeError = false;
    for (const test of problem.tests) {
      try {
        const result = await executeCpp(source, test.input);
        if (result.status?.id === 3 && outputsMatch(result.stdout, test.expected)) passed++;
        else if (result.status?.id === 6) compileError = result.compile_output || result.stderr || "Compilation error";
        else if (result.status?.id > 3) runtimeError = true;
      } catch (error) { return res.status(502).json({ error: `Compiler service failed while grading ${problem.title}: ${error.message}` }); }
    }
    const score = Math.round((passed / problem.tests.length) * problem.marks * 100) / 100;
    codingResults.push({ id: problem.id, title: problem.title, marks: problem.marks, score, passed, total: problem.tests.length,
      status: passed === problem.tests.length ? "All tests passed" : compileError ? "Compilation error" : runtimeError ? "Runtime error" : "Some tests failed",
      compileError: compileError ? String(compileError).slice(0, 3000) : undefined });
  }
  const codingScore = Math.round(codingResults.reduce((sum, p) => sum + p.score, 0) * 100) / 100;
  const totalScore = Math.round((mcqScore + codingScore) * 100) / 100;
  res.json({ candidate: { name: name.trim() }, submittedAt: new Date().toISOString(),
    mcq: { score: mcqScore, max: 60, correct, total: 30, answerKey: ANSWER_KEY },
    coding: { score: codingScore, max: 40, problems: codingResults }, total: { score: totalScore, max: 100 } });
});

app.get("/api/health", (req, res) => res.json({ ok: true, compilerConfigured: Boolean(JUDGE0_URL), mode: "simple-no-login-no-storage" }));
app.listen(PORT, () => console.log(`BeSchool C++ Exam Platform running at http://localhost:${PORT}`));
