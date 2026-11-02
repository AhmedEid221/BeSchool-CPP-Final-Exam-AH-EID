# BeSchool C++ Final Exam — Simple Edition

## Features
- Student enters a name and starts immediately.
- 120-minute countdown starts when Start Examination is pressed.
- 30 MCQs (60 marks) and 4 C++ coding tasks (40 marks).
- C++17 compiler through the server-side Judge0 integration.
- Automatic MCQ and hidden-test grading on submission.
- Result appears on screen; no Google login, Google Sheets, student database, or automatic result delivery.
- The browser stores the active session locally so a refresh in the same browser can restore the timer and answers.

## Run locally
1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Environment variables
The app uses `https://ce.judge0.com` by default and language ID 54 (C++). If your Judge0 provider requires a key or a different endpoint, configure `JUDGE0_URL`, `JUDGE0_LANGUAGE_ID`, and the optional credentials shown in `.env.example`.

## Deploy
Deploy this folder as an Express/Node project on Vercel. No Google OAuth, Google Sheets, service-account JSON, or session secret is required. Add Judge0 credentials only if your compiler provider requires them.

## Important limitation
The 120-minute timer and session recovery are browser-side. This lightweight version is suitable for a simple exam flow, but it is not a tamper-proof proctoring or high-security examination system. A student can potentially alter browser state or use another device. Compiler availability and rate limits depend on the configured Judge0 provider.
