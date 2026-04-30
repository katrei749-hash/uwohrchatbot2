require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory session store (keyed by sessionId)
const sessions = {};

// Excel file path
const EXCEL_PATH = path.join(__dirname, 'hr_interview_responses.xlsx');

// ─── Interview system prompts ────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  stay: `You are a warm, professional HR interviewer for the University of Wisconsin Oshkosh conducting a STAY INTERVIEW. Your goal is to understand what motivates the employee to stay and what could be improved.

Key stay interview topics to weave naturally into the conversation:
- What they enjoy most about their role
- What keeps them at UW Oshkosh
- Whether they feel valued and recognized
- Their relationship with their supervisor and team
- Career growth and development opportunities
- What would make their experience better
- Work-life balance
- Resources and tools they need

Response style (apply to every reply):
- 2–4 sentences per response — enough to feel human, not so much it overwhelms
- Lead with a genuine, specific reaction to exactly what they just said (not a generic "great!" — actually reference the detail they shared)
- Then transition naturally into your next question
- Sound like a real person who is listening and cares — warm, attentive, and curious
- Avoid hollow affirmations like "That's wonderful!", "Absolutely!", "Great point!" — instead show you heard them by reflecting something specific back
- Do NOT move on without at least briefly acknowledging their answer
- After 10-12 questions total, end by saying: "INTERVIEW_COMPLETE" followed by 1–2 warm, sincere closing sentences
- If the employee signals they want to stop (e.g., "I'm done", "that's all", "no more questions", "I'm finished", "I want to stop"), acknowledge their time graciously and signal: "INTERVIEW_COMPLETE"
- Occasionally (around question 5-7), naturally include: "OFFER_HR_CONTACT" when it feels appropriate to offer them the chance to speak with an HR representative`,

  ninety_day: `You are a warm, professional HR interviewer for the University of Wisconsin Oshkosh conducting a 90-DAY CHECK-IN INTERVIEW for a new employee. Your goal is to help them feel welcome and identify early support needs.

Key 90-day check-in topics to weave naturally:
- How they are settling in and feeling about the role
- Whether onboarding met their expectations
- Clarity of their responsibilities and expectations
- Relationships with their team and supervisor
- Any surprises (positive or negative) since starting
- Resources or training they still need
- Early wins or accomplishments they are proud of
- Any concerns or challenges so far

Response style (apply to every reply):
- 2–4 sentences per response — enough to feel human, not so much it overwhelms
- Lead with a genuine, specific reaction to exactly what they just said (not a generic "great!" — actually reference the detail they shared)
- Then transition naturally into your next question
- Sound like a real person who is listening and cares — warm, attentive, and curious
- Avoid hollow affirmations like "That's wonderful!", "Absolutely!", "Great point!" — instead show you heard them by reflecting something specific back
- Do NOT move on without at least briefly acknowledging their answer
- After 10-12 questions total, end by saying: "INTERVIEW_COMPLETE" followed by 1–2 warm, sincere closing sentences
- If the employee signals they want to stop (e.g., "I'm done", "that's all", "no more questions", "I'm finished", "I want to stop"), acknowledge their time graciously and signal: "INTERVIEW_COMPLETE"
- Occasionally (around question 5-7), naturally include: "OFFER_HR_CONTACT" when it feels appropriate to offer them the chance to speak with an HR representative`,

  exit: `You are a warm, empathetic HR interviewer for the University of Wisconsin Oshkosh conducting an EXIT INTERVIEW. Your goal is to understand their experience and gather constructive feedback.

Key exit interview topics to weave naturally:
- Their overall experience at UW Oshkosh
- Primary reasons for leaving
- What they valued most about working here
- Their relationship with their team and supervisor
- Whether they felt supported and recognized
- What could have been done differently to retain them
- Suggestions to improve the workplace
- Whether they would recommend UW Oshkosh as an employer

