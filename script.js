/* AI Financial Decision Support Platform - frontend logic (no secrets here) */
"use strict";
const $ = (id) => document.getElementById(id);
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const ASSUMED_RATE = 10.5; // % p.a. used only for the eligibility estimate

/* ---------- session id (anonymous, random) ---------- */
function sessionId() {
  let id = localStorage.getItem("fdp_session");
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)); localStorage.setItem("fdp_session", id); }
  return id;
}

/* ---------- navigation ---------- */
const pages = ["home", "eligibility", "emi", "credit", "ai", "records", "about"];
function route() {
  const name = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  pages.forEach((p) => $(p).classList.toggle("show", p === name));
  document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + name));
  $("menu").classList.remove("open"); $("burger").setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.addEventListener("hashchange", route);
$("burger").addEventListener("click", () => { const o = $("menu").classList.toggle("open"); $("burger").setAttribute("aria-expanded", o); });

/* ---------- validation helpers ---------- */
function setErr(inputId, msg) {
  const f = $(inputId).closest(".field"); f.classList.toggle("invalid", !!msg); f.querySelector(".err").textContent = msg || "";
}
function readNum(id, label, { min, max, int = false, allowZero = false }) {
  const raw = $(id).value.trim();
  if (raw === "") { setErr(id, `${label} is required.`); return null; }
  const v = Number(raw);
  if (!Number.isFinite(v)) { setErr(id, `${label} must be a valid number.`); return null; }
  if (v < 0) { setErr(id, `${label} cannot be negative.`); return null; }
  if (v === 0 && !allowZero) { setErr(id, `${label} must be greater than 0.`); return null; }
  if (int && !Number.isInteger(v)) { setErr(id, `${label} must be a whole number.`); return null; }
  if (v < min || v > max) { setErr(id, `${label} must be between ${min.toLocaleString("en-IN")} and ${max.toLocaleString("en-IN")}.`); return null; }
  setErr(id, ""); return v;
}

/* ---------- EMI ---------- */
function calcEMI(P, annualRate, n) {
  const R = annualRate / 12 / 100;
  const emi = R === 0 ? P / n : (P * R * Math.pow(1 + R, n)) / (Math.pow(1 + R, n) - 1);
  if (!Number.isFinite(emi)) throw new Error("Calculation error: result is not a valid number.");
  return { emi, total: emi * n, interest: emi * n - P };
}
$("emiForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const P = readNum("m_amount", "Loan amount", { min: 1000, max: 100000000 });
  const r = readNum("m_rate", "Interest rate", { min: 0, max: 40, allowZero: true });
  const n = readNum("m_tenure", "Tenure", { min: 1, max: 480, int: true });
  if (P === null || r === null || n === null) return;
  try {
    const x = calcEMI(P, r, n), pp = (P / x.total) * 100;
    const box = $("emiResult"); box.className = "glass result";
    box.innerHTML = `<small>Monthly EMI</small><div class="big">${inr(x.emi)}</div>
      <div class="stats"><div class="stat"><small>Principal</small><b>${inr(P)}</b></div>
      <div class="stat"><small>Total interest</small><b>${inr(x.interest)}</b></div>
      <div class="stat"><small>Total payment</small><b>${inr(x.total)}</b></div></div>
      <div class="bar"><i class="p" style="width:${pp.toFixed(1)}%"></i><i class="i" style="width:${(100 - pp).toFixed(1)}%"></i></div>
      <div class="legend"><span><span class="dot p"></span>Principal ${pp.toFixed(1)}%</span><span><span class="dot i"></span>Interest ${(100 - pp).toFixed(1)}%</span></div>`;
  } catch (err) { $("emiResult").className = "glass result"; $("emiResult").textContent = err.message; }
});

