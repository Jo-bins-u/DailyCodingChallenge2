const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve HTML files

// 🔹 Google Sheets Setup
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // your service account credentials file
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

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

// Get students by class (case-insensitive + trim)
app.get("/students/class/:className", async (req, res) => {
  try {
    const className = req.params.className.trim().toLowerCase();

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const rows = result.data.values || [];
    if (rows.length <= 1) {
      return res.json([]);
    }

    const headers = rows[0];
    const classIndex = headers.findIndex(h => h.toLowerCase().trim() === "class");

    if (classIndex === -1) {
      return res.json([]);
    }

    const filtered = [
      headers,
      ...rows.slice(1).filter(row => (row[classIndex] || "").trim().toLowerCase() === className)
    ];

    res.json(filtered);
  } catch (err) {
    console.error("❌ Error fetching students by class:", err);
    res.status(500).json({ error: "Failed to fetch students by class" });
  }
});

// Get unique classes (dynamic with logs)
app.get("/classes", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const rows = result.data.values || [];
    if (rows.length <= 1) {
      console.log("⚠️ No student data found in sheet.");
      return res.json([]);
    }

    const headers = rows[0];
    console.log("✅ Headers found in Students sheet:", headers);

    const classIndex = headers.indexOf("Class");

    if (classIndex === -1) {
      console.log("❌ 'Class' column not found in headers.");
      return res.json([]);
    }

    const classes = [...new Set(rows.slice(1).map(row => row[classIndex]))].filter(Boolean);
    console.log("✅ Classes found:", classes);

    res.json(classes);
  } catch (err) {
    console.error("❌ Error fetching classes:", err);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
});

// ========== CHALLENGE ROUTES (UPDATED) ==========

// Add a coding challenge (validate department against Students sheet)
app.post("/addChallenge", async (req, res) => {
  try {
    const { title, department, link, date } = req.body;

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // ✅ Fetch valid departments from Students sheet
    const studentData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const studentRows = studentData.data.values || [];
    const studentHeaders = studentRows[0] || [];
    const deptIndex = studentHeaders.findIndex(h => h.toLowerCase().trim() === "department");

    if (deptIndex === -1) {
      return res.status(400).json({ error: "Department column not found in Students sheet" });
    }

    const validDepartments = [...new Set(studentRows.slice(1).map(r => (r[deptIndex] || "").trim().toLowerCase()))].filter(Boolean);

    if (!validDepartments.includes(department.trim().toLowerCase())) {
      return res.status(400).json({ error: `Invalid department: ${department}. Please use a department from Students sheet.` });
    }

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
    console.error("❌ Error adding challenge:", err);
    res.status(500).json({ error: "Failed to add challenge" });
  }
});

// Get challenges by department (validated against Students sheet)
app.get("/challenges/:department", async (req, res) => {
  try {
    const requestedDept = req.params.department.trim().toLowerCase();

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // ✅ Fetch valid departments from Students sheet
    const studentData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:H"
    });

    const studentRows = studentData.data.values || [];
    const studentHeaders = studentRows[0] || [];
    const deptIndex = studentHeaders.findIndex(h => h.toLowerCase().trim() === "department");

    if (deptIndex === -1) {
      return res.json([]);
    }

    const validDepartments = [...new Set(studentRows.slice(1).map(r => (r[deptIndex] || "").trim().toLowerCase()))].filter(Boolean);

    if (!validDepartments.includes(requestedDept)) {
      return res.json([]); // ❌ department doesn’t exist in Students sheet
    }

    // ✅ Fetch challenges
    const challengeData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Challenges!A:D"
    });

    const challengeRows = challengeData.data.values || [];
    const challengeHeaders = challengeRows[0] || [];
    const challengeDeptIndex = challengeHeaders.findIndex(h => h.toLowerCase().trim() === "department");

    if (challengeDeptIndex === -1) {
      return res.json([]);
    }

    const filtered = [
      challengeHeaders,
      ...challengeRows.slice(1).filter(row => (row[challengeDeptIndex] || "").trim().toLowerCase() === requestedDept)
    ];

    res.json(filtered);
  } catch (err) {
    console.error("❌ Error fetching challenges:", err);
    res.status(500).json({ error: "Failed to fetch challenges by department" });
  }
});

// Get all challenges (unchanged)
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

// ========== SERVER START ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
