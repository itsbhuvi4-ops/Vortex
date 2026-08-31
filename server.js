const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

// Determine environment
const IS_VERCEL = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);

if (IS_VERCEL || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Request timing & logging middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const cleanPath = req.originalUrl || req.url;
      if (duration > 2000) {
        console.warn(`[SLOW API] ${req.method} ${cleanPath} ${res.statusCode} - ${duration}ms`);
      } else {
        console.log(`[API] ${req.method} ${cleanPath} ${res.statusCode} - ${duration}ms`);
      }
    });
  }
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const DATA_DIR = IS_VERCEL
  ? path.join('/tmp', 'vortex-data')
  : path.join(__dirname, 'data');
const UPLOADS_DIR = IS_VERCEL
  ? path.join('/tmp', 'vortex-uploads')
  : path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.warn("Directory creation warning:", e.message);
}

// Static File Serving
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Explicit homepage route for instant static serving
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// DB file paths
const DB_FILE = path.join(DATA_DIR, 'database.json');
const SQL_DB_FILE = path.join(DATA_DIR, 'vortex.db');

// If on Vercel and local pre-existing database files exist, copy them to /tmp on initial cold start
if (IS_VERCEL) {
  const localDb = path.join(__dirname, 'data', 'vortex.db');
  const localJson = path.join(__dirname, 'data', 'database.json');
  try {
    if (!fs.existsSync(SQL_DB_FILE) && fs.existsSync(localDb)) {
      fs.copyFileSync(localDb, SQL_DB_FILE);
    }
    if (!fs.existsSync(DB_FILE) && fs.existsSync(localJson)) {
      fs.copyFileSync(localJson, DB_FILE);
    }
  } catch (err) {
    console.warn("Vercel cold start db copy warning:", err.message);
  }
}

// SQLite database setup with graceful connection handling
let sqliteDbReady = false;
let sqliteDbError = null;

let sqliteDb = null;
try {
  sqliteDb = new sqlite3.Database(SQL_DB_FILE, (err) => {
    if (err) {
      console.error('SQLite connection error:', err.message);
      sqliteDbError = err;
    } else {
      sqliteDbReady = true;
    }
  });

  sqliteDb.on('error', (err) => {
    console.error('SQLite runtime error:', err.message);
    sqliteDbError = err;
  });
} catch (err) {
  console.error('Failed to initialize SQLite database instance:', err.message);
  sqliteDbError = err;
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'vortex-clash-session-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safeName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file || !/image\/(jpeg|png|webp|jpg)/i.test(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
    }
    cb(null, true);
  }
});

// Helper to save base64 data URI to UPLOADS_DIR and return public URL
function saveBase64Image(dataUri, prefix = 'file') {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
    return dataUri;
  }
  try {
    const matches = dataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return dataUri;
    const mimeType = matches[1];
    let ext = '.png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
    else if (mimeType.includes('webp')) ext = '.webp';
    
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('saveBase64Image error:', err);
    return dataUri;
  }
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!sqliteDb || (sqliteDbError && !sqliteDbReady)) {
      return reject(sqliteDbError || new Error('Database not connected'));
    }
    sqliteDb.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getDbRow(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!sqliteDb || (sqliteDbError && !sqliteDbReady)) {
      return reject(sqliteDbError || new Error('Database not connected'));
    }
    sqliteDb.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getDbRows(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!sqliteDb || (sqliteDbError && !sqliteDbReady)) {
      return reject(sqliteDbError || new Error('Database not connected'));
    }
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

