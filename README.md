# AI Financial Decision Support Platform

## 1. Project Title
AI Financial Decision Support Platform – a BFSI (Banking, Financial Services and Insurance) educational web app.

## 2. Problem Statement
Many students and first-time borrowers do not understand EMIs, credit scores or how much loan they can reasonably afford. Bank tools are often complex or require personal details.

## 3. Objective
Provide a simple, explainable, privacy-friendly platform to estimate loan eligibility, calculate EMIs, understand credit scores and get AI-generated educational guidance.

## 4. Features
- Loan eligibility checker with validation and explainable factors
- EMI calculator with principal/interest breakdown bar
- Credit score analyzer (300–900 bands, interpretation, tips)
- AI Financial Tips using the Anthropic Claude API (through a secure backend proxy)
- Google Sheets storage of anonymous records, with a records page
- Dark glassmorphism, responsive UI (desktop, tablet, mobile), demo data

> All outputs are educational estimates – not loan approvals, credit reports or financial advice.

## 5. Technologies Used
HTML5, CSS3, JavaScript (frontend) · Node.js + Express (backend) · Anthropic Messages API · Google Sheets API (`googleapis`) · dotenv.

## 6. System Requirements
Node.js 18 or newer (uses built-in `fetch`), npm, a modern browser, internet access for Claude and Sheets.

## 7. Project Architecture
```
Browser (frontend/) ──► Express server (backend/server.js) ──► Anthropic API   (services/claude.js)
                                                          └──► Google Sheets   (services/sheets.js)
```
Secrets live only in `.env` on the server. The browser never sees an API key.

```
ai-financial-decision-platform/
├── frontend/   index.html, style.css, script.js
├── backend/    server.js, services/claude.js, services/sheets.js
├── assets/     (images/screenshots)
├── .env.example  .gitignore  README.md  package.json
```

## 8. Modules
1. **Loan Eligibility** – points-based rules: credit score (40), EMI burden (35), employment (15), age (10); hard rules: age 21–65 at loan end, income ≥ ₹15,000, score ≥ 650, total EMIs ≤ 50% of income, amount ≤ affordable loan. Eligible if no hard rule fails and points ≥ 55 (High ≥ 80). Assumed rate: 10.5%.
2. **EMI Calculator** – `EMI = P × R × (1+R)^N / ((1+R)^N − 1)`, R = annual rate / 12 / 100 (0% rate handled as P/N).
3. **Credit Score Analyzer** – five bands (Very Poor … Excellent).
4. **AI Financial Tips** – `POST /api/ai`, system prompt keeps answers simple and non-advisory.
5. **Records** – `POST/GET /api/records`; only the record of the current anonymous session is returned.

## 9. Workflow
User fills a form → JavaScript validates → logic runs in the browser → result shown → record (numbers only + random session ID) sent to the backend → backend validates again → appended to Google Sheets. AI questions go browser → backend → Claude → backend → browser.

## 10. Installation Steps
```bash
git clone <your-repo-url>
cd ai-financial-decision-platform
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

## 11. API Configuration (Claude)
1. Create an account at https://console.anthropic.com and generate an API key.
2. Put it in `.env`: `ANTHROPIC_API_KEY=...` (optionally change `ANTHROPIC_MODEL`).
3. Never commit `.env` (already in `.gitignore`).

## 12. Google Sheets Configuration
1. Create a Google Sheet; rename the first tab to **Records**. Copy the ID from the URL (`/d/<ID>/edit`).
2. Google Cloud Console → create a project → enable **Google Sheets API**.
3. IAM & Admin → Service Accounts → create one → Keys → Add key → JSON (download).
4. Share the Sheet with the service account email as **Editor**.
5. In `.env` set `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` (the `private_key` value, in quotes, keeping `\n`).
The header row is created automatically on first save.

## 13. How to Run
```bash
npm start
```
Open http://localhost:3000. Without keys, everything except AI and Sheets still works; the app shows clear messages and keeps records in the browser instead.

## 14. Screenshots
Add images to `assets/` and link them here, e.g. `![Home](assets/home.png)`.

## 15. Testing
| Test | Input | Expected |
|---|---|---|
| EMI | ₹5,00,000, 10%, 60 months | EMI ₹10,624, interest ₹1,37,411, total ₹6,37,411 |
| EMI 0% | ₹1,20,000, 0%, 12 months | ₹10,000 |
| Eligible | Demo button (₹60,000, salaried, 28, EMIs ₹5,000, score 745, ₹6,00,000, 60 m) | Eligible, High |
| Not eligible | ₹22,000, score 610, ₹8,00,000, 60 m | Not Eligible with reasons |
| Validation | empty / negative / age 15 / score 1000 | Red error messages |
| Credit | 780 / 600 | Excellent / Poor |
| API failure | no key in `.env` | "not configured" message |

## 16. Limitations
Simplified rules (not real bank policy), no authentication, no real credit-bureau data, AI answers may be imperfect, basic in-memory rate limiting.

## 17. Future Scope
User authentication, ML-based loan prediction, PDF report generation, advanced credit-risk prediction, personalised dashboards, bank/API integrations, multilingual support, improved AI assistant, secure cloud database.

## 18. Conclusion
The project shows how simple rules, a secure backend and an AI model can work together to make financial concepts easier to understand, while staying clear that results are educational only.

---
## Security & Privacy
No keys in frontend code · secrets in environment variables · input validated in browser and server · only numeric data and a random session ID stored · no names, PAN, Aadhaar or bank details · records are returned only for the caller's own session ID · output is rendered with `textContent` (no HTML injection).

## GitHub Upload
```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/ai-financial-decision-platform.git
git push -u origin main
```
Check that `.env` is NOT listed by `git status` before pushing.

## Viva Explanation (simple)
1. The user enters data; JavaScript checks it is valid.
2. Eligibility uses clear rules (credit score, income, EMI burden, age, job type) and shows reasons – no black box.
3. EMI uses the standard formula; the bar shows principal vs interest.
4. For AI questions the browser calls **our** server; the server holds the Claude key and calls Claude, so the key is never exposed.
5. The server saves anonymous numbers to Google Sheets using a service account.
6. Everything is labelled as an educational estimate. Future work: ML prediction, login, PDF reports.
