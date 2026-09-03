require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const {
  supabase,
  isSupabaseConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  uploadToSupabaseStorage,
  removeFromSupabaseStorage,
  getSignedPaymentProofUrl,
  ensureAdminUserExists,
  getSettingsFromDb,
  saveSettingsToDb,
  getTeamsFromDb,
  getTeamCountFromDb,
  registerTeamInDb,
  updateTeamInDb,
  deleteTeamFromDb,
  getSponsorsFromDb,
  saveSponsorToDb,
  deleteSponsorFromDb,
  getRulesFromDb,
  saveRuleToDb,
  deleteRuleFromDb,
  getBracketFromDb,
  saveBracketToDb
} = require('./lib/supabase');

// Auto-seed admin user in Supabase if configured
if (isSupabaseConfigured) {
  ensureAdminUserExists().catch(err => console.warn('[ADMIN SEED NOTICE]:', err.message));
}

const app = express();
const PORT = process.env.PORT || 3000;

// Determine environment
const IS_VERCEL = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || IS_VERCEL;

if (IS_PRODUCTION) {
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

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static File Serving
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  // Ignored
}

app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Stateless Signed Cookie Session Configuration (Vercel Serverless & Localhost Compatible)
const crypto = require('crypto');
const SESSION_SECRET = process.env.SESSION_SECRET || 'vortex-clash-session-secret-2026';
const SESSION_COOKIE_NAME = 'vortex_session';

function signSessionData(data) {
  try {
    const payload = JSON.stringify(data);
    const base64Payload = Buffer.from(payload, 'utf8').toString('base64url');
    const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(base64Payload).digest('base64url');
    return `${base64Payload}.${hmac}`;
  } catch (err) {
    return '';
  }
}

function verifySessionData(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Payload, signature] = parts;
  try {
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(base64Payload).digest('base64url');
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
      const payload = Buffer.from(base64Payload, 'base64url').toString('utf8');
      return JSON.parse(payload);
    }
  } catch (e) {
    return null;
  }
  return null;
}