// Health check endpoint (TASK 2)
app.get('/api/health', (req, res) => {
  let dbStatus = 'connected';
  if (!sqliteDbReady || sqliteDbError) {
    dbStatus = sqliteDbError ? `error: ${sqliteDbError.message}` : 'connecting';
  }
  res.json({
    success: true,
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

async function initializeDatabase() {
  if (!sqliteDb) return;
  try {
    await new Promise((resolve) => {
      sqliteDb.serialize(() => {
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          createdAt TEXT NOT NULL
        )`, (err) => { if (err) console.error("Table users creation error:", err.message); });

        sqliteDb.run(`CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL UNIQUE,
          teamName TEXT NOT NULL,
          teamLogo TEXT,
          teamLeader TEXT NOT NULL,
          phoneNumber TEXT NOT NULL,
          whatsappNumber TEXT NOT NULL,
          player1 TEXT NOT NULL,
          player2 TEXT NOT NULL,
          player3 TEXT NOT NULL,
          player4 TEXT NOT NULL,
          substitute TEXT,
          paymentProof TEXT NOT NULL,
          joinedWhatsapp INTEGER DEFAULT 0,
          joinedDiscord INTEGER DEFAULT 0,
          registrationNumber TEXT,
          createdAt TEXT NOT NULL
        )`, (err) => { if (err) console.error("Table teams creation error:", err.message); });

        sqliteDb.run(`CREATE TABLE IF NOT EXISTS sponsors (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          description TEXT,
          logoUrl TEXT,
          profileLink TEXT,
          orderIndex INTEGER DEFAULT 0,
          createdAt TEXT NOT NULL
        )`, (err) => { if (err) console.error("Table sponsors creation error:", err.message); });

        sqliteDb.run(`CREATE TABLE IF NOT EXISTS rules (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          orderIndex INTEGER DEFAULT 0,
          createdAt TEXT NOT NULL
        )`, (err) => { if (err) console.error("Table rules creation error:", err.message); });

        sqliteDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_userId ON teams(userId)`, () => {});
        sqliteDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`, () => {
          sqliteDbReady = true;
          resolve();
        });
      });
    });

    const existingAdmin = await getDbRow('SELECT * FROM users WHERE role = ?', ['admin']);
    if (!existingAdmin) {
      const adminId = `user-${Date.now()}`;
      const hash = await bcrypt.hash('1234', 10);
      await runDb('INSERT INTO users (id, name, email, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        adminId, 'Bhuvi', 'bhuvi@vortex.local', hash, 'admin', new Date().toISOString()
      ]);
    } else {
      const adminHash = await bcrypt.hash('1234', 10);
      if (existingAdmin.name !== 'Bhuvi' || existingAdmin.email !== 'bhuvi@vortex.local') {
        await runDb('UPDATE users SET name = ?, email = ?, passwordHash = ? WHERE role = ?', [
          'Bhuvi', 'bhuvi@vortex.local', adminHash, 'admin'
        ]);
      } else {
        const matches = await bcrypt.compare('1234', existingAdmin.passwordHash);
        if (!matches) {
          await runDb('UPDATE users SET passwordHash = ? WHERE role = ?', [adminHash, 'admin']);
        }
      }
    }

    // Seed sponsors into SQLite if empty
    const sponsorCount = await getDbRow('SELECT COUNT(*) as count FROM sponsors');
    if (!sponsorCount || sponsorCount.count === 0) {
      const initialSponsors = (dbData.sponsors && dbData.sponsors.length > 0) ? dbData.sponsors : defaultState.sponsors;
      for (const sp of initialSponsors) {
        await runDb(`INSERT OR IGNORE INTO sponsors (id, name, role, description, logoUrl, profileLink, orderIndex, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
          sp.id, sp.name, sp.role, sp.description || '', sp.logoUrl || '', sp.profileLink || '#', sp.orderIndex || 1, new Date().toISOString()
        ]);
      }
    }

    // Seed rules into SQLite if empty
    const ruleCount = await getDbRow('SELECT COUNT(*) as count FROM rules');
    if (!ruleCount || ruleCount.count === 0) {
      const initialRules = (dbData.rules && dbData.rules.length > 0) ? dbData.rules : defaultState.rules;
      for (const r of initialRules) {
        await runDb(`INSERT OR IGNORE INTO rules (id, category, title, content, orderIndex, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)`, [
          r.id, r.category, r.title, r.content, r.orderIndex || 1, new Date().toISOString()
        ]);
      }
    }

    // Load sponsors & rules from SQLite to sync in-memory cache
    const sqlSponsors = await getDbRows('SELECT * FROM sponsors ORDER BY orderIndex ASC');
    if (sqlSponsors && sqlSponsors.length > 0) {
      db.sponsors = sqlSponsors;
      dbData.sponsors = sqlSponsors;
    }

    const sqlRules = await getDbRows('SELECT * FROM rules ORDER BY orderIndex ASC');
    if (sqlRules && sqlRules.length > 0) {
      db.rules = sqlRules;
      dbData.rules = sqlRules;
    }

  } catch (err) {
    console.error('Database initialization error:', err.message || err);
  }
}

initializeDatabase().catch(err => console.error('DB async init catch:', err.message || err));

// Initial default seed state
const defaultState = {
  settings: {
    tournamentName: "DS TAMIL GAMING â€” VORTEX CLASH 2026",
    conductedBy: "DS TAMIL GAMING",
    posterUrl: "/hero-poster.jpg",
    description: "Welcome to the ultimate esports showdown! DS TAMIL GAMING presents VORTEX CLASH 2026 â€” the pinnacle of competitive battleground gaming. Assemble your squad, dominate the arena, and claim the championship glory.",
    registrationFee: "â‚¹100",
    maxTeams: 30,
    registrationOpen: true,
    paymentQrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=dstamilgaming@upi&pn=DSTamilGaming&am=100&cu=INR&tn=VORTEX_CLASH_2026",
    paymentInstructions: "1. Scan the QR code using GPay, PhonePe, or Paytm.\n2. Pay the registration fee of â‚¹100.\n3. Take a clear screenshot of the successful transaction.\n4. Upload the payment screenshot in the registration form below.",
    whatsappLink: "https://chat.whatsapp.com/invite/VortexClash2026",
    discordLink: "https://discord.gg/vortexclash2026",
    importantDates: "Registration Closes: 05 September 2026 | Bracket Announcement: 05 September 2026, 9:00 PM | Tournament Kickoff: 06 September 2026, 6:00 PM",
    instructions: "All team leaders must join the official WhatsApp and Discord communities. Teams must be ready in the custom room 15 minutes prior to match schedule. Fair play and sportsmanship are strictly enforced."
  },
  sponsors: [
    {
      id: "sp-1",
      name: "TITAN GEAR ESPORTS",
      role: "Title Sponsor & Official Hardware Partner",
      description: "Equipping champions with ultra-low latency mechanical keyboards, high-DPI optical mice, and pro headsets.",
      logoUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80",
      profileLink: "https://example.com/titan-gear",
      orderIndex: 1
    },
    {
      id: "sp-2",
      name: "VORTEX ENERGY",
      role: "Official Energy Drink Partner",
      description: "Maximum focus, zero crash. Formulated specifically for competitive esports athletes and long tournament grinds.",
      logoUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=300&q=80",
      profileLink: "https://example.com/vortex-energy",
      orderIndex: 2
    },
    {
      id: "sp-3",
      name: "CYBER NETWORKS",
      role: "Official Streaming & Network Partner",
      description: "Providing enterprise ultra-fast fiber connectivity and 4K low-latency streaming infrastructure.",
      logoUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=300&q=80",
      profileLink: "https://example.com/cyber-networks",
      orderIndex: 3
    }
  ],
  rules: [
    {
      id: "r-1",
      category: "Tournament Rules",
      title: "No Roof",
      content: "NO ROOF",
      orderIndex: 1
    },
    {
      id: "r-2",
      category: "Tournament Rules",
      title: "No PC",
      content: "NO PC",
      orderIndex: 2
    },
    {
      id: "r-3",
      category: "Tournament Rules",
      title: "No Panel",
      content: "NO PANEL",
      orderIndex: 3
    },
    {
      id: "r-4",
      category: "Tournament Rules",
      title: "No Wall Break",
      content: "NO WALL BREAK",
      orderIndex: 4
    },
    {
      id: "r-5",
      category: "Tournament Rules",
      title: "No Team Change",
      content: "NO TEAM CHANGE",
      orderIndex: 5
    },
    {
      id: "r-6",
      category: "Tournament Rules",
      title: "Only Face to Face",
      content: "ONLY FACE TO FACE",
      orderIndex: 6
    },
    {
      id: "r-7",
      category: "Tournament Rules",
      title: "No Zone Break",
      content: "NO ZONE BREAK",
      orderIndex: 7
    }
  ],
  teams: [
    {
      registrationId: "VC2026-0001",
      teamName: "VORTEX VIPERS",
      teamLogo: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Dinesh Kumar",
      phoneNumber: "9876543210",
      whatsappNumber: "9876543210",
      player1: "Dinesh Kumar",
      player2: "Senthil Nathan",
      player3: "Karthik Raja",
      player4: "Manoj Varma",
      substitute: "Praveen Raj",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-25T10:00:00.000Z"
    },
    {
      registrationId: "VC2026-0002",
      teamName: "TAMIL TITANS",
      teamLogo: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Vijay Anand",
      phoneNumber: "9876543211",
      whatsappNumber: "9876543211",
      player1: "Vijay Anand",
      player2: "Surya Prakash",
      player3: "Aravind Swamy",
      player4: "Gowtham Ramesh",
      substitute: "Ajith Kumar",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-25T11:30:00.000Z"
    },
    {
      registrationId: "VC2026-0003",
      teamName: "SHADOW STRIKERS",
      teamLogo: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Ramesh Babu",
      phoneNumber: "9876543212",
      whatsappNumber: "9876543212",
      player1: "Ramesh Babu",
      player2: "Sanjay Dutt",
      player3: "Harish Kalyan",
      player4: "Balaji Mohan",
      substitute: "",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-26T09:15:00.000Z"
    },
    {
      registrationId: "VC2026-0004",
      teamName: "BLAZE SQUAD",
      teamLogo: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Arun Pandian",
      phoneNumber: "9876543213",
      whatsappNumber: "9876543213",
      player1: "Arun Pandian",
      player2: "Murugan Selvam",
      player3: "Suresh Raina",
      player4: "Deepak Chahar",
      substitute: "Ashwin Ravi",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-26T14:40:00.000Z"
    },
    {
      registrationId: "VC2026-0005",
      teamName: "NEO APEX",
      teamLogo: "https://images.unsplash.com/photo-1614680376593-902f749f7ffc?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Kishore Kumar",
      phoneNumber: "9876543214",
      whatsappNumber: "9876543214",
      player1: "Kishore Kumar",
      player2: "Naveen Polishetty",
      player3: "Ganesh Venkat",
      player4: "Rohit Sharma",
      substitute: "",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-27T08:20:00.000Z"
    },
    {
      registrationId: "VC2026-0006",
      teamName: "CYBER WOLVES",
      teamLogo: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Jeeva Saravanan",
      phoneNumber: "9876543215",
      whatsappNumber: "9876543215",
      player1: "Jeeva Saravanan",
      player2: "Pradeep Ranganathan",
      player3: "Manikandan",
      player4: "Vinoth Kumar",
      substitute: "Siva Karthikeyan",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-27T16:00:00.000Z"
    },
    {
      registrationId: "VC2026-0007",
      teamName: "INFERNO WARRIORS",
      teamLogo: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Madhan Gowri",
      phoneNumber: "9876543216",
      whatsappNumber: "9876543216",
      player1: "Madhan Gowri",
      player2: "Vicky Vignesh",
      player3: "Anirudh Ravichander",
      player4: "Lokesh Kanagaraj",
      substitute: "",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-28T12:10:00.000Z"
    },
    {
      registrationId: "VC2026-0008",
      teamName: "GODS OF ARENA",
      teamLogo: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=200&q=80",
      teamLeader: "Kamal Hassan",
      phoneNumber: "9876543217",
      whatsappNumber: "9876543217",
      player1: "Kamal Hassan",
      player2: "Rajinikanth",
      player3: "Vikram Kennedy",
      player4: "Suriya Sivakumar",
      substitute: "Karthi Sivakumar",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: "2026-08-28T18:45:00.000Z"
    }
  ],
  bracket: {
    status: "UNPUBLISHED", // UNPUBLISHED | PUBLISHED
    isLocked: false,
    totalRounds: 0,
    championTeamId: null,
    matches: []
  },
  adminPasswordHash: "admin123"
};

// Database persistence helper
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultState, null, 2));
      return defaultState;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file:', err);
    return defaultState;
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving database file:', err);
  }
}