/* ---------- Loan eligibility (simple, explainable rules) ---------- */
function maxLoanFromEmi(emiCap, annualRate, n) {
  const R = annualRate / 12 / 100;
  return R === 0 ? emiCap * n : (emiCap * (Math.pow(1 + R, n) - 1)) / (R * Math.pow(1 + R, n));
}
function checkEligibility(d) {
  const factors = [], fails = [];
  const newEmi = calcEMI(d.amount, ASSUMED_RATE, d.tenure).emi;
  const foir = ((d.emis + newEmi) / d.income) * 100;           // total EMI burden %
  const emiCap = Math.max(0, d.income * 0.5 - d.emis);          // 50% rule
  const maxLoan = maxLoanFromEmi(emiCap, ASSUMED_RATE, d.tenure);
  let pts = 0;

  // Credit score (40 pts)
  if (d.score >= 750) { pts += 40; factors.push(["good", `Excellent credit score (${d.score}).`]); }
  else if (d.score >= 700) { pts += 32; factors.push(["good", `Good credit score (${d.score}).`]); }
  else if (d.score >= 650) { pts += 22; factors.push(["warn", `Average credit score (${d.score}); better scores get better terms.`]); }
  else { pts += 5; fails.push(`Credit score ${d.score} is below the minimum of 650.`); factors.push(["bad", `Low credit score (${d.score}).`]); }
  // EMI burden (35 pts)
  if (foir <= 30) { pts += 35; factors.push(["good", `Total EMI burden is low (${foir.toFixed(0)}% of income).`]); }
  else if (foir <= 40) { pts += 26; factors.push(["warn", `EMI burden is moderate (${foir.toFixed(0)}% of income).`]); }
  else if (foir <= 50) { pts += 15; factors.push(["warn", `EMI burden is high (${foir.toFixed(0)}% of income).`]); }
  else { pts += 0; fails.push(`Total EMI burden is ${foir.toFixed(0)}% of income (limit 50%).`); factors.push(["bad", `EMI burden too high (${foir.toFixed(0)}%).`]); }
  // Employment (15 pts)
  const empPts = { "Salaried": 15, "Business owner": 11, "Self-employed": 10, "Other": 5 }[d.emp];
  pts += empPts; factors.push([empPts >= 10 ? "good" : "warn", `Employment type: ${d.emp}${empPts >= 10 ? " (stable income pattern)" : " (income may be seen as less predictable)"}.`]);
  // Age (10 pts) + hard limits at repayment end
  const endAge = d.age + d.tenure / 12;
  if (d.age < 21) { fails.push("Minimum age for a loan is 21."); factors.push(["bad", "Age is below 21."]); }
  else if (endAge > 65) { fails.push(`Loan would end at age ${endAge.toFixed(0)}; maximum is 65.`); factors.push(["bad", "Tenure extends beyond age 65."]); }
  else { pts += d.age <= 50 ? 10 : 6; factors.push(["good", "Age and tenure are within normal limits."]); }
  // Income (hard limit)
  if (d.income < 15000) { fails.push("Monthly income is below the minimum of ₹15,000."); factors.push(["bad", "Income below ₹15,000."]); }
  else factors.push(["good", `Monthly income: ${inr(d.income)}.`]);
  // Requested amount vs affordable amount
  if (d.amount > maxLoan) { fails.push(`Requested amount exceeds the estimated affordable loan of ${inr(maxLoan)}.`); factors.push(["bad", "Requested amount is higher than what your income can support."]); }

  const eligible = fails.length === 0 && pts >= 55;
  const level = !eligible ? "Low" : pts >= 80 ? "High" : "Moderate";
  return { eligible, level, pts, factors, fails, newEmi, foir, maxLoan };
}
let lastElig = null;
function readEligForm() {
  const d = {
    income: readNum("e_income", "Monthly income", { min: 1000, max: 10000000 }),
    age: readNum("e_age", "Age", { min: 18, max: 80, int: true }),
    emis: readNum("e_emis", "Existing EMIs", { min: 0, max: 10000000, allowZero: true }),
    score: readNum("e_score", "Credit score", { min: 300, max: 900, int: true }),
    amount: readNum("e_amount", "Loan amount", { min: 1000, max: 100000000 }),
    tenure: readNum("e_tenure", "Loan tenure", { min: 6, max: 360, int: true }),
    emp: $("e_emp").value,
  };
  if (!d.emp) setErr("e_emp", "Please select an employment type."); else setErr("e_emp", "");
  return Object.values(d).some((v) => v === null || v === "") ? null : d;
}
$("eligForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = readEligForm(); if (!d) return;
  let r;
  try { r = checkEligibility(d); } catch (err) { $("eligResult").className = "glass result"; $("eligResult").textContent = err.message; return; }
  const cls = r.eligible ? (r.level === "High" ? "ok" : "mid") : "no";
  const box = $("eligResult"); box.className = "glass result";
  box.innerHTML = `<span class="badge ${cls}">${r.eligible ? "Eligible" : "Not Eligible"}</span>
    <div>Estimated eligibility level: <b>${r.level}</b> (score ${r.pts}/100)</div>
    <div class="stats"><div class="stat"><small>Estimated EMI*</small><b>${inr(r.newEmi)}</b></div>
    <div class="stat"><small>Total EMI burden</small><b>${r.foir.toFixed(0)}%</b></div>
    <div class="stat"><small>Affordable loan</small><b>${inr(r.maxLoan)}</b></div></div>
    <h3>Important factors</h3><ul>${r.factors.map(([t, m]) => `<li>${t === "good" ? "✅" : t === "warn" ? "⚠️" : "❌"} ${m}</li>`).join("")}</ul>
    <h3>Explanation</h3><p>${r.eligible
      ? "Your profile meets the basic rules used in this demo: acceptable credit score, income, age and an EMI burden within 50% of income."
      : "Your profile does not meet these rules: " + r.fails.join(" ")}</p>
    <p class="note">*Calculated at an assumed ${ASSUMED_RATE}% p.a. <b>This is an educational estimate and not an actual loan approval.</b></p>
    <div id="saveStatus" class="note">Saving record…</div>`;
  lastElig = { d, r };
  await saveRecord(d, r);
});
async function saveRecord(d, r) {
  const rec = { sessionId: sessionId(), income: d.income, employment: d.emp, age: d.age, creditScore: d.score,
    loanAmount: d.amount, tenure: d.tenure, emi: Math.round(r.newEmi), result: r.eligible ? "Eligible" : "Not Eligible" };
  const s = $("saveStatus");
  try {
    const res = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Save failed.");
    s.textContent = "✅ Record saved to Google Sheets.";
  } catch (err) {
    const local = JSON.parse(localStorage.getItem("fdp_local") || "[]");
    local.push({ DateTime: new Date().toISOString(), MonthlyIncome: rec.income, EmploymentType: rec.employment, Age: rec.age,
      CreditScore: rec.creditScore, LoanAmount: rec.loanAmount, TenureMonths: rec.tenure, EMI: rec.emi, Result: rec.result });
    localStorage.setItem("fdp_local", JSON.stringify(local.slice(-50)));
    s.textContent = `⚠️ ${err.message} Saved only in this browser instead.`;
  }
}
$("eDemo").addEventListener("click", () => {
  const v = { e_income: 60000, e_emp: "Salaried", e_age: 28, e_emis: 5000, e_score: 745, e_amount: 600000, e_tenure: 60 };
  Object.entries(v).forEach(([k, val]) => { $(k).value = val; setErr(k, ""); });
});

