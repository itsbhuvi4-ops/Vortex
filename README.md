# DS TAMIL GAMING — VORTEX CLASH 2026
### Interactive Esports Tournament Website

A complete, production-ready interactive esports tournament web platform for **DS TAMIL GAMING presents VORTEX CLASH 2026**.

---

## ⚡ Key Highlights & Features

1. **Esports Theme & Visuals**:
   - Dark aesthetic with vortex cyan, electric purple, and fiery crimson accents.
   - Glassmorphism panels, glow effects, responsive mobile menu, and canvas confetti for the championship.

2. **Homepage & Tournament Directory**:
   - Tournament poster viewer, rules preview, sponsors spotlight, dynamic capacity counter (`24 / 30 TEAMS REGISTERED` or `REGISTRATION FULL`).
   - Quick action buttons: **REGISTER NOW** & **VIEW BRACKET**.

3. **Single-Elimination Knockout Bracket Engine**:
   - Automatic Bye generation for non-power-of-two team counts.
   - State control: `BRACKET WILL BE ANNOUNCED SOON` (pre-publish) → `LIVE TOURNAMENT BRACKET` (post-publish).
   - Match countdown timer (`DAYS : HOURS : MINUTES : SECONDS`) automatically transitioning to `MATCH LIVE` when timer hits zero.
   - Winner progression: Selecting a match winner automatically advances the winning team to the correct slot in the subsequent round.
   - Dynamic result editing and downstream reset calculation.
   - Grand Final `🏆 TOURNAMENT CHAMPION` showcase card with team logo and title.

4. **Multi-Step Squad Registration Flow**:
   - **Step 1**: Sponsors & Rules compliance checklist with mandatory agreement.
   - **Step 2**: Team Details (Team Logo upload with live preview, Team Name, Leader Name, Phone, WhatsApp).
   - **Step 3**: Players (Player 1*, Player 2*, Player 3*, Player 4*, Substitute). **Strictly NO UID / Game ID fields anywhere**.
   - **Step 4**: Payment Section (Registration Fee, Payment QR Code, Instructions, Payment Screenshot Proof upload).
   - **Step 5**: WhatsApp & Discord verification checkboxes (`I have joined WhatsApp`, `I have joined Discord`).
   - **Step 6**: Registration Pass / Success Ticket with unique ID (e.g. `VC2026-0001`) and printable confirmation.

5. **Admin Control Suite**:
   - Secure login (Passcode: `admin123`).
   - **Dashboard**: High-level telemetry for registrations, capacity, bracket status, and match statistics.
   - **Teams Management**: Table search, payment proof previewer, download proof, edit/delete squad.
   - **Excel Export**: Single-click export of clean `.xlsx` spreadsheet (Strictly NO UID, NO selection/rejection status).
   - **Bracket Controller**: Generate bracket, rearrange teams, lock/unlock bracket, publish/unpublish, schedule match times, select winners, reset results.
   - **Sponsor & Rule Management**: Full CRUD modals.
   - **Tournament Settings**: Configure tournament name, poster, fee, max capacity, registration open/closed toggle, QR code, and WhatsApp/Discord links.

---

## 🚀 How to Run

1. Open your terminal in this directory:
   ```bash
   cd c:\Users\Admin\OneDrive\Desktop\Vortex
   ```

2. Install dependencies (Express, CORS, Multer, XLSX):
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   node server.js
   ```

4. Open your browser:
   ```
   http://localhost:3000
   ```

5. **Admin Access**:
   - Click the shield icon in the top right or footer.
   - Default passcode: `admin123`

---

## 📁 Project Structure

```
Vortex/
├── data/
│   └── database.json          # Persistent JSON file storage
├── public/
│   ├── css/
│   │   └── style.css          # Esports theme, neon glow, bracket styles
│   ├── js/
│   │   └── app.js             # React 18 frontend (Home, Bracket, Reg, Admin)
│   └── index.html             # Main entry point with Tailwind & Lucide
├── package.json               # Dependencies and scripts
├── server.js                  # Express backend & Knockout engine
└── README.md                  # Documentation
```