async function syncLegacyTeamCache() {
  try {
    const rows = await getDbRows('SELECT * FROM teams ORDER BY createdAt DESC');
    dbData.teams = rows.map(team => ({
      ...team,
      registrationId: team.registrationNumber,
      registeredAt: team.createdAt,
      userKey: null
    }));
    saveDB(dbData);
    return dbData.teams;
  } catch (err) {
    console.error('syncLegacyTeamCache error:', err);
    return dbData.teams || [];
  }
}

// In-memory state cache
let jsonDbData = loadDB();
let db = jsonDbData;
let dbData = db;

// -------------------------------------------------------------
// Bracket Helper Engine (Single Elimination Knockout with Byes)
// -------------------------------------------------------------
function generateKnockoutBracket(teamsList) {
  const count = teamsList.length;
  if (count < 2) {
    return {
      status: "UNPUBLISHED",
      isLocked: false,
      totalRounds: 0,
      championTeamId: null,
      matches: []
    };
  }

  // Calculate bracket size (next power of 2 >= count)
  let power = 2;
  while (power < count) {
    power *= 2;
  }

  const totalRounds = Math.log2(power);
  const byesCount = power - count;
  const matches = [];

  // Helper for round names
  function getRoundName(roundIdx, maxRounds) {
    const diff = maxRounds - roundIdx;
    if (diff === 0) return "Grand Final";
    if (diff === 1) return "Semi Final";
    if (diff === 2) return "Quarter Final";
    if (diff === 3) return "Round of 16";
    if (diff === 4) return "Round of 32";
    return `Round ${roundIdx + 1}`;
  }

  // Generate slots for Round 1
  // Slot distribution: Put top seeds / byes in pairs
  const round1Slots = [];
  let teamIdx = 0;
  for (let i = 0; i < power; i++) {
    if (i < count) {
      round1Slots.push(teamsList[i].registrationId);
    } else {
      round1Slots.push(null); // BYE
    }
  }

  // Build tree from bottom (Grand Final) to Round 1
  const matchesByRound = {};
  for (let r = 0; r < totalRounds; r++) {
    matchesByRound[r] = [];
    const matchCount = power / Math.pow(2, r + 1);
    const roundName = getRoundName(r, totalRounds - 1);

    for (let m = 0; m < matchCount; m++) {
      const matchId = `R${r + 1}-M${m + 1}`;
      
      let nextMatchId = null;
      let nextMatchSlot = null;
      if (r < totalRounds - 1) {
        nextMatchId = `R${r + 2}-M${Math.floor(m / 2) + 1}`;
        nextMatchSlot = (m % 2) + 1; // 1 (team1) or 2 (team2)
      }

      // Default scheduled time: staggered across future dates
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + (r + 1));
      baseDate.setHours(18 + (m % 4), (m % 2) * 30, 0, 0);

      const matchObj = {
        id: matchId,
        round: r + 1,
        roundIndex: r,
        roundName: roundName,
        matchNumber: m + 1,
        team1Id: null,
        team2Id: null,
        winnerId: null,
        nextMatchId: nextMatchId,
        nextMatchSlot: nextMatchSlot,
        scheduledTime: baseDate.toISOString(),
        status: "UPCOMING" // UPCOMING | LIVE | COMPLETED
      };

      matchesByRound[r].push(matchObj);
      matches.push(matchObj);
    }
  }

  // Populate Round 1 teams
  const r1Matches = matchesByRound[0];
  for (let i = 0; i < r1Matches.length; i++) {
    const t1 = round1Slots[i * 2] || null;
    const t2 = round1Slots[i * 2 + 1] || null;

    r1Matches[i].team1Id = t1;
    r1Matches[i].team2Id = t2;

    // Check if one team gets a BYE
    if (t1 && !t2) {
      r1Matches[i].winnerId = t1;
      r1Matches[i].status = "COMPLETED";
      // Advance to next round
      if (r1Matches[i].nextMatchId) {
        const nextMatch = matches.find(x => x.id === r1Matches[i].nextMatchId);
        if (nextMatch) {
          if (r1Matches[i].nextMatchSlot === 1) nextMatch.team1Id = t1;
          else nextMatch.team2Id = t1;
        }
      }
    } else if (!t1 && t2) {
      r1Matches[i].winnerId = t2;
      r1Matches[i].status = "COMPLETED";
      if (r1Matches[i].nextMatchId) {
        const nextMatch = matches.find(x => x.id === r1Matches[i].nextMatchId);
        if (nextMatch) {
          if (r1Matches[i].nextMatchSlot === 1) nextMatch.team1Id = t2;
          else nextMatch.team2Id = t2;
        }
      }
    }
  }

  return {
    status: "UNPUBLISHED",
    isLocked: false,
    totalRounds: totalRounds,
    championTeamId: null,
    matches: matches
  };
}