/* ---------- Credit score analyzer ---------- */
const BANDS = [
  { min: 750, max: 900, name: "Excellent", cls: "ok", info: "Lenders usually see you as low risk and may offer better rates.",
    pos: ["Strong repayment history", "Healthy credit mix and low utilisation"], risk: ["Applying for too many new loans can still lower the score"],
    tips: ["Keep paying on time", "Keep card use under 30% of the limit", "Check your report yearly for errors"] },
  { min: 700, max: 749, name: "Good", cls: "ok", info: "Generally acceptable to most lenders with competitive offers.",
    pos: ["Mostly timely payments", "Reasonable credit usage"], risk: ["A few late payments or high utilisation could be holding the score back"],
    tips: ["Reduce card balances", "Avoid multiple loan applications close together", "Set auto-pay for EMIs"] },
  { min: 650, max: 699, name: "Fair", cls: "mid", info: "You may get approval, but interest rates can be higher.",
    pos: ["Some positive credit history exists"], risk: ["Possible missed payments or high utilisation", "Limited credit history"],
    tips: ["Clear overdue amounts first", "Lower card utilisation", "Do not close old accounts without need"] },
  { min: 550, max: 649, name: "Poor", cls: "no", info: "Approval is difficult and rates are usually high.",
    pos: ["You can rebuild with steady habits"], risk: ["Late or missed payments", "High debt compared with income", "Recent defaults or settlements"],
    tips: ["Pay every due date", "Keep balances low", "Consider a small secured card to rebuild", "Avoid new debt for now"] },
  { min: 300, max: 549, name: "Very Poor", cls: "no", info: "Most lenders are likely to decline new credit.",
    pos: ["Scores can improve over time with disciplined repayment"], risk: ["Serious delinquencies or defaults", "Very high credit utilisation"],
    tips: ["Settle overdue accounts", "Create a monthly budget", "Seek free credit counselling", "Check your report for mistakes"] },
];
$("creditForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = readNum("c_score", "Credit score", { min: 300, max: 900, int: true }); if (s === null) return;
  const b = BANDS.find((x) => s >= x.min && s <= x.max), pos = ((s - 300) / 600) * 100;
  const box = $("creditResult"); box.className = "glass result";
  box.innerHTML = `<span class="badge ${b.cls}">${b.name}</span> <b>${s}</b> <small>(range ${b.min}–${b.max})</small>
    <div class="meter"><span style="left:calc(${pos}% - 2px)"></span></div><div class="legend"><span>300</span><span style="margin-left:auto">900</span></div>
    <h3>Interpretation</h3><p>${b.info}</p>
    <h3>Positive factors</h3><ul>${b.pos.map((x) => `<li>${x}</li>`).join("")}</ul>
    <h3>Possible risk factors</h3><ul>${b.risk.map((x) => `<li>${x}</li>`).join("")}</ul>
    <h3>Suggestions</h3><ul>${b.tips.map((x) => `<li>${x}</li>`).join("")}</ul>
    <p class="note"><b>Credit score analysis is for educational purposes only.</b> It is not an official credit bureau report.</p>`;
});

