const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve HTML files

// 🔹 Google Sheets Auth (Render version only)
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS); // from Render Env Vars
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

// 🔹 Your Google Sheets ID
const spreadsheetId = "1KjopCS01TISleUm4ICrcYKtJw8Vl1FhDB2OJvAlMGz4"; // replace with your sheet ID

// ========== LOGIN ROUTES ==========

// Student login (email + regNo as password)
app.post("/login/student", async (req, res) => {
  try {
    const { email, regNo } = req.body;

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const rows = result.data.values || [];
    const student = rows.find((row, i) => i !== 0 && row[1] === email && row[3] === regNo);

    if (student) {
      res.json({ success: true, role: "student", identifier: student[3] });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Faculty/Admin login
app.post("/login/faculty", async (req, res) => {
  try {
    const { email, password } = req.body;

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "FacultyUsers!A:C" // Email | Password | Role
    });

    const rows = result.data.values || [];
    const user = rows.find((row, i) => i !== 0 && row[0] === email && row[1] === password);

    if (user) {
      res.json({ success: true, role: user[2], identifier: user[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ========== STUDENT ROUTES ==========

// Get all students
app.get("/students", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    res.json(result.data.values || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

// Get students by class (dynamic)
app.get("/students/class/:className", async (req, res) => {
  try {
    const className = req.params.className;

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const rows = result.data.values || [];
    if (rows.length <= 1) return res.json([]);

    const headers = rows[0];
    const classIndex = headers.indexOf("Class");
    if (classIndex === -1) return res.json([]);

    const filtered = [headers, ...rows.slice(1).filter(row => row[classIndex] === className)];
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch students by class" });
  }
});

// Get unique classes
app.get("/classes", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const rows = result.data.values || [];
    if (rows.length <= 1) return res.json([]);

    const headers = rows[0];
    const classIndex = headers.indexOf("Class");
    if (classIndex === -1) return res.json([]);

    const classes = [...new Set(rows.slice(1).map(row => row[classIndex]))].filter(Boolean);
    res.json(classes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
});

// ========== CHALLENGE ROUTES ==========

// Add a coding challenge
app.post("/addChallenge", async (req, res) => {
  try {
    const { title, department, link, date } = req.body;

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Challenges!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[title, department, link, date]]
      }
    });

    res.json({ success: true, message: "Challenge added successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add challenge" });
  }
});

// Get all challenges
app.get("/challenges", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Challenges!A:D"
    });

    res.json(result.data.values || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
});

// Get challenges by department
app.get("/challenges/:department", async (req, res) => {
  try {
    const dept = req.params.department;

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Challenges!A:D"
    });

    const rows = result.data.values || [];
    const headers = rows[0] || [];
    const deptIndex = headers.indexOf("Department");

    if (deptIndex === -1) return res.json([]);

    const filtered = [headers, ...rows.slice(1).filter(row => row[deptIndex] === dept)];
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch challenges by department" });
  }
});

// ========== SERVER START ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
