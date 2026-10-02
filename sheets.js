// Stores/reads records in Google Sheets using a service account (credentials only from .env).
const { google } = require("googleapis");
const TAB = "Records";
const HEADERS = ["DateTime","SessionId","MonthlyIncome","EmploymentType","Age","CreditScore","LoanAmount","TenureMonths","EMI","Result"];

function configured() {
  return process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
    && !process.env.GOOGLE_SHEET_ID.startsWith("your_");
}
function client() {
  if (!configured()) { const e = new Error("Google Sheets is not configured on the server."); e.status = 503; throw e; }
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}
async function ensureHeader(sheets) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${TAB}!A1:J1` });
  if (!r.data.values || !r.data.values.length) {
    await sheets.spreadsheets.values.update({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${TAB}!A1:J1`,
      valueInputOption: "RAW", requestBody: { values: [HEADERS] } });
  }
}
async function addRecord(r) {
  const sheets = client();
  try {
    await ensureHeader(sheets);
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${TAB}!A:J`, valueInputOption: "RAW",
      requestBody: { values: [[new Date().toISOString(), r.sessionId, r.income, r.employment, r.age, r.creditScore, r.loanAmount, r.tenure, r.emi, r.result]] },
    });
  } catch (err) { const e = new Error("Could not write to Google Sheets. Check the sheet ID, sharing and tab name 'Records'."); e.status = 502; throw e; }
}
async function getRecords(sessionId) {
  const sheets = client();
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${TAB}!A2:J` });
    return (r.data.values || []).filter(row => row[1] === sessionId).map(row => Object.fromEntries(HEADERS.map((h, i) => [h, row[i] ?? ""])));
  } catch (err) { const e = new Error("Could not read from Google Sheets."); e.status = 502; throw e; }
}
module.exports = { addRecord, getRecords, configured };