// Recalculate downstream bracket winners whenever a match result changes
function recalculateBracket(bracket, changedMatchId) {
  const matchMap = new Map();
  bracket.matches.forEach(m => matchMap.set(m.id, m));

  const startMatch = matchMap.get(changedMatchId);
  if (!startMatch) return bracket;

  let current = startMatch;
  while (current && current.nextMatchId) {
    const nextMatch = matchMap.get(current.nextMatchId);
    if (!nextMatch) break;

    const winnerOfCurrent = current.winnerId;
    if (current.nextMatchSlot === 1) {
      nextMatch.team1Id = winnerOfCurrent;
    } else {
      nextMatch.team2Id = winnerOfCurrent;
    }

    // If next match winner is no longer one of the teams, clear next match winner and reset status
    if (nextMatch.winnerId && nextMatch.winnerId !== nextMatch.team1Id && nextMatch.winnerId !== nextMatch.team2Id) {
      nextMatch.winnerId = null;
      nextMatch.status = "UPCOMING";
    }

    current = nextMatch;
  }

  // Check Grand Final champion
  const grandFinal = bracket.matches.find(m => m.roundIndex === bracket.totalRounds - 1);
  if (grandFinal && grandFinal.winnerId) {
    bracket.championTeamId = grandFinal.winnerId;
  } else {
    bracket.championTeamId = null;
  }

  return bracket;
}

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// Settings Endpoints
app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings: dbData.settings });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const newSettings = { ...dbData.settings, ...req.body };
  dbData.settings = newSettings;
  saveDB(dbData);
  res.json({ success: true, settings: dbData.settings });
});

// Teams Endpoints
app.get('/api/teams', async (req, res) => {
  try {
    const rows = await getDbRows('SELECT * FROM teams ORDER BY createdAt DESC');
    const teams = rows.map(team => ({
      ...team,
      registrationId: team.registrationNumber,
      registeredAt: team.createdAt
    }));

    res.json({
      success: true,
      totalTeams: teams.length,
      maxTeams: dbData.settings.maxTeams,
      isFull: teams.length >= dbData.settings.maxTeams,
      teams
    });
  } catch (err) {
    console.error('List teams error:', err);
    res.status(500).json({ success: false, message: 'Unable to load teams.' });
  }
});

