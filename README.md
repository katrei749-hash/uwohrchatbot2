# 🏫 UWO HR Interview Chatbot

A polished, AI-powered HR interview portal for the University of Wisconsin Oshkosh. Supports **Stay Interviews**, **90-Day Check-Ins**, and **Exit Interviews** — all anonymous and confidential.

---

## ✨ Features

- **3 interview types** — Stay, 90-Day Check-In, Exit
- **Department & tenure selection** on the setup screen
- **AI-powered personalized follow-up questions** using Claude Haiku (cost-efficient)
- **10–12 questions** per session, dynamically tailored to responses
- **HR contact modal** — clickable link to `https://www.uwosh.edu/hr/about-us/`
- **Excel logging** — all responses (complete or partial) saved to `data/interview_responses.xlsx`
- **Partial save on exit** — answers are logged even if the user leaves early
- UWO black & gold aesthetic with a polished, modern interface

---

## 🚀 Setup Instructions

### 1. Clone / Download the project

Place this folder anywhere on your computer, for example:
```
C:\Users\YourName\uwo-hr-chatbot\
```

### 2. Install Node.js

Download and install Node.js (v18 or newer) from: https://nodejs.org/

### 3. Install dependencies

Open a terminal in the project folder and run:
```bash
npm install
```

### 4. Configure your API key

Copy the example env file:
```bash
cp .env.example .env
```

Open `.env` and replace `your_api_key_here` with your real Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3000
```

Get your API key at: https://console.anthropic.com/

### 5. Run the chatbot

```bash
npm start
```

Open your browser to: **http://localhost:3000**

---

## 📊 Accessing Interview Responses

All interview responses are saved to:
```
data/interview_responses.xlsx
```

Each row contains:
- Submission ID (unique)
- Timestamp
- Interview Type
- Department
- Tenure
- Status (Complete / Partial)
- Q1 / A1 through Q12 / A12

To download via browser (if you want a direct download link):
```
http://localhost:3000/api/download-responses
```

---

## 🔧 Customization

### Update department options
In `public/index.html`, find the `<select id="dept-select">` element and add/remove `<option>` tags.

### Update interview questions / themes
In `server.js`, find the `buildSystemPrompt()` function. Edit the `typeSpecific` object for each interview type.

### Change the model
In `server.js`, find `model: "claude-haiku-4-5-20251001"` and swap to another model if needed.

### Change the number of questions
In `server.js`, adjust the `questionCount >= 10` threshold for triggering the closing message.

---

## 📁 Project Structure

```
uwo-hr-chatbot/
├── server.js          ← Express server + API routes
├── package.json       ← Dependencies
├── .env               ← Your API key (not committed to git)
├── .env.example       ← Template for env setup
├── .gitignore
├── public/
│   └── index.html     ← Full frontend (single file)
└── data/
    └── interview_responses.xlsx  ← Auto-created on first response
```

---

## 🛡️ Privacy Notes

- No personally identifiable information is collected
- Each submission receives a random Submission ID
- Responses are stored locally on the server running this app
- The `.env` file (containing your API key) is excluded from git

---

*Built for UWO Human Resources — Go Big, Go Titan, Go Gold. 🖤💛*