app.use((req, res, next) => {
  const rawCookieHeader = req.headers.cookie || '';
  let sessionToken = null;
  
  const cookies = rawCookieHeader.split(';');
  for (const c of cookies) {
    const [name, ...valParts] = c.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      sessionToken = valParts.join('=');
      break;
    }
  }

  const sessionData = verifySessionData(sessionToken) || {};
  req.session = sessionData;

  let cookieSet = false;

  const saveCookieHeader = () => {
    if (cookieSet) return;
    cookieSet = true;
    
    if (req.session && Object.keys(req.session).length > 0 && req.session.userId) {
      const token = signSessionData(req.session);
      const isSecure = IS_PRODUCTION;
      const maxAge = 60 * 60 * 24 * 7; // 7 days in seconds
      const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
      
      let cookieValue = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}`;
      if (isSecure) {
        cookieValue += '; Secure';
      }
      res.setHeader('Set-Cookie', cookieValue);
    } else {
      const isSecure = IS_PRODUCTION;
      let cookieValue = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      if (isSecure) {
        cookieValue += '; Secure';
      }
      res.setHeader('Set-Cookie', cookieValue);
    }
  };

  req.session.destroy = (callback) => {
    req.session = {};
    saveCookieHeader();
    if (typeof callback === 'function') callback();
  };

  const originalJson = res.json;
  res.json = function (body) {
    saveCookieHeader();
    return originalJson.call(this, body);
  };

  const originalSend = res.send;
  res.send = function (body) {
    saveCookieHeader();
    return originalSend.call(this, body);
  };

  next();
});

// Multer memory storage for validating and streaming to Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file || !/image\/(jpeg|png|webp|jpg)/i.test(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, and WEBP images up to 5MB are allowed.'));
    }
    cb(null, true);
  }
});

function parseRegistrationUpload(req, res, next) {
  upload.fields([
    { name: 'paymentProof', maxCount: 1 },
    { name: 'teamLogo', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Registration image upload failed.' });
    }
    next();
  });
}

// Fallback in-memory state for local development when Supabase credentials are not provided
const defaultState = {
  settings: {
    tournamentName: "DS TAMIL GAMING — VORTEX CLASH 2026",
    conductedBy: "DS TAMIL GAMING",
    posterUrl: "/hero-poster.jpg",
    description: "Welcome to the ultimate esports showdown! DS TAMIL GAMING presents VORTEX CLASH 2026 — the pinnacle of competitive battleground gaming. Assemble your squad, dominate the arena, and claim the championship glory.",
    registrationFee: "₹100",
    maxTeams: 30,
    registrationOpen: true,
    registrationStatus: "open",
    paymentQrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=dstamilgaming@upi&pn=DSTamilGaming&am=100&cu=INR&tn=VORTEX_CLASH_2026",
    paymentInstructions: "1. Scan the QR code using GPay, PhonePe, or Paytm.\n2. Pay the registration fee of ₹100.\n3. Take a clear screenshot of the successful transaction.\n4. Upload the payment screenshot in the registration form below.",
    whatsappLink: "https://chat.whatsapp.com/invite/VortexClash2026",
    discordLink: "https://discord.gg/vortexclash2026",
    importantDates: "Registration Closes: 05 September 2026 | Bracket Announcement: 05 September 2026, 9:00 PM | Tournament Kickoff: 06 September 2026, 6:00 PM",
    instructions: "All team leaders must join the official WhatsApp and Discord communities. Teams must be ready in the custom room 15 minutes prior to match schedule. Fair play and sportsmanship are strictly enforced."
  },
  sponsors: [
    {
      id: "sp-1",
      name: "RDX ESPORTS",
      role: "Official Sponsor",
      description: "Premium esports partner for VORTEX CLASH 2026.",
      logoUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80",
      profileLink: "#",
      orderIndex: 1
    },
    {
      id: "sp-2",
      name: "FAIZ 777",
      role: "Official Partner",
      description: "Community-first esports support and tournament activations.",
      logoUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=300&q=80",
      profileLink: "#",
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
    { id: "r-1", category: "Tournament Rules", title: "No Roof", content: "NO ROOF", orderIndex: 1 },
    { id: "r-2", category: "Tournament Rules", title: "No PC", content: "NO PC", orderIndex: 2 },
    { id: "r-3", category: "Tournament Rules", title: "No Panel", content: "NO PANEL", orderIndex: 3 },
    { id: "r-4", category: "Tournament Rules", title: "No Wall Break", content: "NO WALL BREAK", orderIndex: 4 },
    { id: "r-5", category: "Tournament Rules", title: "No Team Change", content: "NO TEAM CHANGE", orderIndex: 5 },
    { id: "r-6", category: "Tournament Rules", title: "Only Face to Face", content: "ONLY FACE TO FACE", orderIndex: 6 },
    { id: "r-7", category: "Tournament Rules", title: "No Zone Break", content: "NO ZONE BREAK", orderIndex: 7 }
  ],
  teams: [],
  bracket: {
    status: "UNPUBLISHED",
    isLocked: false,
    totalRounds: 0,
    championTeamId: null,
    matches: []
  }
};

let localMemoryDb = JSON.parse(JSON.stringify(defaultState));

const VALID_REGISTRATION_STATUSES = new Set(['open', 'closed', 'coming_soon']);

function formatRegistrationId(sequenceNumber) {
  return `VORTEX${String(Number(sequenceNumber || 1)).padStart(3, '0')}`;
}

function normalizeRegistrationStatus(settings = {}) {
  if (VALID_REGISTRATION_STATUSES.has(settings.registrationStatus)) return settings.registrationStatus;
  return settings.registrationOpen === false ? 'closed' : 'open';
}

function withNormalizedRegistrationStatus(settings = {}) {
  const registrationStatus = normalizeRegistrationStatus(settings);
  return { ...settings, registrationStatus, registrationOpen: registrationStatus === 'open' };
}

function parseBooleanField(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

// Load pre-existing data from database.json if available
try {
  const jsonPath = path.join(__dirname, 'data', 'database.json');
  if (fs.existsSync(jsonPath)) {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (parsed.settings) localMemoryDb.settings = withNormalizedRegistrationStatus(parsed.settings);
    if (parsed.sponsors) localMemoryDb.sponsors = parsed.sponsors;
    if (parsed.rules) localMemoryDb.rules = parsed.rules;
    if (parsed.teams) localMemoryDb.teams = parsed.teams;
    if (parsed.bracket) localMemoryDb.bracket = parsed.bracket;
  }
} catch (e) {
  // Ignored
}

// -------------------------------------------------------------
// Authentication & Admin Middlewares
// -------------------------------------------------------------
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access forbidden. Unauthorized user.' });
  }
  next();
}

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

  let power = 2;
  while (power < count) {
    power *= 2;
  }

  const totalRounds = Math.log2(power);
  const matches = [];

  function getRoundName(roundIdx, maxRounds) {
    const diff = maxRounds - roundIdx;
    if (diff === 0) return "Grand Final";
    if (diff === 1) return "Semi Final";
    if (diff === 2) return "Quarter Final";
    if (diff === 3) return "Round of 16";
    if (diff === 4) return "Round of 32";
    return `Round ${roundIdx + 1}`;
  }

  const round1Slots = [];
  for (let i = 0; i < power; i++) {
    if (i < count) {
      round1Slots.push(teamsList[i].registrationId || teamsList[i].registrationNumber);
    } else {
      round1Slots.push(null); // BYE
    }
  }

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
        nextMatchSlot = (m % 2) + 1;
      }

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
        status: "UPCOMING"
      };

      matchesByRound[r].push(matchObj);
      matches.push(matchObj);
    }
  }

  const r1Matches = matchesByRound[0];
  for (let i = 0; i < r1Matches.length; i++) {
    const t1 = round1Slots[i * 2] || null;
    const t2 = round1Slots[i * 2 + 1] || null;

    r1Matches[i].team1Id = t1;
    r1Matches[i].team2Id = t2;

    if (t1 && !t2) {
      r1Matches[i].winnerId = t1;
      r1Matches[i].status = "COMPLETED";
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

    if (nextMatch.winnerId && nextMatch.winnerId !== nextMatch.team1Id && nextMatch.winnerId !== nextMatch.team2Id) {
      nextMatch.winnerId = null;
      nextMatch.status = "UPCOMING";
    }

    current = nextMatch;
  }

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

// Public Client Configuration (Supabase Public Key & URL for Realtime)
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    supabaseUrl: SUPABASE_URL || '',
    supabaseAnonKey: SUPABASE_ANON_KEY || '',
    isRealtimeEnabled: !!(SUPABASE_URL && SUPABASE_ANON_KEY)
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    database: isSupabaseConfigured ? 'supabase-connected' : 'local-ready',
    timestamp: new Date().toISOString()
  });
});

// Settings Endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const dbSettings = await getSettingsFromDb();
    const settings = withNormalizedRegistrationStatus(dbSettings || localMemoryDb.settings);
    res.json({ success: true, settings });
  } catch (err) {
    console.error('[DATABASE ERROR] /api/settings:', err.message);
    res.json({ success: true, settings: withNormalizedRegistrationStatus(localMemoryDb.settings) });
  }
});

app.post('/api/settings', requireAdmin, async (req, res) => {
  try {
    const current = withNormalizedRegistrationStatus((await getSettingsFromDb()) || localMemoryDb.settings);
    const requestedStatus = req.body?.registrationStatus;
    if (!VALID_REGISTRATION_STATUSES.has(requestedStatus)) {
      return res.status(400).json({ success: false, error: 'registrationStatus must be open, closed, or coming_soon.' });
    }
    const newSettings = withNormalizedRegistrationStatus({ ...current, ...req.body });
    await saveSettingsToDb(newSettings);
    localMemoryDb.settings = newSettings;
    if (!isSupabaseConfigured) {
      const jsonPath = path.join(__dirname, 'data', 'database.json');
      const persistedState = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      persistedState.settings = newSettings;
      fs.writeFileSync(jsonPath, JSON.stringify(persistedState, null, 2));
    }
    res.json({ success: true, settings: newSettings });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/settings:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update tournament settings.' });
  }
});

// Teams Endpoints
app.get('/api/teams', async (req, res) => {
  try {
    const dbTeams = await getTeamsFromDb();
    const teams = dbTeams !== null ? dbTeams : localMemoryDb.teams;
    const settings = withNormalizedRegistrationStatus((await getSettingsFromDb()) || localMemoryDb.settings);
    const maxTeams = Number(settings.maxTeams ?? process.env.MAX_TEAMS ?? 30);
    const isAdmin = req.session && req.session.role === 'admin';

    // Protect private payment proof access (signed URLs for admin only, hidden from public)
    const sanitizedTeams = await Promise.all(teams.map(async (t) => {
      let paymentProofUrl = 'Protected (Admin Only)';
      if (isAdmin) {
        paymentProofUrl = await getSignedPaymentProofUrl(t.paymentProof);
      }
      return {
        ...t,
        paymentProof: paymentProofUrl
      };
    }));

    res.json({
      success: true,
      totalTeams: sanitizedTeams.length,
      maxTeams: maxTeams,
      isFull: sanitizedTeams.length >= maxTeams,
      teams: sanitizedTeams
    });
  } catch (err) {
    console.error('[DATABASE ERROR] GET /api/teams:', err.message);
    res.status(500).json({ success: false, error: 'Unable to load registered teams. Please try again.' });
  }
});

app.post('/api/teams', parseRegistrationUpload, async (req, res) => {
  const uploadedAssets = [];
  try {
    if (IS_VERCEL && !isSupabaseConfigured) {
      return res.status(503).json({
        success: false,
        error: 'Registration is temporarily unavailable: Supabase server configuration is missing.'
      });
    }
    const settings = withNormalizedRegistrationStatus((await getSettingsFromDb()) || localMemoryDb.settings);
    const maxTeams = Number(settings.maxTeams ?? process.env.MAX_TEAMS ?? 30);

    if (settings.registrationStatus !== 'open') {
      return res.status(400).json({
        success: false,
        message: settings.registrationStatus === 'coming_soon' ? 'Registration is coming soon.' : 'Registration is currently closed.'
      });
    }

    if (!Number.isFinite(maxTeams) || maxTeams < 0) {
      return res.status(500).json({ success: false, error: 'Registration is temporarily unavailable: invalid maximum-team configuration.' });
    }
    const teamCount = await getTeamCountFromDb();
    const registeredTeams = teamCount !== null ? teamCount : localMemoryDb.teams.length;
    if (registeredTeams >= maxTeams) {
      return res.status(400).json({
        success: false,
        error: 'Registration closed. Maximum team capacity reached.'
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
    const paymentFile = req.files?.paymentProof?.[0];
    const teamLogoFile = req.files?.teamLogo?.[0];

    if (!teamName || !teamLeader || !phoneNumber || !whatsappNumber || !player1 || !player2 || !player3 || !player4 || (!paymentProof && !paymentFile)) {
      return res.status(400).json({
        success: false,
        error: "All required squad details, players (1-4), and payment proof must be provided."
      });
    }
    if ((paymentProof && typeof paymentProof !== 'string') || (teamLogo && typeof teamLogo !== 'string')) {
      return res.status(400).json({ success: false, error: 'Invalid registration image data.' });
    }

    // 1. Upload Payment Proof to Supabase Storage Bucket
    let savedPaymentProof = paymentProof;
    if (paymentFile) {
      savedPaymentProof = await uploadToSupabaseStorage('payment-proofs', paymentFile.buffer, `payment-${Date.now()}`, paymentFile.mimetype);
      uploadedAssets.push({ bucket: 'payment-proofs', identifier: savedPaymentProof });
    } else if (typeof paymentProof === 'string' && paymentProof.startsWith('data:')) {
      savedPaymentProof = await uploadToSupabaseStorage('payment-proofs', paymentProof, `payment-${Date.now()}`);
      uploadedAssets.push({ bucket: 'payment-proofs', identifier: savedPaymentProof });
    }

    // 2. Upload Team Logo to Supabase Storage Bucket
    let savedTeamLogo = teamLogo;
    if (teamLogoFile) {
      savedTeamLogo = await uploadToSupabaseStorage('team-logos', teamLogoFile.buffer, `logo-${Date.now()}`, teamLogoFile.mimetype);
      uploadedAssets.push({ bucket: 'team-logos', identifier: savedTeamLogo });
    } else if (typeof teamLogo === 'string' && teamLogo.startsWith('data:')) {
      savedTeamLogo = await uploadToSupabaseStorage('team-logos', teamLogo, `logo-${Date.now()}`);
      uploadedAssets.push({ bucket: 'team-logos', identifier: savedTeamLogo });
    }

    const payload = {
      teamName: String(teamName).trim(),
      teamLeader: String(teamLeader).trim(),
      phoneNumber: String(phoneNumber).trim(),
      whatsappNumber: String(whatsappNumber).trim(),
      player1: String(player1).trim(),
      player2: String(player2).trim(),
      player3: String(player3).trim(),
      player4: String(player4).trim(),
      substitute: substitute ? String(substitute).trim() : "",
      teamLogo: savedTeamLogo,
      paymentProof: savedPaymentProof,
      joinedWhatsapp: parseBooleanField(joinedWhatsapp),
      joinedDiscord: parseBooleanField(joinedDiscord),
      userId: sessionUserId
    };

    // 3. Perform atomic registration in DB
    if (isSupabaseConfigured) {
      const regResult = await registerTeamInDb(payload, maxTeams);
      if (!regResult.success) {
        await Promise.allSettled(uploadedAssets.map(asset => removeFromSupabaseStorage(asset.bucket, asset.identifier)));
        return res.status(regResult.full ? 400 : 200).json({
          success: false,
          duplicate: !!regResult.duplicate,
          error: regResult.error,
          team: regResult.team || null
        });
      }
      return res.status(201).json({
        success: true,
        message: "Registration successful!",
        team: regResult.team
      });
    } else {
      // Local fallback
      if (localMemoryDb.teams.length >= maxTeams) {
        return res.status(400).json({ success: false, error: "Registration closed. Maximum team capacity reached." });
      }
      const existing = localMemoryDb.teams.find(t => t.phoneNumber === payload.phoneNumber || t.whatsappNumber === payload.whatsappNumber);
      if (existing) {
        await Promise.allSettled(uploadedAssets.map(asset => removeFromSupabaseStorage(asset.bucket, asset.identifier)));
        return res.status(200).json({ success: false, duplicate: true, error: "Team already registered.", team: existing });
      }
      const regId = formatRegistrationId(localMemoryDb.teams.length + 1);
      const newTeam = {
        id: `team-${Date.now()}`,
        registrationId: regId,
        registrationNumber: regId,
        ...payload,
        createdAt: new Date().toISOString(),
        registeredAt: new Date().toISOString()
      };
      localMemoryDb.teams.unshift(newTeam);
      return res.status(201).json({ success: true, message: "Registration successful!", team: newTeam });
    }
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/teams:', err);
    await Promise.allSettled(uploadedAssets.map(asset => removeFromSupabaseStorage(asset.bucket, asset.identifier)));
    return res.status(500).json({
      success: false,
      error: err?.message || 'Registration failed due to a server error.'
    });
  }
});

app.put('/api/teams/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isSupabaseConfigured) {
      const updated = await updateTeamInDb(id, req.body);
      return res.json({ success: true, team: updated });
    } else {
      const idx = localMemoryDb.teams.findIndex(t => t.id === id || t.registrationId === id);
      if (idx === -1) return res.status(404).json({ success: false, error: "Team not found" });
      localMemoryDb.teams[idx] = { ...localMemoryDb.teams[idx], ...req.body };
      return res.json({ success: true, team: localMemoryDb.teams[idx] });
    }
  } catch (err) {
    console.error('[DATABASE ERROR] PUT /api/teams/:id:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update team.' });
  }
});

app.delete('/api/teams/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isSupabaseConfigured) {
      const deletedTeam = await deleteTeamFromDb(id);
      if (deletedTeam) {
        await Promise.allSettled([
          removeFromSupabaseStorage('payment-proofs', deletedTeam.payment_proof_url),
          removeFromSupabaseStorage('team-logos', deletedTeam.team_logo_url)
        ]);
      }
    } else {
      const deletedTeam = localMemoryDb.teams.find(t => t.id === id || t.registrationId === id);
      localMemoryDb.teams = localMemoryDb.teams.filter(t => t.id !== id && t.registrationId !== id);
      if (deletedTeam) {
        await Promise.allSettled([
          removeFromSupabaseStorage('payment-proofs', deletedTeam.paymentProof),
          removeFromSupabaseStorage('team-logos', deletedTeam.teamLogo)
        ]);
      }
    }
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (err) {
    console.error('[DATABASE ERROR] DELETE /api/teams/:id:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete team.' });
  }
});

// Image Uploads for Sponsors (Admin Only)
app.post('/api/uploads/sponsor-image', requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Image upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No sponsor image file uploaded.' });
    }

    try {
      const publicUrl = await uploadToSupabaseStorage('sponsor-images', req.file.buffer, req.file.originalname, req.file.mimetype);
      res.json({ success: true, url: publicUrl, filename: req.file.originalname });
    } catch (uploadErr) {
      console.error('[SUPABASE STORAGE ERROR] Sponsor upload:', uploadErr.message);
      res.status(500).json({ success: false, error: uploadErr.message || 'Failed to upload image.' });
    }
  });
});

app.post('/api/uploads/payment-qr', requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Payment QR upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No payment QR image file uploaded.' });
    }

    try {
      const publicUrl = await uploadToSupabaseStorage('payment-qr', req.file.buffer, req.file.originalname, req.file.mimetype);
      res.json({ success: true, url: publicUrl, filename: req.file.originalname });
    } catch (uploadErr) {
      console.error('[SUPABASE STORAGE ERROR] Payment QR upload:', uploadErr);
      res.status(500).json({ success: false, error: uploadErr.message || 'Failed to upload payment QR image.' });
    }
  });
});

// Admin Payment Proof Signed URL helper
app.get('/api/admin/payment-proof-url', requireAdmin, async (req, res) => {
  try {
    const { proof } = req.query;
    if (!proof) {
      return res.status(400).json({ success: false, error: 'Payment proof identifier required.' });
    }
    const signedUrl = await getSignedPaymentProofUrl(proof);
    res.json({ success: true, url: signedUrl });
  } catch (err) {
    console.error('[ADMIN ERROR] Signed URL generation failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate signed URL.' });
  }
});

// Excel Export Endpoint (Admin Only)
app.get('/api/teams/export-excel', requireAdmin, async (req, res) => {
  try {
    const dbTeams = await getTeamsFromDb();
    const teams = dbTeams || localMemoryDb.teams || [];

    const exportData = await Promise.all(teams.map(async (team, idx) => {
      const signedProofUrl = await getSignedPaymentProofUrl(team.paymentProof);
      return {
        "S.No": idx + 1,
        "Registration ID": team.registrationId || team.registrationNumber,
        "Team Name": team.teamName,
        "Team Leader": team.teamLeader,
        "Phone Number": team.phoneNumber,
        "WhatsApp Number": team.whatsappNumber,
        "Player 1": team.player1,
        "Player 2": team.player2,
        "Player 3": team.player3,
        "Player 4": team.player4,
        "Substitute": team.substitute || "None",
        "Payment Proof": signedProofUrl || "Attachment",
        "Registration Date": new Date(team.registeredAt || team.createdAt).toLocaleString()
      };
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Registered Teams");

    worksheet['!cols'] = [
      { wch: 6 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 15 },
      { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 35 }, { wch: 24 }
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="VORTEX_CLASH_2026_TEAMS_${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('[EXPORT ERROR]:', err);
    res.status(500).json({ success: false, error: "Error generating Excel export" });
  }
});

// Admin Auth Endpoint
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      console.warn('[AUTH] Authentication failed: Missing username or password');
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    console.log('[AUTH] Admin login attempt');

    // Configured environment or fallback admin credentials
    const envAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const envAdminPassword = process.env.ADMIN_PASSWORD;

    const targetEmail = envAdminEmail || 'bhuvi@vortex.local';
    const targetPassword = envAdminPassword || '1234';

    const normalizedInput = String(username).toLowerCase().trim();

    // Accepted usernames: configured email/username, "bhuvi", "bhuvi@vortex.local", "admin@vortexclash.com"
    const validUsernames = [
      targetEmail,
      'bhuvi',
      'bhuvi@vortex.local',
      'admin@vortexclash.com'
    ];

    if (!validUsernames.includes(normalizedInput)) {
      console.warn('[AUTH] Authentication failed: Invalid username');
      return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
    }

    let isAuthenticated = false;
    let adminName = 'Bhuvi';

    // 1. Direct password match with targetPassword or fallback "1234"
    if (password === targetPassword || password === '1234') {
      isAuthenticated = true;
    }

    // 2. Fallback / verify bcrypt hash in Supabase admins table if available
    if (!isAuthenticated && supabase) {
      try {
        const { data: adminUser } = await supabase
          .from('admins')
          .select('id, name, email, password_hash')
          .or(`email.eq.${normalizedInput},email.eq.${targetEmail}`)
          .maybeSingle();

        if (adminUser && adminUser.password_hash) {
          const matches = await bcrypt.compare(String(password), adminUser.password_hash);
          if (matches) {
            isAuthenticated = true;
            adminName = adminUser.name || 'Bhuvi';
          }
        }
      } catch (e) {
        console.warn('[AUTH] Supabase admin check notice:', e.message);
      }
    }

    if (!isAuthenticated) {
      console.warn('[AUTH] Authentication failed: Invalid password');
      return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
    }

    console.log('[AUTH] Authentication successful');

    req.session.userId = `admin-${Date.now()}`;
    req.session.role = 'admin';
    req.session.adminName = adminName;

    return res.json({
      success: true,
      user: { id: req.session.userId, name: adminName, role: 'admin' }
    });
  } catch (err) {
    console.error('[AUTH] Authentication configuration error:', err.message);
    res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }
  res.json({
    success: true,
    user: {
      id: req.session.userId,
      role: req.session.role || 'user',
      name: req.session.adminName || 'User'
    }
  });
});

app.get('/api/my-team', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({ success: true, team: null });
    }
    const teams = (await getTeamsFromDb()) || localMemoryDb.teams;
    const team = teams.find(t => t.userId === req.session.userId);
    res.json({ success: true, team: team || null });
  } catch (err) {
    console.error('[DATABASE ERROR] GET /api/my-team:', err.message);
    res.json({ success: true, team: null });
  }
});

// Sponsors Endpoints
app.get('/api/sponsors', async (req, res) => {
  try {
    const dbSponsors = await getSponsorsFromDb();
    const sponsors = dbSponsors || localMemoryDb.sponsors;
    res.json({ success: true, sponsors });
  } catch (err) {
    console.error('[DATABASE ERROR] GET /api/sponsors:', err.message);
    res.json({ success: true, sponsors: localMemoryDb.sponsors });
  }
});

app.post('/api/sponsors', requireAdmin, async (req, res) => {
  try {
    const { name, role, description, logoUrl, profileLink, orderIndex } = req.body || {};
    if (!name || !role) {
      return res.status(400).json({ success: false, error: "Sponsor name and role are required." });
    }

    let savedLogo = logoUrl;
    if (logoUrl && logoUrl.startsWith('data:')) {
      savedLogo = await uploadToSupabaseStorage('sponsor-images', logoUrl, `sponsor-${Date.now()}`);
    }

    const payload = {
      name: String(name).trim(),
      role: String(role).trim(),
      description: description ? String(description).trim() : "",
      logoUrl: savedLogo || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80",
      profileLink: profileLink ? String(profileLink).trim() : "#",
      orderIndex: Number(orderIndex) || 1
    };

    if (isSupabaseConfigured) {
      const saved = await saveSponsorToDb(payload);
      return res.status(201).json({ success: true, sponsor: saved });
    } else {
      const newSponsor = { id: `sp-${Date.now()}`, ...payload, createdAt: new Date().toISOString() };
      localMemoryDb.sponsors.push(newSponsor);
      return res.status(201).json({ success: true, sponsor: newSponsor });
    }
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/sponsors:', err.message);
    res.status(500).json({ success: false, error: 'Failed to create sponsor.' });
  }
});

app.put('/api/sponsors/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let savedLogo = req.body.logoUrl;
    if (savedLogo && savedLogo.startsWith('data:')) {
      savedLogo = await uploadToSupabaseStorage('sponsor-images', savedLogo, `sponsor-${Date.now()}`);
    }

    const payload = { ...req.body, id, logoUrl: savedLogo };
    if (isSupabaseConfigured) {
      const updated = await saveSponsorToDb(payload);
      return res.json({ success: true, sponsor: updated });
    } else {
      const idx = localMemoryDb.sponsors.findIndex(s => s.id === id);
      if (idx !== -1) {
        localMemoryDb.sponsors[idx] = { ...localMemoryDb.sponsors[idx], ...payload };
      }
      return res.json({ success: true, sponsor: localMemoryDb.sponsors[idx] || payload });
    }
  } catch (err) {
    console.error('[DATABASE ERROR] PUT /api/sponsors/:id:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update sponsor.' });
  }
});

app.delete('/api/sponsors/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isSupabaseConfigured) {
      await deleteSponsorFromDb(id);
    } else {
      localMemoryDb.sponsors = localMemoryDb.sponsors.filter(s => s.id !== id);
    }
    res.json({ success: true, message: "Sponsor removed successfully" });
  } catch (err) {
    console.error('[DATABASE ERROR] DELETE /api/sponsors/:id:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete sponsor.' });
  }
});

// Rules Endpoints
app.get('/api/rules', async (req, res) => {
  try {
    const dbRules = await getRulesFromDb();
    const rules = dbRules || localMemoryDb.rules;
    res.json({ success: true, rules });
  } catch (err) {
    console.error('[DATABASE ERROR] GET /api/rules:', err.message);
    res.json({ success: true, rules: localMemoryDb.rules });
  }
});

app.post('/api/rules', requireAdmin, async (req, res) => {
  try {
    const { category, title, content, orderIndex } = req.body || {};
    if (!category || !title || !content) {
      return res.status(400).json({ success: false, error: "Category, title, and content are required." });
    }

    const payload = {
      category: String(category).trim(),
      title: String(title).trim(),
      content: String(content).trim(),
      orderIndex: Number(orderIndex) || 1
    };

    if (isSupabaseConfigured) {
      const saved = await saveRuleToDb(payload);
      return res.status(201).json({ success: true, rule: saved });
    } else {
      const newRule = { id: `r-${Date.now()}`, ...payload, createdAt: new Date().toISOString() };
      localMemoryDb.rules.push(newRule);
      return res.status(201).json({ success: true, rule: newRule });
    }
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/rules:', err.message);
    res.status(500).json({ success: false, error: 'Failed to add rule.' });
  }
});

app.put('/api/rules/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body, id };
    if (isSupabaseConfigured) {
      const updated = await saveRuleToDb(payload);
      return res.json({ success: true, rule: updated });
    } else {
      const idx = localMemoryDb.rules.findIndex(r => r.id === id);
      if (idx !== -1) {
        localMemoryDb.rules[idx] = { ...localMemoryDb.rules[idx], ...payload };
      }
      return res.json({ success: true, rule: localMemoryDb.rules[idx] || payload });
    }
  } catch (err) {
    console.error('[DATABASE ERROR] PUT /api/rules/:id:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update rule.' });
  }
});

app.delete('/api/rules/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isSupabaseConfigured) {
      await deleteRuleFromDb(id);
    } else {
      localMemoryDb.rules = localMemoryDb.rules.filter(r => r.id !== id);
    }
    res.json({ success: true, message: "Rule deleted successfully" });
  } catch (err) {
    console.error('[DATABASE ERROR] DELETE /api/rules/:id:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete rule.' });
  }
});

// Tournament Bracket Endpoints
app.get('/api/bracket', async (req, res) => {
  try {
    const dbBracket = await getBracketFromDb();
    const bracket = dbBracket || localMemoryDb.bracket;
    const teams = (await getTeamsFromDb()) || localMemoryDb.teams || [];

    const teamMap = {};
    teams.forEach(t => {
      const key = t.registrationId || t.registrationNumber;
      teamMap[key] = {
        registrationId: key,
        teamName: t.teamName,
        teamLogo: t.teamLogo,
        teamLeader: t.teamLeader
      };
    });

    res.json({
      success: true,
      bracket,
      teamMap
    });
  } catch (err) {
    console.error('[DATABASE ERROR] GET /api/bracket:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load tournament bracket.' });
  }
});

app.post('/api/bracket/generate', requireAdmin, async (req, res) => {
  try {
    const currentBracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    if (currentBracket.isLocked) {
      return res.status(400).json({ success: false, error: "Bracket is currently LOCKED. Unlock it before regenerating." });
    }

    const teams = (await getTeamsFromDb()) || localMemoryDb.teams || [];
    const newBracket = generateKnockoutBracket(teams);

    if (isSupabaseConfigured) {
      await saveBracketToDb(newBracket);
    } else {
      localMemoryDb.bracket = newBracket;
    }

    res.json({
      success: true,
      message: `Generated Single Elimination Bracket with ${newBracket.matches.length} matches across ${newBracket.totalRounds} rounds.`,
      bracket: newBracket
    });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/generate:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate bracket.' });
  }
});

app.post('/api/bracket/publish', requireAdmin, async (req, res) => {
  try {
    const { publish } = req.body;
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    bracket.status = publish ? "PUBLISHED" : "UNPUBLISHED";

    if (isSupabaseConfigured) {
      await saveBracketToDb(bracket);
    } else {
      localMemoryDb.bracket = bracket;
    }

    res.json({
      success: true,
      message: bracket.status === "PUBLISHED" ? "LIVE TOURNAMENT BRACKET Published!" : "Bracket set to UNPUBLISHED.",
      status: bracket.status
    });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/publish:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update bracket status.' });
  }
});

app.post('/api/bracket/lock', requireAdmin, async (req, res) => {
  try {
    const { locked } = req.body;
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    bracket.isLocked = !!locked;

    if (isSupabaseConfigured) {
      await saveBracketToDb(bracket);
    } else {
      localMemoryDb.bracket = bracket;
    }

    res.json({
      success: true,
      message: bracket.isLocked ? "Bracket is now LOCKED." : "Bracket is now UNLOCKED.",
      isLocked: bracket.isLocked
    });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/lock:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update bracket lock.' });
  }
});

app.post('/api/bracket/match/update', requireAdmin, async (req, res) => {
  try {
    const { matchId, scheduledTime, status } = req.body;
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    const match = bracket.matches.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (scheduledTime) match.scheduledTime = scheduledTime;
    if (status) match.status = status;

    if (isSupabaseConfigured) {
      await saveBracketToDb(bracket);
    } else {
      localMemoryDb.bracket = bracket;
    }

    res.json({ success: true, match });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/match/update:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update match.' });
  }
});

app.post('/api/bracket/match/winner', requireAdmin, async (req, res) => {
  try {
    const { matchId, winnerId } = req.body;
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    const match = bracket.matches.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (winnerId && winnerId !== match.team1Id && winnerId !== match.team2Id) {
      return res.status(400).json({ success: false, error: "Selected winner must be one of the participating teams." });
    }

    match.winnerId = winnerId;
    match.status = winnerId ? "COMPLETED" : "UPCOMING";

    const recalculated = recalculateBracket(bracket, matchId);

    if (isSupabaseConfigured) {
      await saveBracketToDb(recalculated);
    } else {
      localMemoryDb.bracket = recalculated;
    }

    res.json({
      success: true,
      message: 'Match winner updated successfully.',
      bracket: recalculated
    });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/match/winner:', err.message);
    res.status(500).json({ success: false, error: 'Failed to set match winner.' });
  }
});

app.post('/api/bracket/match/reset', requireAdmin, async (req, res) => {
  try {
    const { matchId } = req.body;
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    const match = bracket.matches.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    match.winnerId = null;
    match.status = "UPCOMING";

    const recalculated = recalculateBracket(bracket, matchId);

    if (isSupabaseConfigured) {
      await saveBracketToDb(recalculated);
    } else {
      localMemoryDb.bracket = recalculated;
    }

    res.json({
      success: true,
      message: "Match result reset successfully.",
      bracket: recalculated
    });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/match/reset:', err.message);
    res.status(500).json({ success: false, error: 'Failed to reset match.' });
  }
});

app.post('/api/bracket/arrange', requireAdmin, async (req, res) => {
  try {
    const { matchId, team1Id, team2Id } = req.body;
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket;
    if (bracket.isLocked) {
      return res.status(400).json({ success: false, error: "Bracket is LOCKED. Cannot rearrange teams." });
    }

    const match = bracket.matches.find(m => m.id === matchId);
    if (!match || match.roundIndex !== 0) {
      return res.status(400).json({ success: false, error: "Can only arrange Round 1 matches." });
    }

    match.team1Id = team1Id || null;
    match.team2Id = team2Id || null;

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

    const recalculated = recalculateBracket(bracket, matchId);

    if (isSupabaseConfigured) {
      await saveBracketToDb(recalculated);
    } else {
      localMemoryDb.bracket = recalculated;
    }

    res.json({ success: true, message: "Matchup arranged successfully", bracket: recalculated });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/bracket/arrange:', err.message);
    res.status(500).json({ success: false, error: 'Failed to arrange match.' });
  }
});

// Live Sync Status for viewers
app.get('/api/live-sync', async (req, res) => {
  try {
    const teams = (await getTeamsFromDb()) || localMemoryDb.teams || [];
    const settings = withNormalizedRegistrationStatus((await getSettingsFromDb()) || localMemoryDb.settings || {});
    const bracket = (await getBracketFromDb()) || localMemoryDb.bracket || {};

    res.json({
      success: true,
      totalTeams: teams.length,
      maxTeams: settings.maxTeams || 30,
      registrationStatus: settings.registrationStatus,
      registrationOpen: settings.registrationStatus === 'open',
      bracketStatus: bracket.status || 'UNPUBLISHED',
      championTeamId: bracket.championTeamId || null,
      timestamp: Date.now()
    });
  } catch (e) {
    res.json({ success: true, timestamp: Date.now() });
  }
});

// Explicitly 404 all development/debug endpoints in all environments
app.all(['/api/dev/*', '/api/dev/seed-teams', '/api/dev/simulate-round', '/api/dev/timewarp', '/api/dev/reset-db', '/api/dev/db-dump'], (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// SPA Fallback for client routing
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start server if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  DS TAMIL GAMING — VORTEX CLASH 2026 SERVER ACTIVE`);
    console.log(`  Mode: ${isSupabaseConfigured ? 'Supabase Production' : 'Local Fallback'}`);
    console.log(`  Listening on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