app.post('/api/teams', async (req, res) => {
  try {
    if (dbData.settings && (dbData.teams.length >= dbData.settings.maxTeams || !dbData.settings.registrationOpen)) {
      return res.status(400).json({
        success: false,
        message: "REGISTRATION FULL or Closed. Maximum team capacity reached."
      });
    }

    const sessionUserId = req.session.userId || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    req.session.userId = sessionUserId;

    const {
      teamName,
      teamLogo,
      teamLeader,
      phoneNumber,
      whatsappNumber,
      player1,
      player2,
      player3,
      player4,
      substitute,
      paymentProof,
      joinedWhatsapp,
      joinedDiscord
    } = req.body || {};

    if (!teamName || !teamLeader || !phoneNumber || !whatsappNumber || !player1 || !player2 || !player3 || !player4 || !paymentProof) {
      return res.status(400).json({
        success: false,
        message: "All required fields including squad details, players (1-4), and payment proof must be provided."
      });
    }

    const cleanPhone = String(phoneNumber).trim();
    const cleanWhatsApp = String(whatsappNumber).trim();

    // Check duplicate team
    const existingTeam = await getDbRow('SELECT * FROM teams WHERE userId = ? OR phoneNumber = ? OR whatsappNumber = ?', [sessionUserId, cleanPhone, cleanWhatsApp]);
    if (existingTeam) {
      return res.status(200).json({
        success: false,
        duplicate: true,
        message: 'A team with this phone number or session has already registered.',
        team: { ...existingTeam, registrationId: existingTeam.registrationNumber, registeredAt: existingTeam.createdAt }
      });
    }

    // Create guest user row if not exists using fast precomputed hash to avoid CPU bottleneck
    const existingUser = await getDbRow('SELECT id FROM users WHERE id = ?', [sessionUserId]);
    if (!existingUser) {
      const guestHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      await runDb('INSERT INTO users (id, name, email, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        sessionUserId,
        String(teamLeader).trim(),
        `${cleanPhone}@vortex.local`,
        guestHash,
        'user',
        new Date().toISOString()
      ]);
    }

    // Generate unique sequential registration number
    const countRow = await getDbRow('SELECT COUNT(*) AS count FROM teams');
    const nextNum = (Number(countRow?.count || 0) + 1);
    const formattedNum = String(nextNum).padStart(4, '0');
    const registrationId = `VC2026-${formattedNum}`;

    // Convert base64 payment proof and logo to file on disk
    const savedPaymentProof = saveBase64Image(paymentProof, 'payment');
    const savedTeamLogo = saveBase64Image(teamLogo, 'crest') || "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=200&q=80";

    const newTeam = {
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: sessionUserId,
      registrationNumber: registrationId,
      teamName: String(teamName).trim(),
      teamLogo: savedTeamLogo,
      teamLeader: String(teamLeader).trim(),
      phoneNumber: cleanPhone,
      whatsappNumber: cleanWhatsApp,
      player1: String(player1).trim(),
      player2: String(player2).trim(),
      player3: String(player3).trim(),
      player4: String(player4).trim(),
      substitute: substitute ? String(substitute).trim() : "",
      paymentProof: savedPaymentProof,
      joinedWhatsapp: joinedWhatsapp ? 1 : 0,
      joinedDiscord: joinedDiscord ? 1 : 0,
      createdAt: new Date().toISOString()
    };

    await runDb(`INSERT INTO teams (
      id, userId, teamName, teamLogo, teamLeader, phoneNumber, whatsappNumber,
      player1, player2, player3, player4, substitute, paymentProof,
      joinedWhatsapp, joinedDiscord, registrationNumber, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      newTeam.id,
      newTeam.userId,
      newTeam.teamName,
      newTeam.teamLogo,
      newTeam.teamLeader,
      newTeam.phoneNumber,
      newTeam.whatsappNumber,
      newTeam.player1,
      newTeam.player2,
      newTeam.player3,
      newTeam.player4,
      newTeam.substitute,
      newTeam.paymentProof,
      newTeam.joinedWhatsapp,
      newTeam.joinedDiscord,
      newTeam.registrationNumber,
      newTeam.createdAt
    ]);

    // Fast in-memory cache update
    if (!dbData.teams) dbData.teams = [];
    dbData.teams.unshift({
      ...newTeam,
      registrationId: newTeam.registrationNumber,
      registeredAt: newTeam.createdAt
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful!',
      team: {
        ...newTeam,
        registrationId: registrationId,
        registeredAt: newTeam.createdAt,
        joinedWhatsapp: !!newTeam.joinedWhatsapp,
        joinedDiscord: !!newTeam.joinedDiscord
      }
    });
  } catch (err) {
    console.error('Team registration error:', err);
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(200).json({ success: false, duplicate: true, message: 'Team already registered.' });
    }
    return res.status(500).json({ success: false, message: 'Registration failed due to a server error.' });
  }
});

app.put('/api/teams/:id', (req, res) => {
  const { id } = req.params;
  const index = db.teams.findIndex(t => t.registrationId === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  db.teams[index] = {
    ...db.teams[index],
    ...req.body,
    registrationId: db.teams[index].registrationId // protect ID
  };
  saveDB(db);
  res.json({ success: true, team: db.teams[index] });
});

app.delete('/api/teams/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const team = await getDbRow('SELECT * FROM teams WHERE id = ? OR registrationNumber = ?', [id, id]);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    await runDb('DELETE FROM teams WHERE id = ?', [team.id]);
    await syncLegacyTeamCache();

    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (err) {
    console.error('Delete team error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete team.' });
  }
});

app.post('/api/uploads/sponsor-image', (req, res) => {
  upload.any()(req, res, (err) => {
    if (err) {
      console.error('Sponsor upload multer error:', err);
      return res.status(400).json({ success: false, message: err.message || 'Image upload failed.' });
    }
    const file = req.files && req.files.length > 0 ? req.files[0] : req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No sponsor image uploaded.' });
    }

    const publicUrl = `/uploads/${file.filename}`;
    res.json({ success: true, url: publicUrl, filename: file.filename });
  });
});

// Excel Export Endpoint (Strictly NO UID, NO Status fields!)
app.get('/api/teams/export-excel', (req, res) => {
  try {
    const exportData = db.teams.map((team, idx) => ({
      "S.No": idx + 1,
      "Registration ID": team.registrationId,
      "Team Name": team.teamName,
      "Team Leader": team.teamLeader,
      "Phone Number": team.phoneNumber,
      "WhatsApp Number": team.whatsappNumber,
      "Player 1": team.player1,
      "Player 2": team.player2,
      "Player 3": team.player3,
      "Player 4": team.player4,
      "Substitute": team.substitute || "None",
      "Payment Proof": team.paymentProof.startsWith('data:') ? 'Uploaded Image Attachment' : team.paymentProof,
      "Registration Date": new Date(team.registeredAt).toLocaleString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Registered Teams");

    // Set column widths
    worksheet['!cols'] = [
      { wch: 6 },  // S.No
      { wch: 16 }, // Reg ID
      { wch: 22 }, // Team Name
      { wch: 18 }, // Leader
      { wch: 15 }, // Phone
      { wch: 15 }, // WhatsApp
      { wch: 18 }, // P1
      { wch: 18 }, // P2
      { wch: 18 }, // P3
      { wch: 18 }, // P4
      { wch: 18 }, // Sub
      { wch: 30 }, // Payment Proof
      { wch: 22 }  // Date
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="VORTEX_CLASH_2026_TEAMS_${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, message: "Error generating Excel export" });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
  }

  const exists = await getDbRow('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  if (exists) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
  }

  const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = { id: userId, name: String(name).trim(), email: String(email).trim().toLowerCase(), passwordHash, role: 'user', createdAt: new Date().toISOString() };

  await runDb('INSERT INTO users (id, name, email, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [user.id, user.name, user.email, user.passwordHash, user.role, user.createdAt]);
  req.session.userId = user.id;
  req.session.role = user.role;

  res.status(201).json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const user = await getDbRow('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out.' });
  });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await getDbRow('SELECT id, name, email, role, createdAt FROM users WHERE id = ?', [req.session.userId]);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Session invalid.' });
  }
  res.json({ success: true, user });
});

app.get('/api/my-team', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ success: true, team: null });
  }
  const team = await getDbRow('SELECT * FROM teams WHERE userId = ?', [req.session.userId]);
  if (!team) {
    return res.json({ success: true, team: null });
  }
  res.json({ success: true, team: { ...team, registrationId: team.registrationNumber, registeredAt: team.createdAt } });
});

app.get('/api/my-pass', requireAuth, async (req, res) => {
  const team = await getDbRow('SELECT * FROM teams WHERE userId = ?', [req.session.userId]);
  if (!team) {
    return res.status(404).json({ success: false, message: 'No team found for this user.' });
  }
  res.json({ success: true, team: { ...team, registrationId: team.registrationNumber, registeredAt: team.createdAt } });
});

app.get('/api/team/:id', requireAuth, async (req, res) => {
  const team = await getDbRow('SELECT * FROM teams WHERE id = ?', [req.params.id]);
  if (!team) {
    return res.status(404).json({ success: false, message: 'Team not found.' });
  }
  if (team.userId !== req.session.userId && req.session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  res.json({ success: true, team: { ...team, registrationId: team.registrationNumber, registeredAt: team.createdAt } });
});

// Sponsors Endpoints
app.get('/api/sponsors', async (req, res) => {
  try {
    const rows = await getDbRows('SELECT * FROM sponsors ORDER BY orderIndex ASC, createdAt ASC');
    if (rows && rows.length > 0) {
      db.sponsors = rows;
      dbData.sponsors = rows;
      return res.json({ success: true, sponsors: rows });
    }
    const sorted = [...(db.sponsors || [])].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({ success: true, sponsors: sorted });
  } catch (err) {
    console.error('Get sponsors error:', err);
    res.json({ success: true, sponsors: db.sponsors || [] });
  }
});

app.post('/api/sponsors', async (req, res) => {
  try {
    const { name, role, description, logoUrl, profileLink, orderIndex } = req.body || {};
    if (!name || !role) {
      return res.status(400).json({ success: false, message: "Sponsor Name and Role are required." });
    }
    const savedLogo = saveBase64Image(logoUrl, 'sponsor') || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80";
    const newSponsor = {
      id: `sp-${Date.now()}`,
      name: String(name).trim(),
      role: String(role).trim(),
      description: description ? String(description).trim() : "",
      logoUrl: savedLogo,
      profileLink: profileLink ? String(profileLink).trim() : "#",
      orderIndex: Number(orderIndex) || (db.sponsors ? db.sponsors.length + 1 : 1),
      createdAt: new Date().toISOString()
    };

    await runDb(`INSERT INTO sponsors (id, name, role, description, logoUrl, profileLink, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      newSponsor.id, newSponsor.name, newSponsor.role, newSponsor.description,
      newSponsor.logoUrl, newSponsor.profileLink, newSponsor.orderIndex, newSponsor.createdAt
    ]);

    if (!db.sponsors) db.sponsors = [];
    db.sponsors.push(newSponsor);
    dbData.sponsors = db.sponsors;
    saveDB(db);

    res.status(201).json({ success: true, sponsor: newSponsor });
  } catch (err) {
    console.error('Add sponsor error:', err);
    res.status(500).json({ success: false, message: 'Failed to add sponsor.' });
  }
});