/* ---------- AI tips (calls our own backend, never Anthropic directly) ---------- */
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { $("a_q").value = c.textContent; setErr("a_q", ""); }));
$("aiForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("a_q").value.trim();
  if (q.length < 5) return setErr("a_q", "Please enter a question (at least 5 characters).");
  if (q.length > 500) return setErr("a_q", "Question must be under 500 characters.");
  setErr("a_q", "");
  const btn = $("aiBtn"), out = $("aiResult");
  btn.disabled = true; btn.textContent = "Thinking…"; out.hidden = false; out.className = "ai-answer"; out.textContent = "Getting guidance…";
  try {
    const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "AI service failed.");
    if (!data.answer) throw new Error("The AI returned an empty response. Please try again.");
    out.textContent = data.answer;
  } catch (err) {
    out.className = "ai-answer error";
    out.textContent = "⚠️ " + (err.message === "Failed to fetch" ? "Cannot reach the server. Is it running (npm start)?" : err.message);
  } finally { btn.disabled = false; btn.textContent = "Get AI Guidance"; }
});

/* ---------- Records ---------- */
const DEMO_RECORDS = [
  { DateTime: "2026-01-10T10:00:00Z", MonthlyIncome: 45000, EmploymentType: "Salaried", Age: 26, CreditScore: 720, LoanAmount: 400000, TenureMonths: 48, EMI: 10300, Result: "Eligible" },
  { DateTime: "2026-01-12T14:30:00Z", MonthlyIncome: 22000, EmploymentType: "Self-employed", Age: 34, CreditScore: 610, LoanAmount: 800000, TenureMonths: 60, EMI: 17200, Result: "Not Eligible" },
  { DateTime: "2026-01-15T09:15:00Z", MonthlyIncome: 90000, EmploymentType: "Business owner", Age: 41, CreditScore: 780, LoanAmount: 1500000, TenureMonths: 120, EMI: 20200, Result: "Eligible" },
];
function renderRecords(list) {
  const tb = document.querySelector("#recTable tbody"); tb.innerHTML = "";
  list.slice().reverse().forEach((r) => {
    const tr = document.createElement("tr");
    [new Date(r.DateTime).toLocaleDateString("en-IN"), inr(+r.MonthlyIncome), r.EmploymentType, r.Age, r.CreditScore, inr(+r.LoanAmount), r.TenureMonths + " m", inr(+r.EMI), r.Result]
      .forEach((v) => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); }); // textContent = safe from HTML injection
    tb.appendChild(tr);
  });
}
$("loadRecords").addEventListener("click", async () => {
  const st = $("recStatus"); st.textContent = "Loading…";
  try {
    const res = await fetch("/api/records?sessionId=" + encodeURIComponent(sessionId()));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load records.");
    if (!data.records.length) { st.textContent = "No records found for this browser session yet."; renderRecords([]); return; }
    renderRecords(data.records); st.textContent = `Loaded ${data.records.length} record(s) from Google Sheets.`;
  } catch (err) {
    const local = JSON.parse(localStorage.getItem("fdp_local") || "[]");
    renderRecords(local);
    st.textContent = `⚠️ ${err.message} Showing ${local.length} record(s) stored in this browser.`;
  }
});
$("demoRecords").addEventListener("click", () => { renderRecords(DEMO_RECORDS); $("recStatus").textContent = "Showing safe demo records (not real data)."; });

route();