Response style (apply to every reply):
- 2–4 sentences per response — enough to feel human, not so much it overwhelms
- Lead with a genuine, specific reaction to exactly what they just said (not a generic "great!" — actually reference the detail they shared)
- Then transition naturally into your next question
- Sound like a real person who is listening and cares — warm, empathetic, and respectful of this transition
- Avoid hollow affirmations like "That's wonderful!", "Absolutely!", "Great point!" — instead show you heard them by reflecting something specific back
- Do NOT move on without at least briefly acknowledging their answer
- After 10-12 questions total, end by saying: "INTERVIEW_COMPLETE" followed by 1–2 warm, sincere closing sentences
- If the employee signals they want to stop (e.g., "I'm done", "that's all", "no more questions", "I'm finished", "I want to stop"), acknowledge their time graciously and signal: "INTERVIEW_COMPLETE"
- Occasionally (around question 5-7), naturally include: "OFFER_HR_CONTACT" when it feels appropriate`
};

// ─── Opening questions ────────────────────────────────────────────────────────

const OPENING_QUESTIONS = {
  stay: "Thank you for taking the time to participate in this stay interview. Your feedback helps UW Oshkosh continue to be a great place to work. Let's start with something positive — what do you enjoy most about your current role here?",
  ninety_day: "Welcome, and congratulations on reaching your 90-day milestone at UW Oshkosh! We're so glad you're here. How are you feeling about your role so far — what has stood out to you most in these first few months?",
  exit: "Thank you for taking the time to share your experience as you transition from UW Oshkosh. Your honest feedback is truly valued and will help us continue to grow. To start — could you share a bit about what made your time here meaningful?"
};

// ─── Routes ──────────────────────────────────────────────────────────────────

// Start a new interview session
app.post('/api/start', (req, res) => {
  const { interviewType, department, tenure } = req.body;
  if (!interviewType || !department || !tenure) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sessionId = uuidv4();
  sessions[sessionId] = {
    sessionId,
    interviewType,
    department,
    tenure,
    messages: [],
    questionCount: 0,
    startedAt: new Date().toISOString(),
    responses: []
  };

  const openingMessage = OPENING_QUESTIONS[interviewType];

  // Store the first question
  sessions[sessionId].messages.push({
    role: 'assistant',
    content: openingMessage
  });
  sessions[sessionId].responses.push({ question: openingMessage, answer: '' });

  res.json({ sessionId, message: openingMessage });
});

const HARASSMENT_KEYWORDS = [
  'harass', 'harassment', 'assault', 'abuse', 'abused', 'abusive',
  'discriminat', 'hostile work', 'bully', 'bullying', 'bullied',
  'retaliat', 'threaten', 'threatened', 'threat', 'unsafe', 'uncomfortable situation',
  'hostile environment', 'misconduct', 'inappropriate behavior', 'hostile workplace'
];

// Send a message
app.post('/api/message', async (req, res) => {
  const { sessionId, userMessage } = req.body;
  const session = sessions[sessionId];

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const isHarassmentAlert = HARASSMENT_KEYWORDS.some(kw =>
    userMessage.toLowerCase().includes(kw)
  );

  // Update the last response's answer
  const lastResponse = session.responses[session.responses.length - 1];
  if (lastResponse && lastResponse.answer === '') {
    lastResponse.answer = userMessage;
  }

  // Add user message to history
  session.messages.push({ role: 'user', content: userMessage });
  session.questionCount++;

  // Save partial progress to Excel in case they don't finish
  saveToExcel(session);

  try {
    const completion = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPTS[session.interviewType],
      messages: session.messages
    });

    const assistantMessage = completion.content[0].text;

    // Add assistant message to history
    session.messages.push({ role: 'assistant', content: assistantMessage });

    // Check for special signals
    const isComplete = assistantMessage.includes('INTERVIEW_COMPLETE');
    const offerHrContact = assistantMessage.includes('OFFER_HR_CONTACT');

    // Clean the message for display
    let cleanMessage = assistantMessage
      .replace('INTERVIEW_COMPLETE', '')
      .replace('OFFER_HR_CONTACT', '')
      .trim();

    // Store the next question
    if (!isComplete) {
      session.responses.push({ question: cleanMessage, answer: '' });
    } else {
      // Final save with all data
      saveToExcel(session);
    }

    res.json({
      message: cleanMessage,
      isComplete,
      offerHrContact,
      isHarassmentAlert,
      interviewType: session.interviewType
    });
  } catch (err) {
    console.error('Anthropic error:', err);
    res.status(500).json({ error: 'AI service error' });
  }
});

// ─── Dashboard endpoints ──────────────────────────────────────────────────────

function checkDashboardAuth(req, res) {
  const secret = process.env.DASHBOARD_API_KEY;
  if (secret && req.headers['x-api-key'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// GET /api/data — returns all interview responses as JSON
app.get('/api/data', (req, res) => {
  if (!checkDashboardAuth(req, res)) return;

  if (!fs.existsSync(EXCEL_PATH)) {
    return res.json({ stay: [], ninety_day: [], exit: [] });
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetMap = {
    'Stay Interviews': 'stay',
    '90-Day Check-Ins': 'ninety_day',
    'Exit Interviews': 'exit'
  };

  const result = {};
  for (const [sheetName, key] of Object.entries(sheetMap)) {
    const sheet = workbook.Sheets[sheetName];
    result[key] = sheet ? XLSX.utils.sheet_to_json(sheet) : [];
  }

  res.json(result);
});

// GET /api/export — downloads the raw Excel file
app.get('/api/export', (req, res) => {
  if (!checkDashboardAuth(req, res)) return;

  if (!fs.existsSync(EXCEL_PATH)) {
    return res.status(404).json({ error: 'No data collected yet' });
  }

  res.download(EXCEL_PATH, 'hr_interview_responses.xlsx');
});

// Abandon / partial save endpoint
app.post('/api/save-partial', (req, res) => {
  const { sessionId } = req.body;
  const session = sessions[sessionId];
  if (session) {
    saveToExcel(session);
  }
  res.json({ ok: true });
});

// ─── Excel helper ─────────────────────────────────────────────────────────────

function saveToExcel(session) {
  let workbook;
  const sheetName = {
    stay: 'Stay Interviews',
    ninety_day: '90-Day Check-Ins',
    exit: 'Exit Interviews'
  }[session.interviewType] || 'Interviews';

  // Load existing workbook or create new
  if (fs.existsSync(EXCEL_PATH)) {
    workbook = XLSX.readFile(EXCEL_PATH);
  } else {
    workbook = XLSX.utils.book_new();
  }

  // Build row data
  const row = {
    'Session ID': session.sessionId || 'N/A',
    'Interview Type': session.interviewType,
    'Department': session.department,
    'Tenure': session.tenure,
    'Started At': session.startedAt,
    'Saved At': new Date().toISOString(),
    'Status': session.questionCount >= 10 ? 'Complete' : 'Partial'
  };

  // Add Q&A pairs as columns
  session.responses.forEach((item, i) => {
    if (item.answer) {
      row[`Q${i + 1}`] = item.question;
      row[`A${i + 1}`] = item.answer;
    }
  });

  // Get or create sheet
  let worksheet = workbook.Sheets[sheetName];
  let existingData = [];

  if (worksheet) {
    existingData = XLSX.utils.sheet_to_json(worksheet);
  }

  // Update or add
  const idx = existingData.findIndex(r => r['Session ID'] === row['Session ID']);
  if (idx >= 0) {
    existingData[idx] = row;
  } else {
    existingData.push(row);
  }

  const newSheet = XLSX.utils.json_to_sheet(existingData);

  // Set column widths
  newSheet['!cols'] = [
    { wch: 36 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
    { wch: 20 }, { wch: 20 }, { wch: 10 },
    ...Array(24).fill({ wch: 50 })
  ];

  if (workbook.Sheets[sheetName]) {
    workbook.Sheets[sheetName] = newSheet;
  } else {
    XLSX.utils.book_append_sheet(workbook, newSheet, sheetName);
  }

  XLSX.writeFile(workbook, EXCEL_PATH);
}

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ UWO HR Chatbot running at http://localhost:${PORT}\n`);
});