app.put('/api/sponsors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, description, logoUrl, profileLink, orderIndex } = req.body || {};

    const savedLogo = saveBase64Image(logoUrl, 'sponsor');

    await runDb(`UPDATE sponsors SET name = ?, role = ?, description = ?, logoUrl = ?, profileLink = ?, orderIndex = ? WHERE id = ?`, [
      name, role, description || '', savedLogo, profileLink || '#', Number(orderIndex) || 1, id
    ]);

    if (!db.sponsors) db.sponsors = [];
    const index = db.sponsors.findIndex(s => s.id === id);
    if (index !== -1) {
      db.sponsors[index] = {
        ...db.sponsors[index],
        name: name || db.sponsors[index].name,
        role: role || db.sponsors[index].role,
        description: description !== undefined ? description : db.sponsors[index].description,
        logoUrl: savedLogo || db.sponsors[index].logoUrl,
        profileLink: profileLink !== undefined ? profileLink : db.sponsors[index].profileLink,
        orderIndex: orderIndex !== undefined ? Number(orderIndex) : db.sponsors[index].orderIndex,
        id
      };
    } else {
      db.sponsors.push({
        id, name, role, description, logoUrl: savedLogo, profileLink, orderIndex: Number(orderIndex) || 1, createdAt: new Date().toISOString()
      });
    }
    dbData.sponsors = db.sponsors;
    saveDB(db);

    const updatedSponsor = (index !== -1) ? db.sponsors[index] : { id, name, role, description, logoUrl: savedLogo, profileLink, orderIndex };
    res.json({ success: true, sponsor: updatedSponsor });
  } catch (err) {
    console.error('Update sponsor error:', err);
    res.status(500).json({ success: false, message: 'Failed to update sponsor.' });
  }
});

app.delete('/api/sponsors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runDb('DELETE FROM sponsors WHERE id = ?', [id]);
    if (db.sponsors) {
      db.sponsors = db.sponsors.filter(s => s.id !== id);
      dbData.sponsors = db.sponsors;
    }
    saveDB(db);
    res.json({ success: true, message: "Sponsor removed successfully" });
  } catch (err) {
    console.error('Delete sponsor error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete sponsor.' });
  }
});

// Rules Endpoints
app.get('/api/rules', async (req, res) => {
  try {
    const rows = await getDbRows('SELECT * FROM rules ORDER BY orderIndex ASC, createdAt ASC');
    if (rows && rows.length > 0) {
      db.rules = rows;
      dbData.rules = rows;
      return res.json({ success: true, rules: rows });
    }
    const sorted = [...(db.rules || [])].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    res.json({ success: true, rules: sorted });
  } catch (err) {
    console.error('Get rules error:', err);
    res.json({ success: true, rules: db.rules || [] });
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    const { category, title, content, orderIndex } = req.body || {};
    if (!category || !title || !content) {
      return res.status(400).json({ success: false, message: "Category, Title, and Content are required." });
    }
    const newRule = {
      id: `r-${Date.now()}`,
      category: String(category).trim(),
      title: String(title).trim(),
      content: String(content).trim(),
      orderIndex: Number(orderIndex) || (db.rules ? db.rules.length + 1 : 1),
      createdAt: new Date().toISOString()
    };
    await runDb(`INSERT INTO rules (id, category, title, content, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [
      newRule.id, newRule.category, newRule.title, newRule.content, newRule.orderIndex, newRule.createdAt
    ]);
    if (!db.rules) db.rules = [];
    db.rules.push(newRule);
    dbData.rules = db.rules;
    saveDB(db);
    res.status(201).json({ success: true, rule: newRule });
  } catch (err) {
    console.error('Add rule error:', err);
    res.status(500).json({ success: false, message: 'Failed to add rule.' });
  }
});

app.put('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, title, content, orderIndex } = req.body || {};

    await runDb(`UPDATE rules SET category = ?, title = ?, content = ?, orderIndex = ? WHERE id = ?`, [
      category, title, content, Number(orderIndex) || 1, id
    ]);

    if (!db.rules) db.rules = [];
    const index = db.rules.findIndex(r => r.id === id);
    if (index !== -1) {
      db.rules[index] = {
        ...db.rules[index],
        category: category || db.rules[index].category,
        title: title || db.rules[index].title,
        content: content || db.rules[index].content,
        orderIndex: orderIndex !== undefined ? Number(orderIndex) : db.rules[index].orderIndex,
        id
      };
    }
    dbData.rules = db.rules;
    saveDB(db);
    res.json({ success: true, rule: (index !== -1) ? db.rules[index] : { id, category, title, content, orderIndex } });
  } catch (err) {
    console.error('Update rule error:', err);
    res.status(500).json({ success: false, message: 'Failed to update rule.' });
  }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runDb('DELETE FROM rules WHERE id = ?', [id]);
    if (db.rules) {
      db.rules = db.rules.filter(r => r.id !== id);
      dbData.rules = db.rules;
    }
    saveDB(db);
    res.json({ success: true, message: "Rule deleted successfully" });
  } catch (err) {
    console.error('Delete rule error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete rule.' });
  }
});

// -------------------------------------------------------------
// Tournament Bracket Endpoints
// -------------------------------------------------------------
app.get('/api/bracket', (req, res) => {
  // Return bracket along with team map for easy lookup
  const teamMap = {};
  db.teams.forEach(t => {
    teamMap[t.registrationId] = {
      registrationId: t.registrationId,
      teamName: t.teamName,
      teamLogo: t.teamLogo,
      teamLeader: t.teamLeader
    };
  });

  res.json({
    success: true,
    bracket: db.bracket,
    teamMap: teamMap
  });
});

// Admin Bracket Generation
app.post('/api/bracket/generate', (req, res) => {
  if (db.bracket.isLocked) {
    return res.status(400).json({
      success: false,
      message: "Bracket is currently LOCKED. Unlock it before regenerating."
    });
  }

  const newBracket = generateKnockoutBracket(db.teams);
  db.bracket = newBracket;
  saveDB(db);

  res.json({
    success: true,
    message: `Generated Single Elimination Bracket with ${newBracket.matches.length} matches across ${newBracket.totalRounds} rounds.`,
    bracket: db.bracket
  });
});

// Admin Bracket Publishing Toggle
app.post('/api/bracket/publish', (req, res) => {
  const { publish } = req.body;
  db.bracket.status = publish ? "PUBLISHED" : "UNPUBLISHED";
  saveDB(db);
  res.json({
    success: true,
    message: db.bracket.status === "PUBLISHED" ? "LIVE TOURNAMENT BRACKET Published!" : "Bracket set to UNPUBLISHED.",
    status: db.bracket.status
  });
});

// Admin Bracket Lock Toggle
app.post('/api/bracket/lock', (req, res) => {
  const { locked } = req.body;
  db.bracket.isLocked = !!locked;
  saveDB(db);
  res.json({
    success: true,
    message: db.bracket.isLocked ? "Bracket is now LOCKED." : "Bracket is now UNLOCKED.",
    isLocked: db.bracket.isLocked
  });
});

// Admin Match Schedule & Status update
app.post('/api/bracket/match/update', (req, res) => {
  const { matchId, scheduledTime, status } = req.body;
  const match = db.bracket.matches.find(m => m.id === matchId);
  if (!match) {
    return res.status(404).json({ success: false, message: "Match not found" });
  }

  if (scheduledTime) match.scheduledTime = scheduledTime;
  if (status) match.status = status;

  saveDB(db);
  res.json({ success: true, match: match });
});

// Admin Match Winner Selection (Automatic Winner Progression!)
app.post('/api/bracket/match/winner', (req, res) => {
  const { matchId, winnerId } = req.body;
  const match = db.bracket.matches.find(m => m.id === matchId);
  if (!match) {
    return res.status(404).json({ success: false, message: "Match not found" });
  }

  if (winnerId && winnerId !== match.team1Id && winnerId !== match.team2Id) {
    return res.status(400).json({ success: false, message: "Selected winner must be one of the participating teams." });
  }

  match.winnerId = winnerId;
  match.status = winnerId ? "COMPLETED" : "UPCOMING";

  // Recalculate downstream matches
  db.bracket = recalculateBracket(db.bracket, matchId);
  saveDB(db);

  res.json({
    success: true,
    message: `Match winner updated successfully. Winner advanced to next round.`,
    bracket: db.bracket
  });
});

// Admin Match Result Reset
app.post('/api/bracket/match/reset', (req, res) => {
  const { matchId } = req.body;
  const match = db.bracket.matches.find(m => m.id === matchId);
  if (!match) {
    return res.status(404).json({ success: false, message: "Match not found" });
  }

  match.winnerId = null;
  match.status = "UPCOMING";

  db.bracket = recalculateBracket(db.bracket, matchId);
  saveDB(db);

  res.json({
    success: true,
    message: "Match result reset successfully.",
    bracket: db.bracket
  });
});

// Admin Arrange Teams in Round 1
app.post('/api/bracket/arrange', (req, res) => {
  if (db.bracket.isLocked) {
    return res.status(400).json({ success: false, message: "Bracket is LOCKED. Cannot rearrange teams." });
  }

  const { matchId, team1Id, team2Id } = req.body;
  const match = db.bracket.matches.find(m => m.id === matchId);
  if (!match || match.roundIndex !== 0) {
    return res.status(400).json({ success: false, message: "Can only arrange Round 1 matches." });
  }

  match.team1Id = team1Id || null;
  match.team2Id = team2Id || null;

  // If one of them is BYE, auto advance
  if (match.team1Id && !match.team2Id) {
    match.winnerId = match.team1Id;
    match.status = "COMPLETED";
  } else if (!match.team1Id && match.team2Id) {
    match.winnerId = match.team2Id;
    match.status = "COMPLETED";
  } else {
    match.winnerId = null;
    match.status = "UPCOMING";
  }

  db.bracket = recalculateBracket(db.bracket, matchId);
  saveDB(db);

  res.json({ success: true, message: "Matchup arranged successfully", bracket: db.bracket });
});

// Admin Auth Endpoint
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  const normalizedUsername = String(username).trim();
  const adminUser = await getDbRow('SELECT * FROM users WHERE role = ? AND (LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?))', ['admin', normalizedUsername, normalizedUsername]);
  if (!adminUser) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  const valid = await bcrypt.compare(String(password), adminUser.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  req.session.userId = adminUser.id;
  req.session.role = 'admin';
  return res.json({ success: true, token: 'vortex-admin-session-token', user: { id: adminUser.id, name: adminUser.name, role: 'admin' } });
});

// Live Sync Status for viewers & admin
app.get('/api/live-sync', (req, res) => {
  res.json({
    success: true,
    totalTeams: db.teams.length,
    maxTeams: db.settings.maxTeams,
    registrationOpen: db.settings.registrationOpen,
    bracketStatus: db.bracket.status,
    championTeamId: db.bracket.championTeamId,
    timestamp: Date.now()
  });
});

// -------------------------------------------------------------
// DEVTOOLS+ UTILITY ENDPOINTS
// -------------------------------------------------------------
app.post('/api/dev/seed-teams', (req, res) => {
  const count = Number(req.body.count) || 16;
  const mockNames = [
    "VORTEX VIPERS", "TAMIL TITANS", "SHADOW STRIKERS", "BLAZE SQUAD",
    "NEO APEX", "CYBER WOLVES", "INFERNO WARRIORS", "GODS OF ARENA",
    "CHENNAI CYBORGS", "MADURAI MONARCHS", "KONGU KINGS", "THILLAI TIGERS",
    "VALIANT VANGUARD", "DELTA DRAGONS", "PHOENIX FORCE", "ALPHA SQUAD",
    "TITAN RAIDERS", "OMEGA ECLIPSE", "HYDRA HUNTERS", "STEALTH REAPERS",
    "CHOLA GLADIATORS", "PANDYA POWER", "CHERAN CLAN", "AVALANCHE ACE",
    "STORM BREAKERS", "BLACK PANTHERS", "NIGHT OWLS", "VENOM ELITE",
    "ROYAL KNIGHTS", "IMMORTAL KINGS"
  ];

  db.teams = [];
  for (let i = 0; i < Math.min(count, mockNames.length); i++) {
    const formattedNum = String(i + 1).padStart(4, '0');
    db.teams.push({
      registrationId: `VC2026-${formattedNum}`,
      teamName: mockNames[i],
      teamLogo: defaultState.teams[i % defaultState.teams.length]?.teamLogo || "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=200&q=80",
      teamLeader: `Captain ${i + 1}`,
      phoneNumber: `98765432${String(i).padStart(2, '0')}`,
      whatsappNumber: `98765432${String(i).padStart(2, '0')}`,
      player1: `Leader ${i + 1}`,
      player2: `Fragger ${i + 1}`,
      player3: `Assaulter ${i + 1}`,
      player4: `Support ${i + 1}`,
      substitute: i % 2 === 0 ? `Sub ${i + 1}` : "",
      paymentProof: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
      joinedWhatsapp: true,
      joinedDiscord: true,
      registeredAt: new Date().toISOString()
    });
  }

  // Reset bracket
  db.bracket = {
    status: "UNPUBLISHED",
    isLocked: false,
    totalRounds: 0,
    championTeamId: null,
    matches: []
  };

  saveDB(db);
  res.json({ success: true, message: `Seeded ${db.teams.length} test squads successfully.`, teams: db.teams });
});

app.post('/api/dev/simulate-round', (req, res) => {
  if (!db.bracket.matches || db.bracket.matches.length === 0) {
    return res.status(400).json({ success: false, message: "Generate a bracket first." });
  }

  // Find the earliest round with pending matches
  let targetRound = null;
  for (let r = 0; r < db.bracket.totalRounds; r++) {
    const roundMatches = db.bracket.matches.filter(m => m.roundIndex === r);
    const hasPending = roundMatches.some(m => !m.winnerId && (m.team1Id || m.team2Id));
    if (hasPending) {
      targetRound = r;
      break;
    }
  }

  if (targetRound === null) {
    return res.json({ success: true, message: "All rounds are already completed!", bracket: db.bracket });
  }

  const roundMatches = db.bracket.matches.filter(m => m.roundIndex === targetRound);
  roundMatches.forEach(m => {
    if (!m.winnerId) {
      const candidates = [m.team1Id, m.team2Id].filter(Boolean);
      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        m.winnerId = picked;
        m.status = "COMPLETED";
        db.bracket = recalculateBracket(db.bracket, m.id);
      }
    }
  });

  saveDB(db);
  res.json({
    success: true,
    message: `Simulated results for ${roundMatches[0]?.roundName || 'Round'}.`,
    bracket: db.bracket
  });
});

app.post('/api/dev/timewarp', (req, res) => {
  if (!db.bracket.matches || db.bracket.matches.length === 0) {
    return res.status(400).json({ success: false, message: "No bracket matches found." });
  }

  // Set next upcoming match scheduled time to 1 second ago (MATCH LIVE)
  const upcoming = db.bracket.matches.find(m => m.status === 'UPCOMING' && m.team1Id && m.team2Id);
  if (upcoming) {
    upcoming.scheduledTime = new Date(Date.now() - 5000).toISOString();
    saveDB(db);
    return res.json({ success: true, message: `Fast-forwarded Match #${upcoming.matchNumber} (${upcoming.roundName}) to LIVE!`, match: upcoming });
  }

  res.json({ success: false, message: "No upcoming ready match found." });
});

app.post('/api/dev/reset-db', (req, res) => {
  db = JSON.parse(JSON.stringify(defaultState));
  saveDB(db);
  res.json({ success: true, message: "Database restored to clean default state.", state: db });
});

app.get('/api/dev/db-dump', (req, res) => {
  res.json({ success: true, state: db });
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  DS TAMIL GAMING — VORTEX CLASH 2026 SERVER ACTIVE`);
    console.log(`  Listening on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
