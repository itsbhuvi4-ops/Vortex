const { useState, useEffect, useRef, useMemo } = React;

// Fallback Defaults for Instant & Resilient Rendering
const DEFAULT_SETTINGS = {
  tournamentName: "DS TAMIL GAMING — VORTEX CLASH 2026",
  conductedBy: "DS TAMIL GAMING",
  posterUrl: "/hero-poster.jpg",
  description: "Welcome to the ultimate esports showdown! DS TAMIL GAMING presents VORTEX CLASH 2026 — the pinnacle of competitive battleground gaming. Assemble your squad, dominate the arena, and claim the championship glory.",
  registrationFee: "₹100",
  maxTeams: 30,
  registrationOpen: true,
  registrationStatus: "open",
  tournamentDate: "2026-09-06",
  tournamentStartTime: "18:00",
  paymentQrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=dstamilgaming@upi&pn=DSTamilGaming&am=100&cu=INR&tn=VORTEX_CLASH_2026",
  paymentInstructions: "1. Scan the QR code using GPay, PhonePe, or Paytm.\n2. Pay the registration fee of ₹100.\n3. Take a clear screenshot of the successful transaction.\n4. Upload the payment screenshot in the registration form below.",
  whatsappLink: "https://chat.whatsapp.com/invite/VortexClash2026",
  discordLink: "https://discord.gg/vortexclash2026",
  importantDates: "Registration Closes: 05 September 2026 | Bracket Announcement: 05 September 2026, 9:00 PM | Tournament Kickoff: 06 September 2026, 6:00 PM",
  instructions: "All team leaders must join the official WhatsApp and Discord communities. Teams must be ready in the custom room 15 minutes prior to match schedule. Fair play and sportsmanship are strictly enforced."
};

const VALID_REGISTRATION_STATUSES = new Set(['open', 'closed', 'coming_soon']);
const REGISTRATION_STATUS_LABELS = {
  open: 'REGISTRATION OPEN',
  closed: 'REGISTRATION CLOSED',
  coming_soon: 'REGISTRATION COMING SOON'
};

function normalizeRegistrationStatus(settings = {}) {
  if (settings && VALID_REGISTRATION_STATUSES.has(settings.registrationStatus)) return settings.registrationStatus;
  if (settings && settings.registrationOpen === false) return 'closed';
  return 'open';
}

function normalizeSettingsPayload(settings = {}) {
  const normalizedStatus = normalizeRegistrationStatus(settings);
  return {
    ...settings,
    registrationStatus: normalizedStatus,
    registrationOpen: normalizedStatus === 'open'
  };
}

function getRegistrationStatusText(settings = DEFAULT_SETTINGS) {
  return REGISTRATION_STATUS_LABELS[normalizeRegistrationStatus(settings)] || 'REGISTRATION OPEN';
}

const DEFAULT_SPONSORS = [
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
    profileLink: "#",
    orderIndex: 3
  }
];

const DEFAULT_RULES = [
  { id: "r-1", category: "Tournament Rules", title: "No Roof", content: "NO ROOF", orderIndex: 1 },
  { id: "r-2", category: "Tournament Rules", title: "No PC", content: "NO PC", orderIndex: 2 },
  { id: "r-3", category: "Tournament Rules", title: "No Panel", content: "NO PANEL", orderIndex: 3 },
  { id: "r-4", category: "Tournament Rules", title: "No Wall Break", content: "NO WALL BREAK", orderIndex: 4 },
  { id: "r-5", category: "Tournament Rules", title: "No Team Change", content: "NO TEAM CHANGE", orderIndex: 5 },
  { id: "r-6", category: "Tournament Rules", title: "Only Face to Face", content: "ONLY FACE TO FACE", orderIndex: 6 },
  { id: "r-7", category: "Tournament Rules", title: "No Zone Break", content: "NO ZONE BREAK", orderIndex: 7 }
];

// Reusable Fetch Helper with Timeout & AbortController (TASK 1)
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { credentials: 'same-origin', ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.warn(`[Timeout] Request to ${url} aborted after ${timeout}ms`);
    } else {
      console.warn(`[Fetch Error] Request to ${url} failed:`, err.message || err);
    }
    throw err;
  }
}

// Helper: Calculate Countdown
function calculateTimeLeft(targetIso) {
  if (!targetIso) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const diff = new Date(targetIso).getTime() - new Date().getTime();
  if (diff <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { total: diff, days, hours, minutes, seconds };
}

function getTournamentStartIso(settings = DEFAULT_SETTINGS) {
  const dateText = settings.tournamentDate || DEFAULT_SETTINGS.tournamentDate;
  const timeText = settings.tournamentStartTime || DEFAULT_SETTINGS.tournamentStartTime;
  if (!dateText || !timeText) return null;
  const isoCandidate = `${dateText}T${timeText}:00`;
  const isoDate = new Date(isoCandidate);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate.toISOString();
}

function formatRegistrationId(sequenceNumber) {
  return `VORTEX${String(Number(sequenceNumber || 1)).padStart(3, '0')}`;
}

function CountdownDisplay({ settings }) {
  const targetIso = getTournamentStartIso(settings);
  const [timeLeft, setTimeLeft] = useState(targetIso ? calculateTimeLeft(targetIso) : { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!targetIso) return undefined;
    const update = () => setTimeLeft(calculateTimeLeft(targetIso));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);

  if (!targetIso) {
    return null;
  }

  const hasStarted = timeLeft.total <= 0;
  const pad = (n) => String(n).padStart(2, '0');

  const Colon = () => (
    <div className="hidden sm:flex flex-col items-center justify-center gap-2" style={{height: 'clamp(2rem, 8vw, 4.75rem)'}}>
      <span className="block w-1 h-1 rounded-full" style={{background:'#b8956a'}}></span>
      <span className="block w-1 h-1 rounded-full" style={{background:'#b8956a'}}></span>
    </div>
  );

  const Digit = ({ value, label }) => (
    <div className="flex flex-col items-center">
      <div className="genesis-countdown-digit" style={{fontSize: 'clamp(2rem, 8vw, 4.75rem)', lineHeight: 1.05, minWidth: '2ch', textAlign: 'center'}}>
        {pad(value)}
      </div>
      <span className="genesis-countdown-label mt-2 sm:mt-3">{label}</span>
    </div>
  );

  return (
    <div className="genesis-fade-up genesis-fade-up-4">
      {!hasStarted ? (
        <div className="flex items-start justify-center gap-4 sm:gap-6 lg:gap-9">
          <Digit value={timeLeft.days} label="Days" />
          <Colon />
          <Digit value={timeLeft.hours} label="Hours" />
          <Colon />
          <Digit value={timeLeft.minutes} label="Minutes" />
          <Colon />
          <Digit value={timeLeft.seconds} label="Seconds" />
        </div>
      ) : (
        <div className="text-center">
          <div className="genesis-countdown-digit" style={{fontSize: 'clamp(1.5rem, 5vw, 3rem)'}}>LIVE NOW</div>
          <span className="genesis-countdown-label mt-2 block">Tournament Started</span>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// MAIN APP COMPONENT
// =========================================================================
function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState([]);
  const [sponsors, setSponsors] = useState(DEFAULT_SPONSORS);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [bracketData, setBracketData] = useState(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [adminLoginModal, setAdminLoginModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Hi! I can guide you through registration, rules, sponsors, payment, and tournament updates.'
    }
  ]);
  const [chatInput, setChatInput] = useState('');

  const showToast = (msg, type = 'info') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Parallelized API Requests with Timeout and Fallbacks (TASK 9)
  const fetchData = async () => {
    try {
      const results = await Promise.allSettled([
        fetchWithTimeout('/api/settings', {}, 8000).then(r => r.ok ? r.json() : null),
        fetchWithTimeout('/api/teams', {}, 8000).then(r => r.ok ? r.json() : null),
        fetchWithTimeout('/api/sponsors', {}, 8000).then(r => r.ok ? r.json() : null),
        fetchWithTimeout('/api/rules', {}, 8000).then(r => r.ok ? r.json() : null),
        fetchWithTimeout('/api/bracket', {}, 8000).then(r => r.ok ? r.json() : null)
      ]);

      const [sRes, tRes, spRes, rRes, bRes] = results;

      if (sRes.status === 'fulfilled' && sRes.value?.success && sRes.value?.settings) {
        setSettings(normalizeSettingsPayload(sRes.value.settings));
      }
      if (tRes.status === 'fulfilled' && tRes.value?.success && tRes.value?.teams) {
        setTeams(tRes.value.teams);
      }
      if (spRes.status === 'fulfilled' && spRes.value?.success && spRes.value?.sponsors) {
        setSponsors(spRes.value.sponsors);
      }
      if (rRes.status === 'fulfilled' && rRes.value?.success && rRes.value?.rules) {
        setRules(rRes.value.rules);
      }
      if (bRes.status === 'fulfilled' && bRes.value?.success) {
        setBracketData(bRes.value);
      }
    } catch (err) {
      console.warn("Non-blocking data fetch notice:", err.message || err);
    }
  };

  const refreshUserState = async () => {
    try {
      const results = await Promise.allSettled([
        fetchWithTimeout('/api/auth/me', {}, 6000).then(r => r.ok ? r.json() : null),
        fetchWithTimeout('/api/my-team', {}, 6000).then(r => r.ok ? r.json() : null)
      ]);

      const [meRes, teamRes] = results;

      if (meRes.status === 'fulfilled' && meRes.value?.success && meRes.value?.user) {
        setAuthUser(meRes.value.user);
        if (meRes.value.user.role === 'admin') {
          setIsAdminLoggedIn(true);
        }
      } else {
        setAuthUser(null);
      }

      if (teamRes.status === 'fulfilled' && teamRes.value?.success && teamRes.value?.team) {
        setMyTeam(teamRes.value.team);
      } else {
        setMyTeam(null);
      }
    } catch {
      setAuthUser(null);
      setMyTeam(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let realtimeChannel = null;

    // Hard upper bound: loading screen MUST disappear after at most 4 seconds (TASK 8)
    const maxLoadingTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 4000);

    const initRealtime = async () => {
      try {
        const configRes = await fetchWithTimeout('/api/config', {}, 5000).then(r => r.ok ? r.json() : null);
        if (configRes?.success && configRes.supabaseUrl && configRes.supabaseAnonKey && window.supabase) {
          const supabaseClient = window.supabase.createClient(configRes.supabaseUrl, configRes.supabaseAnonKey);
          realtimeChannel = supabaseClient.channel('vortex-realtime-public')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
              if (isMounted) {
                fetchWithTimeout('/api/teams', {}, 5000).then(r => r.ok ? r.json() : null).then(t => { if (t?.success && isMounted) setTeams(t.teams); }).catch(() => {});
                refreshUserState();
              }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
              if (isMounted) {
                fetchWithTimeout('/api/bracket', {}, 5000).then(r => r.ok ? r.json() : null).then(b => { if (b?.success && isMounted) setBracketData(b); }).catch(() => {});
              }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_settings' }, () => {
              if (isMounted) {
                fetchWithTimeout('/api/settings', {}, 5000).then(r => r.ok ? r.json() : null).then(s => { if (s?.success && s.settings && isMounted) setSettings(normalizeSettingsPayload(s.settings)); }).catch(() => {});
                fetchWithTimeout('/api/bracket', {}, 5000).then(r => r.ok ? r.json() : null).then(b => { if (b?.success && isMounted) setBracketData(b); }).catch(() => {});
              }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rules' }, () => {
              if (isMounted) {
                fetchWithTimeout('/api/rules', {}, 5000).then(r => r.ok ? r.json() : null).then(r => { if (r?.success && isMounted) setRules(r.rules); }).catch(() => {});
              }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsors' }, () => {
              if (isMounted) {
                fetchWithTimeout('/api/sponsors', {}, 5000).then(r => r.ok ? r.json() : null).then(sp => { if (sp?.success && isMounted) setSponsors(sp.sponsors); }).catch(() => {});
              }
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                console.log('[REALTIME] Supabase live stream connected successfully');
              }
            });
        }
      } catch (err) {
        console.warn('[REALTIME] Notice:', err.message || err);
      }
    };

    const bootstrap = async () => {
      try {
        await Promise.allSettled([
          fetchData(),
          refreshUserState(),
          initRealtime()
        ]);
      } catch (err) {
        console.warn("Bootstrap non-blocking notice:", err);
      } finally {
        if (isMounted) {
          clearTimeout(maxLoadingTimer);
          setLoading(false);
        }
      }
    };

    bootstrap();

    // Single background sync loop: refresh the live settings and current public data without excessive polling.
    const interval = setInterval(() => {
      if (!isMounted) return;
      fetchData();
    }, 20000);

    return () => {
      isMounted = false;
      clearTimeout(maxLoadingTimer);
      clearInterval(interval);
      if (realtimeChannel && window.supabase) {
        try { realtimeChannel.unsubscribe(); } catch (e) {}
      }
    };
  }, []);

  useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  });

  const totalRegistered = teams.length;
  const currentSettings = normalizeSettingsPayload(settings || DEFAULT_SETTINGS);
  const registrationStatus = normalizeRegistrationStatus(currentSettings);
  const maxCapacity = currentSettings ? currentSettings.maxTeams : 30;
  const isRegistrationOpen = registrationStatus === 'open';
  const isRegistrationFull = totalRegistered >= maxCapacity || !isRegistrationOpen;
  const hasExistingRegistration = !!myTeam;

  const handleChatSubmit = (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage = { id: Date.now(), type: 'user', text: trimmed };
    const reply = getChatReply(trimmed, { settings: currentSettings, sponsors, rules });

    setChatMessages(prev => [...prev, userMessage, { id: Date.now() + 1, type: 'bot', text: reply }]);
    setChatInput('');
  };

  // Only show loading screen during initial loading phase; never permanently blocked
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{background:'#040a11'}}>
        {/* Starfield behind loader */}
        <div style={{position:'fixed',inset:0,opacity:0.9,pointerEvents:'none',
          backgroundImage: 'radial-gradient(1px 1px at 17% 23%, rgba(251,238,203,0.75), transparent 60%), radial-gradient(1.6px 1.6px at 71% 58%, rgba(251,238,203,0.65), transparent 62%), radial-gradient(2.4px 2.4px at 41% 27%, rgba(251,238,203,0.85), transparent 64%), radial-gradient(1px 1px at 62% 11%, rgba(251,238,203,0.55), transparent 60%), radial-gradient(1.6px 1.6px at 28% 18%, rgba(244,196,106,0.70), transparent 62%)',
          backgroundSize: '180px 180px, 330px 330px, 710px 710px, 180px 180px, 330px 330px',
          backgroundRepeat: 'repeat'
        }}></div>
        {/* Top glow */}
        <div style={{position:'fixed',inset:'0',pointerEvents:'none',
          background:'radial-gradient(ellipse 75% 55% at 50% 0%, rgba(226,167,67,0.18) 0%, rgba(226,167,67,0.04) 45%, transparent 72%)'
        }}></div>
        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Genesis title */}
          <div className="genesis-loader-title text-center">
            <div className="relative">
              <span className="absolute inset-0 select-none pointer-events-none" style={{color:'rgba(226,167,67,0.25)', filter:'blur(0.35em)', fontFamily:'Orbitron, sans-serif', fontWeight:900, fontSize:'clamp(2rem, 8vw, 4.5rem)', lineHeight:0.9, textTransform:'uppercase'}}>VORTEX<span style={{marginLeft:'0.06em', fontSize:'0.42em', verticalAlign:'super'}}>2026</span></span>
              <span className="relative genesis-gradient-text" style={{fontFamily:'Orbitron, sans-serif', fontWeight:900, fontSize:'clamp(2rem, 8vw, 4.5rem)', lineHeight:0.9, textTransform:'uppercase', display:'block'}}>VORTEX<span style={{marginLeft:'0.06em', fontSize:'0.42em', verticalAlign:'super'}}>2026</span></span>
            </div>
          </div>
          {/* Subtitle */}
          <div className="genesis-loader-subtitle" style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.34em', color:'#f4c46a'}}>DS TAMIL GAMING — CLASH EDITION</div>
          {/* Gold line */}
          <div className="genesis-loader-line" style={{width:'160px', height:'1px', background:'linear-gradient(to right, transparent, #e2a743, transparent)'}}></div>
          {/* Bouncing dots */}
          <div className="genesis-loader-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-neutral-200 relative" style={{background:'#040a11'}}>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 border bg-neutral-900/95 backdrop-blur-md shadow-2xl flex items-center gap-3 text-xs text-white" style={{borderColor:'rgba(244,198,106,0.25)', borderRadius:'2px'}}>
          <div className={`w-2 h-2 rounded-full ${toastMessage.type === 'error' ? 'bg-rose-500' : 'bg-supabase'}`}></div>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Genesis-style Navbar */}
      <header className="sticky top-0 z-40 border-b" style={{borderColor:'rgba(244,198,106,0.24)', background:'rgba(4,10,17,0.92)', backdropFilter:'blur(14px)'}}>
        <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between relative">
          
          {/* Logo */}
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 cursor-pointer group relative z-10"
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-supabase border transition-colors duration-300" style={{background:'rgba(226,167,67,0.08)', borderColor:'rgba(226,167,67,0.30)'}}>
              <i data-lucide="zap" className="w-4 h-4"></i>
            </div>
            <div>
              <div style={{fontFamily:'Share Tech Mono, monospace', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.28em', color:'#e2a743'}}>DS TAMIL GAMING</div>
              <div style={{fontFamily:'Orbitron, sans-serif', fontSize:'13px', fontWeight:800, color:'#fff', letterSpacing:'0.02em'}}>VORTEX CLASH</div>
            </div>
          </div>

          {/* Desktop Nav — Genesis mono links */}
          <div className="hidden lg:flex items-center absolute inset-x-0 justify-center px-5 sm:px-8 pointer-events-none">
            <ul className="flex items-center gap-4 lg:gap-7 pointer-events-auto">
              {[
                { id: 'home', label: 'Home' },
                { id: 'tournament', label: 'Tournament' },
                { id: 'bracket', label: 'Bracket' },
              ].map(tab => (
                <li key={tab.id}>
                  <button onClick={() => setActiveTab(tab.id)} className={`genesis-nav-link ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
                </li>
              ))}
            </ul>

            {/* Center pill — Register */}
            <button
              onClick={() => setActiveTab('register')}
              className={`mx-4 lg:mx-7 pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-1.5 transition-colors duration-300 ${activeTab === 'register' ? 'genesis-active-pill' : ''}`}
              style={activeTab === 'register' ? {} : {fontFamily:'Share Tech Mono, monospace', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.24em', borderColor:'rgba(226,167,67,0.50)', color:'#e2a743', background:'rgba(226,167,67,0.06)'}}
            >
              <span className="block w-1.5 h-1.5 rounded-full shrink-0" style={{background: activeTab === 'register' ? 'rgba(0,0,0,0.70)' : '#e2a743'}}></span>
              <span className="whitespace-nowrap">Register</span>
            </button>

            <ul className="flex items-center gap-4 lg:gap-7 pointer-events-auto">
              {[
                { id: 'sponsors', label: 'Sponsors' },
                { id: 'rules', label: 'Rules' },
              ].map(tab => (
                <li key={tab.id}>
                  <button onClick={() => setActiveTab(tab.id)} className={`genesis-nav-link ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Right actions */}
          <div className="hidden lg:flex items-center gap-3 relative z-10">
            <button
              onClick={() => {
                if (isAdminLoggedIn) setActiveTab('admin');
                else setAdminLoginModal(true);
              }}
              className="rounded-full border px-5 py-2 transition-colors hover:bg-supabase hover:text-black"
              style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.24em', borderColor:'rgba(226,167,67,0.60)', color:'#fff'}}
            >
              Admin
            </button>
          </div>

          {/* Mobile menu toggle */}
          <div className="lg:hidden relative z-10">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 flex-col items-center justify-center gap-[5px]"
              aria-label="Open menu"
            >
              <span className="block h-px w-6 bg-white"></span>
              <span className="block h-px w-6 bg-white"></span>
            </button>
          </div>

        </nav>
        {/* Gold progress line under nav on mobile */}
        <span className="block h-px origin-left lg:hidden" style={{background:'rgba(226,167,67,0.80)', transform: mobileMenuOpen ? 'scaleX(1)' : 'scaleX(0)', transition:'transform 0.3s'}}></span>
      </header>

      {/* Mobile Drawer — Genesis style */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b px-5 py-5 space-y-2" style={{background:'rgba(4,10,17,0.98)', borderColor:'rgba(244,198,106,0.24)'}}>
          {['home', 'tournament', 'bracket', 'sponsors', 'rules', 'register'].map(id => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 uppercase"
              style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', letterSpacing:'0.24em', color: activeTab === id ? '#fbeecb' : '#a1a1aa', borderBottom:'1px solid rgba(244,198,106,0.12)'}}
            >
              {id}
            </button>
          ))}
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              if (isAdminLoggedIn) setActiveTab('admin');
              else setAdminLoginModal(true);
            }}
            className="w-full text-left px-3 py-2.5 uppercase mt-2"
            style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', letterSpacing:'0.24em', color:'#e2a743', background:'rgba(226,167,67,0.06)', border:'1px solid rgba(226,167,67,0.25)'}}
          >
            Admin Panel
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-8 relative z-10">
        {activeTab === 'home' && (
          <HomePage
            settings={settings}
            teams={teams}
            totalRegistered={totalRegistered}
            maxCapacity={maxCapacity}
            isRegistrationFull={isRegistrationFull}
            sponsors={sponsors}
            rules={rules}
            setActiveTab={setActiveTab}
            hasExistingRegistration={hasExistingRegistration}
          />
        )}

        {activeTab === 'tournament' && (
          <TournamentPage
            settings={settings}
            totalRegistered={totalRegistered}
            maxCapacity={maxCapacity}
            isRegistrationFull={isRegistrationFull}
            setActiveTab={setActiveTab}
            hasExistingRegistration={hasExistingRegistration}
          />
        )}

        {activeTab === 'bracket' && (
          <BracketPage bracketData={bracketData} setActiveTab={setActiveTab} />
        )}

        {activeTab === 'sponsors' && <SponsorsPage sponsors={sponsors} />}

        {activeTab === 'rules' && <RulesPage rules={rules} setActiveTab={setActiveTab} />}

        {activeTab === 'register' && (
          <RegisterPage
            settings={settings}
            sponsors={sponsors}
            rules={rules}
            totalRegistered={totalRegistered}
            maxCapacity={maxCapacity}
            isRegistrationFull={isRegistrationFull}
            showToast={showToast}
            onRegisterSuccess={async () => {
              await fetchData();
              await refreshUserState();
            }}
            hasExistingRegistration={hasExistingRegistration}
            authUser={authUser}
            onAuthChange={setAuthUser}
            myTeam={myTeam}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            settings={settings}
            teams={teams}
            sponsors={sponsors}
            rules={rules}
            bracketData={bracketData}
            showToast={showToast}
            fetchData={fetchData}
            onLogout={() => {
              setIsAdminLoggedIn(false);
              setActiveTab('home');
              showToast("Admin session ended", "info");
            }}
          />
        )}
      </main>

      {/* Footer */}
      <Footer settings={settings} setActiveTab={setActiveTab} onOpenAdmin={() => setAdminLoginModal(true)} />

      {/* Admin Login Modal */}
      {adminLoginModal && (
        <AdminLoginModal
          onClose={() => setAdminLoginModal(false)}
          onSuccess={() => {
            setIsAdminLoggedIn(true);
            setAdminLoginModal(false);
            setActiveTab('admin');
            showToast("Admin panel unlocked", "success");
          }}
          showToast={showToast}
        />
      )}

      {/* Chat widget — gold-themed */}
      <div className="fixed bottom-4 right-4 z-40">
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="px-4 py-2.5 rounded-full font-semibold shadow-2xl transition-colors flex items-center gap-2 text-xs"
            style={{background:'#e2a743', color:'#11151c'}}
          >
            <i data-lucide="message-circle" className="w-4 h-4"></i>
            Ask Vortex Bot
          </button>
        ) : (
          <div className="w-[340px] max-w-[90vw] overflow-hidden shadow-2xl backdrop-blur-md" style={{borderRadius:'2px', border:'1px solid rgba(244,198,106,0.30)', background:'rgba(4,10,17,0.97)'}}>
            <div className="flex items-center justify-between px-3 py-2.5" style={{borderBottom:'1px solid rgba(244,198,106,0.20)', background:'rgba(10,15,24,0.80)'}}>
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{background:'rgba(226,167,67,0.12)', border:'1px solid rgba(226,167,67,0.30)'}}>
                  <i data-lucide="bot" className="w-3.5 h-3.5" style={{color:'#e2a743'}}></i>
                </div>
                Vortex Guide
              </div>
              <button onClick={() => setChatOpen(false)} className="text-neutral-400 hover:text-white">
                <i data-lucide="x" className="w-4 h-4"></i>
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto px-3 py-3 space-y-3" style={{background:'#060c14'}}>
              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 text-xs leading-relaxed ${msg.type === 'user' ? 'text-black' : 'text-neutral-100'}`}
                    style={msg.type === 'user' ? {background:'#e2a743', borderRadius:'2px'} : {background:'rgba(10,15,24,0.86)', border:'1px solid rgba(244,198,106,0.20)', borderRadius:'2px'}}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2.5" style={{borderTop:'1px solid rgba(244,198,106,0.20)', background:'rgba(10,15,24,0.90)'}}>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {['Rules', 'Sponsors', 'Register', 'Payment'].map(label => (
                  <button
                    key={label}
                    onClick={() => setChatInput(label)}
                    className="px-2 py-1 text-[10px] text-neutral-200"
                    style={{border:'1px solid rgba(244,198,106,0.20)', background:'rgba(226,167,67,0.06)', borderRadius:'2px'}}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about rules, fees, or sponsors..."
                  className="flex-1 px-2.5 py-2 text-xs text-white placeholder:text-neutral-500 outline-none"
                  style={{background:'rgba(3,7,13,0.72)', border:'1px solid rgba(244,198,106,0.20)', borderRadius:'2px'}}
                />
                <button type="submit" className="px-3 py-2 text-xs font-semibold" style={{background:'#e2a743', color:'#11151c', borderRadius:'2px'}}>
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// =========================================================================
// 1. HOME PAGE COMPONENT
// =========================================================================
function HomePage({ settings, teams, totalRegistered, maxCapacity, isRegistrationFull, sponsors, rules, setActiveTab, hasExistingRegistration }) {
  const registrationStatus = normalizeRegistrationStatus(settings || DEFAULT_SETTINGS);
  const statusText = getRegistrationStatusText(settings || DEFAULT_SETTINGS);
  const registrationDisabled = registrationStatus !== 'open';

  return (
    <div className="space-y-0">
      
      {/* Genesis Hero — Full-width cinematic */}
      <section className="relative flex min-h-[80vh] w-full flex-col items-center justify-center px-6 pb-8 pt-16 text-center sm:px-8" style={{marginTop:'-2rem'}}>
        <div className="flex w-full max-w-6xl flex-col items-center">
          {/* Label */}
          <div className="genesis-fade-up genesis-fade-up-1">
            <span className="genesis-section-label">
              <span className="line"></span>
              <span>{registrationStatus === 'open' ? 'Registration Open' : statusText}</span>
              <span> — Edition 03</span>
            </span>
          </div>

          {/* Hero Title with glow */}
          <div className="mt-8 genesis-fade-up genesis-fade-up-2">
            <h1 className="relative" style={{fontSize:'clamp(2.5rem, min(13vw, 17vh), 9rem)', lineHeight:0.85, fontFamily:'Orbitron, sans-serif', fontWeight:900, textTransform:'uppercase', letterSpacing:'-0.02em'}}>
              {/* Glow duplicate */}
              <span className="pointer-events-none absolute inset-0 select-none" style={{color:'rgba(226,167,67,0.25)', filter:'blur(0.35em)'}} aria-hidden="true">VORTEX<span style={{marginLeft:'0.06em', fontSize:'0.42em', verticalAlign:'super', letterSpacing:'0.02em'}}>'26</span></span>
              {/* Visible gradient text */}
              <span className="relative genesis-gradient-text">VORTEX<span style={{marginLeft:'0.06em', fontSize:'0.42em', verticalAlign:'super', letterSpacing:'0.02em'}}>'26</span></span>
            </h1>
          </div>

          {/* Date */}
          <p className="mt-4 genesis-fade-up genesis-fade-up-3" style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.34em', color:'#f4c46a'}}>
            {settings.tournamentDate ? new Date(settings.tournamentDate + 'T00:00:00').toLocaleDateString('en-US', {day:'numeric', month:'long', year:'numeric'}) : '6 September 2026'}
          </p>

          {/* Gold divider */}
          <span className="genesis-gold-line mt-6 block h-px w-40" style={{background:'linear-gradient(to right, transparent, #e2a743, transparent)'}}></span>

          {/* Countdown */}
          <div className="mt-8">
            <CountdownDisplay settings={settings} />
          </div>

          {/* Info grid */}
          <div className="genesis-info-grid mt-10 w-full max-w-3xl genesis-fade-up genesis-fade-up-5">
            <div>
              <dt className="genesis-info-label">Date</dt>
              <dd className="genesis-info-value">{settings.tournamentDate ? new Date(settings.tournamentDate + 'T00:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : '06 Sep 2026'}</dd>
            </div>
            <div>
              <dt className="genesis-info-label">Hosted by</dt>
              <dd className="genesis-info-value">{settings.conductedBy || 'DS Tamil Gaming'}</dd>
            </div>
            <div>
              <dt className="genesis-info-label">Entry Fee</dt>
              <dd className="genesis-info-value">{settings.registrationFee || '₹100'}</dd>
            </div>
            <div>
              <dt className="genesis-info-label">Registration</dt>
              <dd className="genesis-info-value">
                <button onClick={() => setActiveTab('register')} className="group inline-flex items-center gap-2 transition-colors" style={{color:'#f4c46a'}}>
                  {registrationStatus === 'open' ? 'Now Open' : statusText}
                  <span className="transition-transform duration-300 group-hover:translate-y-0.5" aria-hidden="true">↓</span>
                </button>
              </dd>
            </div>
          </div>
        </div>
      </section>

      {/* Scrolling Marquee Ticker */}
      <div className="genesis-marquee-container relative z-10">
        <div className="genesis-marquee-track">
          {[1, 2].map(set => (
            <div key={set} className="flex items-center shrink-0">
              {[
                settings.tournamentName || 'Vortex Clash 2026',
                settings.tournamentDate ? new Date(settings.tournamentDate + 'T00:00:00').toLocaleDateString('en-US', {day:'numeric', month:'long'}) : '6 September',
                `${maxCapacity} Teams`,
                'Single Elimination',
                settings.conductedBy || 'DS Tamil Gaming',
                registrationStatus === 'open' ? 'Registration Open' : statusText,
              ].map((text, i) => (
                <span key={i} className="flex items-center">
                  <span className="genesis-marquee-item">{text}</span>
                  <span className="genesis-marquee-diamond"></span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* About + Poster Section */}
      <section className="relative z-10 px-0 py-16 sm:py-20">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          {/* Poster */}
          <div className="order-2 lg:order-1 genesis-fade-up genesis-fade-up-3">
            <div className="group relative genesis-corners p-2 sm:p-3" style={{border:'1px solid rgba(184,149,106,0.55)', background:'rgba(10,15,24,0.40)'}}>
              <img
                src={settings.posterUrl || '/hero-poster.jpg'}
                alt="VORTEX CLASH Official Poster"
                className="w-full h-auto transition-transform duration-700 group-hover:scale-[1.02]"
                style={{borderRadius:'0'}}
              />
            </div>
            <div className="mt-6">
              <span className="genesis-section-label"><span className="line"></span>Presented by</span>
              <p className="mt-3 uppercase leading-relaxed" style={{fontFamily:'Poppins, sans-serif', fontSize:'11px', letterSpacing:'0.12em', color:'#71717a'}}>{settings.conductedBy || 'DS Tamil Gaming'}</p>
            </div>
          </div>

          {/* Description */}
          <div className="order-1 lg:order-2">
            <div className="genesis-fade-up genesis-fade-up-1">
              <span className="genesis-section-label"><span className="line"></span>About the Tournament</span>
            </div>
            <h2 className="mt-6 genesis-fade-up genesis-fade-up-2" style={{fontSize:'clamp(1.6rem, 5vw, 2.75rem)', lineHeight:1.05, fontFamily:'Orbitron, sans-serif', fontWeight:900, textTransform:'uppercase', letterSpacing:'-0.01em', color:'#fff'}}>
              One arena, <span style={{color:'#e2a743'}}>total domination</span>
            </h2>
            <p className="mt-7 max-w-2xl text-base leading-relaxed sm:text-lg sm:leading-[1.8] genesis-fade-up genesis-fade-up-3" style={{color:'#d4d4d8'}}>
              {settings.description}
            </p>

            {/* Registration Metric */}
            <div className="mt-8 p-5 max-w-md genesis-fade-up genesis-fade-up-4" style={{borderLeft:'2px solid rgba(226,167,67,0.60)', paddingLeft:'20px'}}>
              <div className="flex justify-between text-xs font-mono">
                <span style={{color:'#71717a'}}>Slots Claimed</span>
                <span style={{color: isRegistrationFull ? '#f87171' : '#e2a743'}}>
                  {isRegistrationFull ? 'Registration Full' : `${totalRegistered} of ${maxCapacity} Teams`}
                </span>
              </div>
              <div className="w-full h-1.5 mt-3 overflow-hidden" style={{background:'rgba(255,255,255,0.06)', borderRadius:'1px'}}>
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalRegistered / maxCapacity) * 100)}%`, background: isRegistrationFull ? '#c2381a' : 'linear-gradient(to right, #e2a743, #fbeecb)', borderRadius:'1px' }}
                ></div>
              </div>
            </div>

            {/* CTAs */}
            <div className="mt-11 flex flex-col gap-4 sm:flex-row sm:items-center genesis-fade-up genesis-fade-up-5">
              <button
                disabled={registrationDisabled || isRegistrationFull}
                onClick={() => setActiveTab('register')}
                className={`group inline-flex items-center gap-3 px-5 py-3 text-xs font-semibold transition-all duration-300 ${
                  registrationDisabled || isRegistrationFull
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:bg-supabase hover:text-black'
                }`}
                style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.24em', border:'1px solid rgba(226,167,67,0.70)', background:'rgba(226,167,67,0.10)', color:'#fbeecb'}}
              >
                {registrationStatus === 'closed' ? 'Registration Closed' : registrationStatus === 'coming_soon' ? 'Coming Soon' : 'Register Squad'}
                <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
              </button>

              <button
                onClick={() => setActiveTab('bracket')}
                className="group inline-flex items-center gap-3 px-1 py-3 transition-colors"
                style={{fontFamily:'Share Tech Mono, monospace', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.24em', color:'#71717a'}}
              >
                <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
                View Bracket
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Specs */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Max Teams', val: `${maxCapacity} Squads`, icon: 'shield' },
          { label: 'Entry Fee', val: settings.registrationFee, icon: 'tag' },
          { label: 'Structure', val: 'Single Elimination', icon: 'git-merge' },
          { label: 'Stream', val: 'DS Tamil Gaming', icon: 'radio' }
        ].map((item, i) => (
          <div key={i} className="supabase-card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-supabase">
              <i data-lucide={item.icon} className="w-4 h-4"></i>
            </div>
            <div>
              <div className="text-[11px] text-neutral-400 font-mono">{item.label}</div>
              <div className="text-sm font-bold text-white">{item.val}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Registered Squads Preview */}
      <section className="space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">Registered Squads</h2>
            <p className="text-xs text-neutral-400">Teams confirmed in the tournament bracket</p>
          </div>
          <button
            onClick={() => setActiveTab('register')}
            disabled={hasExistingRegistration}
            className={`text-xs flex items-center gap-1 ${hasExistingRegistration ? 'text-neutral-500 cursor-not-allowed' : 'text-supabase hover:underline'}`}
          >
            <span>{hasExistingRegistration ? 'Already Registered' : 'Register Now'}</span>
            <i data-lucide="chevron-right" className="w-3.5 h-3.5"></i>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {teams.slice(0, 8).map(team => (
            <div key={team.registrationId} className="supabase-card p-4 flex items-center gap-3">
              <img src={team.teamLogo} alt="" className="w-10 h-10 rounded-lg object-cover border border-neutral-800" />
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">{team.teamName}</div>
                <div className="text-[11px] text-neutral-400 font-mono">{team.registrationId}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sponsors Preview */}
      <section className="space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">Tournament Sponsors</h2>
            <p className="text-xs text-neutral-400">Official partners of VORTEX CLASH 2026</p>
          </div>
          <button onClick={() => setActiveTab('sponsors')} className="text-xs text-supabase hover:underline">
            View All
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {sponsors.slice(0, 3).map(sp => (
            <div key={sp.id} className="supabase-card p-5 space-y-3">
              <div className="h-24 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center p-3">
                <img src={sp.logoUrl} alt="" className="max-h-full object-contain" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-supabase">{sp.role}</span>
                <h3 className="text-sm font-bold text-white mt-0.5">{sp.name}</h3>
                <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{sp.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

// =========================================================================
// 2. TOURNAMENT PAGE
// =========================================================================
function TournamentPage({ settings, totalRegistered, maxCapacity, isRegistrationFull, setActiveTab, hasExistingRegistration }) {
  const registrationStatus = normalizeRegistrationStatus(settings || DEFAULT_SETTINGS);
  const statusText = getRegistrationStatusText(settings || DEFAULT_SETTINGS);
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{settings.tournamentName}</h1>
        <p className="text-xs font-mono text-neutral-400">Conducted by {settings.conductedBy}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
            <img src={settings.posterUrl} alt="" className="w-full h-auto object-cover" />
          </div>
          <div className="supabase-card p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-400">Entry Fee</span>
              <span className="font-semibold text-white">{settings.registrationFee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Capacity</span>
              <span className="font-semibold text-white">{maxCapacity} Teams</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Status</span>
              <span className={registrationStatus === 'open' ? 'text-supabase' : registrationStatus === 'coming_soon' ? 'text-amber-300' : 'text-rose-400'}>
                {statusText}
              </span>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="supabase-card p-6 space-y-4 text-xs sm:text-sm text-neutral-300 leading-relaxed">
            <h3 className="text-sm font-bold text-white">About the Tournament</h3>
            <p>{settings.description}</p>
            
            <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
              <div className="text-xs font-mono text-supabase font-bold">IMPORTANT DATES</div>
              <div className="text-xs text-neutral-300">{settings.importantDates}</div>
            </div>

            <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
              <div className="text-xs font-mono text-neutral-400 font-bold">INSTRUCTIONS</div>
              <div className="text-xs text-neutral-300">{settings.instructions}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
            <a
              href={settings.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="supabase-card p-4 flex items-center justify-between hover:border-emerald-500/40"
            >
              <div className="flex items-center gap-3">
                <i data-lucide="message-circle" className="w-5 h-5 text-emerald-400"></i>
                <span>Join WhatsApp Group</span>
              </div>
              <i data-lucide="external-link" className="w-4 h-4 text-neutral-500"></i>
            </a>

            <a
              href={settings.discordLink}
              target="_blank"
              rel="noreferrer"
              className="supabase-card p-4 flex items-center justify-between hover:border-indigo-500/40"
            >
              <div className="flex items-center gap-3">
                <i data-lucide="messages-square" className="w-5 h-5 text-indigo-400"></i>
                <span>Join Discord Server</span>
              </div>
              <i data-lucide="external-link" className="w-4 h-4 text-neutral-500"></i>
            </a>

            <a
              href="https://youtube.com/@dstamilyt6844?si=MClLoDAJ-Tsl0DE3"
              target="_blank"
              rel="noreferrer"
              className="supabase-card p-4 flex items-center justify-between hover:border-red-500/40"
            >
              <div className="flex items-center gap-3">
                <i data-lucide="play-circle" className="w-5 h-5 text-red-400"></i>
                <span>DS TAMIL YT</span>
              </div>
              <i data-lucide="external-link" className="w-4 h-4 text-neutral-500"></i>
            </a>
          </div>

          <button
            disabled={isRegistrationFull || hasExistingRegistration}
            onClick={() => setActiveTab('register')}
            className={`w-full py-3 rounded-lg text-xs font-semibold ${
              isRegistrationFull || hasExistingRegistration ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'btn-primary'
            }`}
          >
            {isRegistrationFull
              ? 'Registration Full'
              : (hasExistingRegistration ? 'Already Registered' : 'Register Now')}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 3. BRACKET PAGE
// =========================================================================
function BracketPage({ bracketData, setActiveTab }) {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isPublished = bracketData?.bracket?.status === 'PUBLISHED';
  const championTeamId = bracketData?.bracket?.championTeamId;
  const teamMap = bracketData?.teamMap || {};
  const matches = bracketData?.bracket?.matches || [];
  const totalRounds = bracketData?.bracket?.totalRounds || 0;

  useEffect(() => {
    if (championTeamId && window.confetti) {
      window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }
  }, [championTeamId]);

  const roundsGrouped = useMemo(() => {
    const grouped = {};
    matches.forEach(m => {
      if (!grouped[m.roundIndex]) grouped[m.roundIndex] = [];
      grouped[m.roundIndex].push(m);
    });
    return grouped;
  }, [matches]);

  if (!isPublished) {
    return (
      <div className="supabase-card max-w-xl mx-auto p-8 text-center space-y-4 my-8">
        <div className="w-12 h-12 mx-auto rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-supabase">
          <i data-lucide="clock" className="w-6 h-6"></i>
        </div>
        <h2 className="text-lg font-bold text-white">Bracket Will Be Announced Soon</h2>
        <p className="text-xs text-neutral-400">
          The knockout bracket will be published once team registration concludes.
        </p>
        <button onClick={() => setActiveTab('register')} className="btn-primary px-4 py-2 text-xs">
          Register Squad
        </button>
      </div>
    );
  }

  const championTeam = championTeamId ? teamMap[championTeamId] : null;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-white">Live Tournament Bracket</h1>
          <p className="text-xs text-neutral-400">Single Elimination Knockout Progression</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-supabase border border-emerald-500/30 text-xs font-mono">
          Live
        </span>
      </div>

      {championTeam && (
        <div className="supabase-card p-6 border-supabase/40 text-center space-y-3 max-w-md mx-auto">
          <span className="text-[11px] font-mono text-supabase uppercase font-bold">🏆 TOURNAMENT CHAMPION</span>
          <img src={championTeam.teamLogo} alt="" className="w-16 h-16 rounded-xl mx-auto object-cover border border-neutral-700" />
          <h3 className="text-xl font-bold text-white">{championTeam.teamName}</h3>
          <p className="text-xs text-neutral-400 font-mono">{championTeam.registrationId} • Leader: {championTeam.teamLeader}</p>
        </div>
      )}

      {/* Bracket Tree */}
      <div className="overflow-x-auto pb-6">
        <div className="flex gap-6 min-w-max">
          {Array.from({ length: totalRounds }).map((_, rIdx) => {
            const roundMatches = roundsGrouped[rIdx] || [];
            const roundTitle = roundMatches[0]?.roundName || `Round ${rIdx + 1}`;

            return (
              <div key={rIdx} className="bracket-column flex flex-col justify-around space-y-6">
                <div className="text-xs font-mono text-neutral-400 font-semibold border-b border-neutral-800 pb-1 text-center">
                  {roundTitle}
                </div>
                <div className="flex-1 flex flex-col justify-around space-y-4">
                  {roundMatches.map(m => {
                    const t1 = m.team1Id ? teamMap[m.team1Id] : null;
                    const t2 = m.team2Id ? teamMap[m.team2Id] : null;
                    const winner = m.winnerId ? teamMap[m.winnerId] : null;
                    const timeLeft = calculateTimeLeft(m.scheduledTime);
                    const isLive = m.status !== 'COMPLETED' && timeLeft.total <= 0;

                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMatch(m)}
                        className={`supabase-card p-3 w-64 space-y-2 cursor-pointer transition-all ${
                          m.status === 'COMPLETED' ? 'border-neutral-800' : isLive ? 'border-rose-500' : 'hover:border-supabase'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] font-mono text-neutral-500">
                          <span>Match #{m.matchNumber}</span>
                          <span className={m.status === 'COMPLETED' ? 'text-supabase' : isLive ? 'text-rose-400' : 'text-neutral-400'}>
                            {m.status === 'COMPLETED' ? 'Done' : isLive ? 'LIVE' : `${timeLeft.days}d ${timeLeft.hours}h`}
                          </span>
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className={`p-1.5 rounded flex items-center justify-between ${
                            winner?.registrationId === m.team1Id ? 'bg-emerald-950/40 text-supabase font-semibold' : 'text-neutral-300'
                          }`}>
                            <span className="truncate">{t1 ? t1.teamName : 'TBD'}</span>
                            {winner?.registrationId === m.team1Id && <i data-lucide="check" className="w-3.5 h-3.5"></i>}
                          </div>

                          <div className={`p-1.5 rounded flex items-center justify-between ${
                            winner?.registrationId === m.team2Id ? 'bg-emerald-950/40 text-supabase font-semibold' : 'text-neutral-300'
                          }`}>
                            <span className="truncate">{t2 ? t2.teamName : 'TBD'}</span>
                            {winner?.registrationId === m.team2Id && <i data-lucide="check" className="w-3.5 h-3.5"></i>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          teamMap={teamMap}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}

function MatchDetailModal({ match, teamMap, onClose }) {
  const t1 = match.team1Id ? teamMap[match.team1Id] : null;
  const t2 = match.team2Id ? teamMap[match.team2Id] : null;
  const timeLeft = calculateTimeLeft(match.scheduledTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="supabase-card max-w-sm w-full p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
          <span className="text-xs font-mono text-neutral-400">{match.roundName}</span>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <div className="text-center space-y-1">
          <div className="text-xs text-neutral-400">Match #{match.matchNumber}</div>
          <div className="text-sm font-semibold text-white">
            {new Date(match.scheduledTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-center font-mono text-xs">
          {match.status === 'COMPLETED' ? (
            <span className="text-supabase">Match Completed</span>
          ) : timeLeft.total <= 0 ? (
            <span className="text-rose-400">🔴 MATCH LIVE</span>
          ) : (
            <span className="text-neutral-300">Starts in {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-center text-xs">
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white truncate">{t1 ? t1.teamName : 'TBD'}</div>
            <div className="text-[10px] text-neutral-500">{t1 ? t1.teamLeader : ''}</div>
          </div>
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white truncate">{t2 ? t2.teamName : 'TBD'}</div>
            <div className="text-[10px] text-neutral-500">{t2 ? t2.teamLeader : ''}</div>
          </div>
        </div>

        <button onClick={onClose} className="w-full py-2 rounded-lg btn-secondary text-xs">
          Close
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// 4. SPONSORS PAGE
// =========================================================================
function SponsorsPage({ sponsors }) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Official Sponsors</h1>
        <p className="text-xs text-neutral-400">Partners making VORTEX CLASH 2026 possible</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {sponsors.map(sp => (
          <div key={sp.id} className="supabase-card p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="h-32 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center p-4">
                <img src={sp.logoUrl} alt="" className="max-h-full object-contain" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-supabase">{sp.role}</span>
                <h3 className="text-base font-bold text-white mt-1">{sp.name}</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{sp.description}</p>
              </div>
            </div>
            {sp.profileLink && sp.profileLink !== '#' && (
              <a
                href={sp.profileLink}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 rounded-lg btn-secondary text-xs text-center block font-medium"
              >
                Visit Partner
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// 5. RULES PAGE
// =========================================================================
function RulesPage({ rules, setActiveTab }) {
  const [activeCat, setActiveCat] = useState('All');
  const categories = ['All', 'Tournament Rules', 'Team Rules', 'Gameplay Rules', 'Disqualification Rules', 'Payment Rules', 'General Instructions'];

  const filtered = rules.filter(r => activeCat === 'All' || r.category === activeCat);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Tournament Rules & Guidelines</h1>
        <p className="text-xs text-neutral-400">Fair play policies and compliance</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-neutral-800 pb-3">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              activeCat === cat ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(r => (
          <div key={r.id} className="supabase-card p-4 space-y-1">
            <span className="text-[10px] font-mono text-supabase">{r.category}</span>
            <h3 className="text-sm font-bold text-white">{r.title}</h3>
            <p className="text-xs text-neutral-400 leading-relaxed pt-1">{r.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// 6. STREAMLINED REGISTRATION PAGE (Clean & Focused)
// =========================================================================
function RegisterPage({ settings, sponsors, rules, totalRegistered, maxCapacity, isRegistrationFull, showToast, onRegisterSuccess, hasExistingRegistration, authUser, onAuthChange, myTeam }) {
  const registrationStatus = normalizeRegistrationStatus(settings || DEFAULT_SETTINGS);
  const registrationStatusText = getRegistrationStatusText(settings || DEFAULT_SETTINGS);
  const [step, setStep] = useState(1);
  const [agreedRules, setAgreedRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [teamLogoFile, setTeamLogoFile] = useState(null);
  const [registeredResult, setRegisteredResult] = useState(null);

  const [formData, setFormData] = useState({
    teamName: '',
    teamLogo: '',
    teamLeader: '',
    phoneNumber: '',
    whatsappNumber: '',
    player1: '',
    player2: '',
    player3: '',
    player4: '',
    substitute: '',
    paymentProof: '',
    joinedWhatsapp: false,
    joinedDiscord: false
  });

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type)) {
      showToast('Only JPG, PNG, and WEBP images are allowed.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be under 5MB.', 'error');
      return;
    }
    setTeamLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setFormData(prev => ({ ...prev, teamLogo: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleProofUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type)) {
      showToast('Only JPG, PNG, and WEBP images are allowed.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be under 5MB.', 'error');
      return;
    }
    setPaymentProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setFormData(prev => ({ ...prev, paymentProof: reader.result }));
    reader.readAsDataURL(file);
  };

  const getMatchStartText = () => {
    const raw = settings?.importantDates || 'Tournament Kickoff: 06 September 2026, 6:00 PM';
    const matchDate = raw.match(/Tournament Kickoff:\s*(.+)/i) || raw.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4},\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    return matchDate ? matchDate[1] : '06 September 2026, 6:00 PM';
  };

  const handleSubmit = async () => {
    if (submitting || submitLock.current) return;
    if (registrationStatus !== 'open') {
      showToast(registrationStatus === 'coming_soon' ? 'Registration is coming soon.' : 'Registration is currently closed.', 'error');
      return;
    }
    if (!formData.teamName || !formData.teamLeader || !formData.phoneNumber || !formData.whatsappNumber) {
      showToast('Please fill in all squad details', 'error');
      return;
    }
    if (!formData.player1 || !formData.player2 || !formData.player3 || !formData.player4) {
      showToast('Please provide all 4 players (1-4)', 'error');
      return;
    }
    if (!paymentProofFile) {
      showToast('Please upload your payment screenshot', 'error');
      return;
    }
    if (!formData.joinedWhatsapp || !formData.joinedDiscord) {
      showToast('Please confirm community joins', 'error');
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const requestBody = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (key !== 'teamLogo' && key !== 'paymentProof') requestBody.append(key, String(value ?? ''));
      });
      requestBody.append('paymentProof', paymentProofFile);
      if (teamLogoFile) requestBody.append('teamLogo', teamLogoFile);

      const res = await fetchWithTimeout('/api/teams', { method: 'POST', body: requestBody }, 15000);
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Registration server returned an invalid response (HTTP ${res.status}).`);
      }
      if (data.success) {
        setRegisteredResult(data.team);
        setStep(5);
        if (window.confetti) window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        showToast(data.duplicate ? 'Team already registered. Showing pass.' : 'Registration successful', data.duplicate ? 'info' : 'success');
        if (onRegisterSuccess) onRegisterSuccess();
      } else {
        showToast(data.error || data.message || 'Failed to register team', 'error');
      }
    } catch (err) {
      console.error('Registration submit error:', err);
      showToast(err.message || 'Network error submitting form', 'error');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const downloadTicketPass = async (passTeam) => {
    if (!window.jspdf || typeof window.QRCode !== 'function' || typeof window.JsBarcode !== 'function') {
      showToast('Ticket PDF libraries are unavailable in this browser.', 'error');
      return;
    }
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [900, 600] });
      const red = [210, 38, 38];
      const white = [245, 245, 245];
      const black = [5, 5, 5];
      const grey = [160, 160, 160];
      const roster = [passTeam.player1, passTeam.player2, passTeam.player3, passTeam.player4, passTeam.substitute].filter(Boolean);
      const timestamp = new Date(passTeam.registeredAt || passTeam.createdAt || Date.now()).toLocaleDateString();
      const registrationId = String(passTeam.registrationId || '');
      const qrData = JSON.stringify({ tournament: 'VORTEX CLASH 2026', registrationId, team: passTeam.teamName || '' });
      const qrContainer = document.createElement('div');
      new window.QRCode(qrContainer, {
        text: qrData,
        width: 220,
        height: 220,
        correctLevel: window.QRCode.CorrectLevel.M
      });
      const qrCanvas = qrContainer.querySelector('canvas');
      const qrImage = qrCanvas ? qrCanvas.toDataURL('image/png') : qrContainer.querySelector('img')?.src;
      if (!qrImage) throw new Error('QR code generation returned no image.');
      const barcodeCanvas = document.createElement('canvas');
      window.JsBarcode(barcodeCanvas, registrationId, { format: 'CODE128', displayValue: false, margin: 0, height: 42, width: 2 });

      pdf.setFillColor(...black);
      pdf.rect(0, 0, 900, 600, 'F');
      pdf.setDrawColor(...red);
      pdf.setLineWidth(1.5);
      pdf.roundedRect(8, 8, 884, 584, 20, 20, 'S');
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineDashPattern([3, 6], 0);
      pdf.line(250, 25, 250, 575);
      pdf.setLineDashPattern([], 0);
      pdf.setDrawColor(...red);
      pdf.line(8, 300, 892, 300);

      const drawBrand = (y, label) => {
        pdf.setTextColor(...red); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('DS TAMIL GAMING', 48, y);
        pdf.setTextColor(...white); pdf.setFontSize(10); pdf.text('PRESENTS', 48, y + 20);
        pdf.setFontSize(32); pdf.text('VORTEX', 48, y + 66);
        pdf.setTextColor(...red); pdf.text('CLASH', 48, y + 101);
        pdf.setTextColor(...white); pdf.setFontSize(20); pdf.text('2026', 95, y + 130);
        pdf.setTextColor(...red); pdf.setFontSize(10); pdf.text(label, 48, y + 174);
      };
      drawBrand(48, 'TICKETS PASS');
      drawBrand(340, 'REGISTRATION PASS');

      pdf.setTextColor(...red); pdf.setFontSize(10); pdf.text('VORTEX CLASH 2026', 290, 48);
      pdf.setTextColor(...white); pdf.setFontSize(25); pdf.text('TICKETS PASS', 290, 82);
      pdf.setTextColor(...red); pdf.setFontSize(8); pdf.text('TEAM NAME', 290, 112);
      pdf.setTextColor(...white); pdf.setFontSize(19); pdf.text(String(passTeam.teamName || '').slice(0, 34), 290, 138);
      pdf.setDrawColor(...red); pdf.line(290, 150, 720, 150);
      pdf.setTextColor(...red); pdf.setFontSize(9); pdf.text('PASS ID', 290, 180);
      pdf.setTextColor(...white); pdf.setFontSize(15); pdf.text(registrationId, 290, 200);
      pdf.setTextColor(...grey); pdf.setFontSize(8); pdf.text('VORTEX CLASH 2026', 290, 242);
      pdf.addImage(barcodeCanvas.toDataURL('image/png'), 'PNG', 735, 55, 110, 150);
      pdf.setTextColor(...red); pdf.setFontSize(8); pdf.text('VORTEX CLASH 2026', 735, 220);
      pdf.setTextColor(...red); pdf.setFontSize(17); pdf.text('TICKETS PASS', 862, 250, { angle: 90 });

      pdf.setTextColor(...red); pdf.setFontSize(10); pdf.text('VORTEX CLASH 2026', 290, 340);
      pdf.setTextColor(...white); pdf.setFontSize(24); pdf.text('REGISTRATION PASS', 290, 372);
      pdf.setDrawColor(...red); pdf.line(290, 385, 610, 385);

      const drawField = (label, value, x, y) => {
        pdf.setTextColor(...red); pdf.setFontSize(8); pdf.text(label.toUpperCase(), x, y);
        pdf.setTextColor(...white); pdf.setFontSize(11); pdf.text(String(value || '-').slice(0, 25), x, y + 15);
        pdf.setDrawColor(90, 30, 30); pdf.line(x, y + 22, x + 135, y + 22);
      };
      drawField('Team Name', passTeam.teamName, 290, 410);
      drawField('Team ID', registrationId, 290, 450);
      drawField('Registered By', passTeam.teamLeader, 290, 490);
      drawField('Phone', passTeam.phoneNumber, 460, 450);
      drawField('Players', roster.join(', '), 460, 490);

      pdf.setDrawColor(...red); pdf.roundedRect(610, 405, 150, 130, 6, 6, 'S');
      pdf.setTextColor(...red); pdf.setFontSize(8); pdf.text('IMPORTANT NOTES', 622, 422);
      pdf.setTextColor(...white); pdf.setFontSize(7.5); pdf.text('Valid only for VORTEX CLASH 2026.', 622, 440); pdf.text('Carry this pass for your team.', 622, 455); pdf.text('Follow all tournament rules.', 622, 470);
      pdf.addImage(qrImage, 'PNG', 775, 342, 92, 92);
      pdf.setTextColor(...red); pdf.setFontSize(8); pdf.text('SCAN FOR UPDATES', 778, 448);
      pdf.setTextColor(...grey); pdf.setFontSize(8); pdf.text('POWERED BY DS TAMIL GAMING', 620, 565);
      pdf.setTextColor(...red); pdf.setFontSize(17); pdf.text('REGISTRATION PASS', 862, 585, { angle: 90 });
      pdf.save(`VORTEX-CLASH-2026-PASS-${registrationId || 'UNKNOWN'}.pdf`);
    } catch (error) {
      console.error('Ticket PDF generation error:', error);
      showToast('Unable to generate the registration pass PDF.', 'error');
    }
  };

  const renderPassCard = (passTeam) => {
    const members = [passTeam.player1, passTeam.player2, passTeam.player3, passTeam.player4].filter(Boolean);
    const timestamp = passTeam.registeredAt || passTeam.createdAt || new Date().toISOString();

    return (
      <div className="relative w-full max-w-xl mx-auto overflow-hidden rounded-[28px] border border-red-500/40 bg-[#0a0a0a] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_25px_80px_rgba(239,68,68,0.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(239,68,68,0.18),_transparent_55%)]"></div>
        <div className="relative p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-neutral-700 pb-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-red-400 font-mono">VORTEX CLASH</div>
              <div className="text-xl sm:text-3xl font-black tracking-tight">{settings.tournamentName || 'VORTEX CLASH 2026'}</div>
            </div>
            <div className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-mono uppercase text-red-300">Pass</div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[1.4fr_0.8fr] items-start">
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-700 bg-neutral-950/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-mono">Registration ID</div>
                <div className="mt-2 text-2xl font-black font-mono text-red-400">{passTeam.registrationId}</div>
              </div>

              <div className="space-y-2 text-xs text-neutral-300">
                <div className="flex justify-between border-b border-neutral-800 pb-2"><span className="text-neutral-400">Team</span><span className="font-semibold text-white">{passTeam.teamName}</span></div>
                <div className="flex justify-between border-b border-neutral-800 pb-2"><span className="text-neutral-400">Leader</span><span className="font-semibold text-white">{passTeam.teamLeader}</span></div>
                <div className="flex justify-between border-b border-neutral-800 pb-2"><span className="text-neutral-400">Phone</span><span className="font-semibold text-white">{passTeam.phoneNumber}</span></div>
                <div className="flex justify-between border-b border-neutral-800 pb-2"><span className="text-neutral-400">Registered</span><span className="font-semibold text-white">{new Date(timestamp).toLocaleString()}</span></div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-neutral-700 bg-neutral-950/60 p-4 md:min-h-[220px]">
              <div className="flex h-18 w-18 items-center justify-center rounded-full border border-neutral-700 bg-white p-2">
                <div className="h-12 w-12 rounded-full bg-[radial-gradient(circle,_#ffffff_0%,_#f3f4f6_35%,_#d1d5db_100%)]"></div>
              </div>
              <div className="mt-2 text-center text-[10px] uppercase tracking-[0.22em] text-neutral-400 font-mono">QR CODE</div>
              <div className="h-28 w-28 bg-white p-2">
                <div className="h-full w-full bg-[linear-gradient(90deg,_#000_50%,_#fff_50%)]"></div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-neutral-700 bg-neutral-950/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-mono">Roster</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white">
              {members.map((member, idx) => (
                <div key={`${member}-${idx}`} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5">{member}</div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => {
              const printWindow = window.open('', '_blank', 'width=900,height=1100');
              if (!printWindow) return;
              const html = `<!doctype html><html><head><title>Ticket Pass</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:Arial,sans-serif;color:white} .wrap{width:820px;padding:24px;border-radius:20px;border:1px solid rgba(239,68,68,0.4);background:#0a0a0a;box-shadow:0 0 0 1px rgba(255,255,255,0.05);} .head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #404040;padding-bottom:12px} .title{font-size:28px;font-weight:900;letter-spacing:1px} .badge{padding:6px 12px;border:1px solid rgba(239,68,68,0.5);border-radius:999px;color:#fca5a5;background:rgba(239,68,68,0.08);font-size:10px;letter-spacing:2px} .inner{display:grid;grid-template-columns:1.5fr 0.7fr;gap:18px;margin-top:18px} .card{border:1px solid #404040;border-radius:14px;padding:16px;background:#111827} .label{font-size:10px;letter-spacing:2px;color:#9ca3af;text-transform:uppercase} .id{font-size:26px;font-weight:900;color:#fca5a5;font-family:monospace} .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #404040;font-size:12px} .qr{display:flex;align-items:center;justify-content:center;height:170px;border:1px solid #404040;border-radius:14px;background:#fff} .qr-box{width:120px;height:120px;background:repeating-linear-gradient(90deg,#000 0,#000 16px,#fff 16px,#fff 32px),repeating-linear-gradient(#000 0,#000 16px,#fff 16px,#fff 32px);background-blend-mode:multiply;opacity:0.9;border:8px solid #fff}</style></head><body><div class='wrap'>${document.querySelector('[data-pass-ticket]').outerHTML}</div></body></html>`;
              printWindow.document.write(html);
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => printWindow.print(), 400);
            }} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white">Print Pass</button>
            <button onClick={() => {
              if (!window.jspdf) {
                alert('PDF library unavailable in this browser.');
                return;
              }
              const { jsPDF } = window.jspdf;
              const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
              pdf.setFillColor(10, 10, 10);
              pdf.rect(0, 0, 595, 842, 'F');
              pdf.setTextColor(255, 255, 255);
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(20);
              pdf.text(settings.tournamentName || 'VORTEX CLASH 2026', 40, 56);
              pdf.setFontSize(12);
              pdf.setTextColor(239, 68, 68);
              pdf.text(passTeam.registrationId, 40, 84);
              pdf.setTextColor(255, 255, 255);
              pdf.setFontSize(14);
              pdf.text(passTeam.teamName, 40, 120);
              pdf.text('Leader: ' + passTeam.teamLeader, 40, 150);
              pdf.text('Phone: ' + passTeam.phoneNumber, 40, 176);
              pdf.text('Registered: ' + new Date(passTeam.registeredAt || passTeam.createdAt || Date.now()).toLocaleString(), 40, 202);
              pdf.setDrawColor(239, 68, 68);
              pdf.rect(40, 220, 520, 170, 'S');
              pdf.setFontSize(11);
              let y = 250;
              [passTeam.player1, passTeam.player2, passTeam.player3, passTeam.player4].filter(Boolean).forEach((member) => {
                pdf.text('- ' + member, 60, y);
                y += 24;
              });
              pdf.text('Generated by Vortex Clash 2026', 40, 620);
              pdf.save(`${passTeam.registrationId || 'ticket'}-pass.pdf`);
            }} className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">Download Pass as PDF</button>
          </div>
        </div>
      </div>
    );
  };

  const teamToDisplay = registeredResult || myTeam;

  if (hasExistingRegistration && !registeredResult && teamToDisplay) {
    const matchTimeText = getMatchStartText();
    return (
      <div className="supabase-card max-w-md mx-auto p-6 space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 mx-auto">
          <i data-lucide="alert-circle" className="w-6 h-6"></i>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300 font-mono">Already Registered</div>
          <h2 className="text-xl font-bold text-white mt-1">You have already registered a team.</h2>
        </div>

        <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-left space-y-3 text-xs">
          <div className="flex items-center gap-3 border-b border-neutral-800 pb-3">
            <img src={teamToDisplay.teamLogo} alt="" className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <div className="font-bold text-white text-sm">{teamToDisplay.teamName}</div>
              <div className="text-neutral-400">Captain: {teamToDisplay.teamLeader}</div>
            </div>
          </div>

          <div className="space-y-2 text-neutral-300">
            <div><span className="text-neutral-500">Team Name:</span> {teamToDisplay.teamName}</div>
            <div><span className="text-neutral-500">Team ID:</span> {teamToDisplay.registrationId}</div>
            <div><span className="text-neutral-500">Match Start:</span> {matchTimeText}</div>
          </div>
        </div>

        <button onClick={() => downloadTicketPass(teamToDisplay)} className="w-full py-2.5 rounded-lg btn-primary text-xs font-medium">
          DOWNLOAD REGISTRATION PASS
        </button>
      </div>
    );
  }

  if (registrationStatus !== 'open' && step !== 5) {
    return (
      <div className="supabase-card max-w-md mx-auto p-8 text-center space-y-3 my-8">
        <h2 className="text-lg font-bold text-white">{registrationStatusText}</h2>
        <p className="text-xs text-neutral-400">
          {registrationStatus === 'coming_soon'
            ? 'Registration will open soon. Please check back later.'
            : isRegistrationFull ? `All ${maxCapacity} slots have been registered.` : 'New registrations are currently disabled.'}
        </p>
      </div>
    );
  }

  // Success Step
  if (step === 5 && registeredResult) {
    const matchTimeText = getMatchStartText();

    return (
      <div className="supabase-card max-w-3xl mx-auto p-6 space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-supabase mx-auto">
          <i data-lucide="check" className="w-6 h-6"></i>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-supabase font-mono">VORTEX CLASH</div>
          <h2 className="text-xl font-bold text-white mt-1">Presented by DS TAMIL GAMING</h2>
          <p className="text-xs text-neutral-400 mt-1 font-mono">{registeredResult.registrationId}</p>
        </div>

        <>
            <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-left space-y-3 text-xs">
              <div className="flex items-center gap-3 border-b border-neutral-800 pb-3">
                <img src={registeredResult.teamLogo || ''} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div>
                  <div className="font-bold text-white text-sm">{registeredResult.teamName}</div>
                  <div className="text-neutral-400">Captain: {registeredResult.teamLeader}</div>
                </div>
              </div>

              <div className="space-y-2 text-neutral-300">
                <div><span className="text-neutral-500">Team Name:</span> {registeredResult.teamName}</div>
                <div><span className="text-neutral-500">Team ID:</span> {registeredResult.registrationId}</div>
                <div><span className="text-neutral-500">Match Start:</span> {matchTimeText}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-neutral-300 pt-2 border-t border-neutral-800">
                <div>P1: {registeredResult.player1}</div>
                <div>P2: {registeredResult.player2}</div>
                <div>P3: {registeredResult.player3}</div>
                <div>P4: {registeredResult.player4}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => downloadTicketPass(registeredResult)} className="flex-1 py-2 rounded-lg btn-primary text-xs font-semibold">
                DOWNLOAD REGISTRATION PASS
              </button>
              <button onClick={() => window.location.reload()} className="flex-1 py-2 rounded-lg btn-secondary text-xs font-medium">
                Done
              </button>
            </div>
        </>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Step Indicators */}
      <div className="flex justify-between text-xs font-mono text-neutral-400 border-b border-neutral-800 pb-3">
        <span className={step >= 1 ? 'text-supabase' : ''}>1. Rules</span>
        <span className={step >= 2 ? 'text-supabase' : ''}>2. Squad</span>
        <span className={step >= 3 ? 'text-supabase' : ''}>3. Players</span>
        <span className={step >= 4 ? 'text-supabase' : ''}>4. Payment</span>
      </div>

      {/* Step 1: Rules */}
      {step === 1 && (
        <div className="supabase-card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Tournament Agreement</h2>
            <p className="text-xs text-neutral-400">Confirm rules and fair play guidelines</p>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 max-h-48 overflow-y-auto space-y-2 text-xs text-neutral-300">
            {rules.slice(0, 4).map(r => (
              <div key={r.id}>
                <span className="font-semibold text-white">{r.title}:</span> {r.content}
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={agreedRules}
              onChange={(e) => setAgreedRules(e.target.checked)}
              className="mt-0.5 accent-emerald-500 rounded"
            />
            <span>I agree to follow all rules and understand that hacking/toxicity results in disqualification.</span>
          </label>

          <button
            disabled={!agreedRules}
            onClick={() => setStep(2)}
            className="w-full py-2.5 rounded-lg btn-primary text-xs font-semibold disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Squad Details */}
      {step === 2 && (
        <div className="supabase-card p-6 space-y-4 text-xs">
          <div>
            <h2 className="text-lg font-bold text-white">Squad Details</h2>
            <p className="text-xs text-neutral-400">Team name and contact information</p>
          </div>

          <div className="space-y-1">
            <label className="text-neutral-400">Team Logo / Crest</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="mt-2 text-xs text-neutral-400 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:bg-neutral-800 file:text-xs file:text-white"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-neutral-400 block mb-1">Squad Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Vortex Vipers"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>

            <div>
              <label className="text-neutral-400 block mb-1">Team Leader Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Dinesh Kumar"
                value={formData.teamLeader}
                onChange={(e) => setFormData({ ...formData, teamLeader: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-neutral-400 block mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="9876543210"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  className="w-full p-2.5 input-supabase text-xs"
                />
              </div>
              <div>
                <label className="text-neutral-400 block mb-1">WhatsApp Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="9876543210"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  className="w-full p-2.5 input-supabase text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(1)} className="w-1/3 py-2.5 rounded-lg btn-secondary text-xs">Back</button>
            <button
              disabled={!formData.teamName || !formData.teamLeader || !formData.phoneNumber || !formData.whatsappNumber}
              onClick={() => setStep(3)}
              className="w-2/3 py-2.5 rounded-lg btn-primary text-xs font-semibold disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Players (Strictly NO UID!) */}
      {step === 3 && (
        <div className="supabase-card p-6 space-y-4 text-xs">
          <div>
            <h2 className="text-lg font-bold text-white">Player Roster</h2>
            <p className="text-xs text-neutral-400">4 primary players + optional substitute</p>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-neutral-400 block mb-1">Player 1 (Captain) *</label>
              <input
                type="text"
                required
                placeholder="Full Name"
                value={formData.player1}
                onChange={(e) => setFormData({ ...formData, player1: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">Player 2 *</label>
              <input
                type="text"
                required
                placeholder="Full Name"
                value={formData.player2}
                onChange={(e) => setFormData({ ...formData, player2: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">Player 3 *</label>
              <input
                type="text"
                required
                placeholder="Full Name"
                value={formData.player3}
                onChange={(e) => setFormData({ ...formData, player3: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">Player 4 *</label>
              <input
                type="text"
                required
                placeholder="Full Name"
                value={formData.player4}
                onChange={(e) => setFormData({ ...formData, player4: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">Substitute (Optional)</label>
              <input
                type="text"
                placeholder="Full Name"
                value={formData.substitute}
                onChange={(e) => setFormData({ ...formData, substitute: e.target.value })}
                className="w-full p-2.5 input-supabase text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(2)} className="w-1/3 py-2.5 rounded-lg btn-secondary text-xs">Back</button>
            <button
              disabled={!formData.player1 || !formData.player2 || !formData.player3 || !formData.player4}
              onClick={() => setStep(4)}
              className="w-2/3 py-2.5 rounded-lg btn-primary text-xs font-semibold disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Payment & Submit */}
      {step === 4 && (
        <div className="supabase-card p-6 space-y-4 text-xs">
          <div>
            <h2 className="text-lg font-bold text-white">Payment & Community Verification</h2>
            <p className="text-xs text-neutral-400">Scan QR and upload transaction screenshot</p>
          </div>

          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center gap-4">
            <img src={settings.paymentQrUrl} alt="QR" className="w-24 h-24 bg-white p-1 rounded-lg" />
            <div className="space-y-1">
              <div className="font-bold text-white text-sm">Fee: {settings.registrationFee}</div>
              <p className="text-neutral-400 text-[11px] leading-relaxed">{settings.paymentInstructions}</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-neutral-400 block mb-1">Upload Payment Screenshot *</label>
            <input
              type="file"
              required
              accept="image/*"
              onChange={handleProofUpload}
              className="w-full text-xs text-neutral-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-xs file:text-white"
            />
            {formData.paymentProof && (
              <div className="mt-2 h-32 rounded-lg bg-black flex items-center justify-center overflow-hidden border border-neutral-800">
                <img src={formData.paymentProof} alt="" className="max-h-full object-contain" />
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
              <input
                type="checkbox"
                checked={formData.joinedWhatsapp}
                onChange={(e) => setFormData({ ...formData, joinedWhatsapp: e.target.checked })}
                className="accent-emerald-500 rounded"
              />
              <span>I have joined the official WhatsApp community</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
              <input
                type="checkbox"
                checked={formData.joinedDiscord}
                onChange={(e) => setFormData({ ...formData, joinedDiscord: e.target.checked })}
                className="accent-emerald-500 rounded"
              />
              <span>I have joined the official Discord server</span>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(3)} className="w-1/3 py-2.5 rounded-lg btn-secondary text-xs">Back</button>
            <button
              disabled={submitting || !formData.paymentProof || !formData.joinedWhatsapp || !formData.joinedDiscord}
              onClick={handleSubmit}
              className="w-2/3 py-2.5 rounded-lg btn-primary text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {submitting ? 'Submitting...' : 'Submit Registration'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// =========================================================================
// 7. ADMIN PANEL (Clean Supabase Dashboard)
// =========================================================================
function AdminPanel({ settings, teams, sponsors, rules, bracketData, showToast, fetchData, onLogout }) {
  const [adminTab, setAdminTab] = useState('teams');
  const [search, setSearch] = useState('');
  const [viewProof, setViewProof] = useState(null);
  const [editingSponsor, setEditingSponsor] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [settingsForm, setSettingsForm] = useState(settings);
  const [paymentQrFile, setPaymentQrFile] = useState(null);
  const [paymentQrPreview, setPaymentQrPreview] = useState(settings.paymentQrUrl || '');
  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    role: '',
    description: '',
    logoUrl: '',
    profileLink: '',
    orderIndex: ''
  });
  const [sponsorImagePreview, setSponsorImagePreview] = useState('');
  const [ruleForm, setRuleForm] = useState({
    category: 'Tournament Rules',
    title: '',
    content: '',
    orderIndex: ''
  });

  useEffect(() => {
    setSettingsForm(normalizeSettingsPayload(settings));
    setPaymentQrPreview(settings.paymentQrUrl || '');
  }, [settings]);

  const isLocked = bracketData?.bracket?.isLocked;
  const isPublished = bracketData?.bracket?.status === 'PUBLISHED';
  const matches = bracketData?.bracket?.matches || [];
  const teamMap = bracketData?.teamMap || {};

  const handleExport = () => {
    window.open('/api/teams/export-excel', '_blank');
    showToast("Downloading Excel spreadsheet...", "info");
  };

  const handleGenerateBracket = async () => {
    if (!confirm("Generate knockout bracket for registered teams?")) return;
    const res = await fetch('/api/bracket/generate', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      fetchData();
    }
  };

  const handleTogglePublish = async () => {
    const res = await fetch('/api/bracket/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish: !isPublished })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      fetchData();
    }
  };

  const handleSetWinner = async (matchId, winnerId) => {
    const res = await fetch('/api/bracket/match/winner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, winnerId })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Winner advanced", "success");
      fetchData();
    }
  };

  const handleDeleteTeam = async (id) => {
    if (!confirm(`Delete team ${id}?`)) return;
    try {
      const res = await fetchWithTimeout(`/api/teams/${id}`, { method: 'DELETE' }, 10000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete team.');
      showToast("Team removed", "success");
      await fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to delete team.', 'error');
    }
  };

  const filteredTeams = teams.filter(t =>
    t.teamName.toLowerCase().includes(search.toLowerCase()) ||
    t.registrationId.toLowerCase().includes(search.toLowerCase()) ||
    t.teamLeader.toLowerCase().includes(search.toLowerCase())
  );

  const handleSponsorImageUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Only JPG, PNG, and WEBP images are allowed.', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be under 2MB.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/uploads/sponsor-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Upload failed', 'error');
        return;
      }

      setSponsorForm(prev => ({ ...prev, logoUrl: data.url }));
      setSponsorImagePreview(data.url);
      showToast('Sponsor logo uploaded', 'success');
    } catch (error) {
      console.error('Sponsor upload error:', error);
      showToast('Network error while uploading sponsor image', 'error');
    }
  };

  const handlePaymentQrUpload = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      showToast('Only JPG, PNG, and WEBP images are allowed.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be under 5MB.', 'error');
      return;
    }

    setPaymentQrFile(file);
    setPaymentQrPreview(URL.createObjectURL(file));
  };

  const resetSponsorForm = () => {
    setSponsorForm({
      name: '',
      role: '',
      description: '',
      logoUrl: '',
      profileLink: '',
      orderIndex: ''
    });
    setSponsorImagePreview('');
    setEditingSponsor(null);
  };

  const resetRuleForm = () => {
    setRuleForm({
      category: 'Tournament Rules',
      title: '',
      content: '',
      orderIndex: ''
    });
    setEditingRule(null);
  };

  const handleSponsorSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...sponsorForm };
    if (!payload.name || !payload.role) {
      showToast('Sponsor name and role are required', 'error');
      return;
    }
    if (!payload.logoUrl) {
      showToast('Please upload a sponsor logo image.', 'error');
      return;
    }

    const method = editingSponsor ? 'PUT' : 'POST';
    const url = editingSponsor ? `/api/sponsors/${editingSponsor.id}` : '/api/sponsors';

    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 10000);
      const data = await res.json();

      if (data.success) {
        showToast(editingSponsor ? 'Sponsor updated' : 'Sponsor added', 'success');
        resetSponsorForm();
        await fetchData();
      } else {
        showToast(data.message || 'Sponsor update failed', 'error');
      }
    } catch (err) {
      console.error('Sponsor save error:', err);
      showToast(err.message || 'Network error saving sponsor', 'error');
    }
  };

  const handleDeleteSponsor = async (id) => {
    if (!confirm('Delete this sponsor?')) return;
    const res = await fetch(`/api/sponsors/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Sponsor removed', 'success');
      fetchData();
      if (editingSponsor?.id === id) resetSponsorForm();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  };

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...ruleForm };
    if (!payload.category || !payload.title || !payload.content) {
      showToast('Category, title, and content are required', 'error');
      return;
    }

    const method = editingRule ? 'PUT' : 'POST';
    const url = editingRule ? `/api/rules/${editingRule.id}` : '/api/rules';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      showToast(editingRule ? 'Rule updated' : 'Rule added', 'success');
      resetRuleForm();
      fetchData();
    } else {
      showToast(data.message || 'Rule save failed', 'error');
    }
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return;
    const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Rule removed', 'success');
      fetchData();
      if (editingRule?.id === id) resetRuleForm();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  };

  const handleViewProof = async (proof) => {
    if (!proof) return;
    if (proof.startsWith('http://') || proof.startsWith('https://') || proof.startsWith('/uploads/')) {
      setViewProof(proof);
      return;
    }
    try {
      const res = await fetch(`/api/admin/payment-proof-url?proof=${encodeURIComponent(proof)}`);
      const data = await res.json();
      if (data.success && data.url) {
        setViewProof(data.url);
      } else {
        showToast(data.error || "Failed to load payment proof", "error");
      }
    } catch (err) {
      showToast("Error retrieving payment proof", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Top Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-xs text-neutral-400 font-mono">Manage Teams, Knockout Bracket, & Settings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="px-3 py-1.5 rounded-lg btn-primary text-xs font-semibold flex items-center gap-1.5">
            <i data-lucide="download" className="w-3.5 h-3.5"></i>
            <span>Export Excel</span>
          </button>
          <button onClick={onLogout} className="px-3 py-1.5 rounded-lg btn-secondary text-xs">
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 text-xs font-medium">
        {['teams', 'bracket', 'sponsors', 'rules', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setAdminTab(tab)}
            className={`px-3 py-1.5 rounded-md capitalize ${
              adminTab === tab ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TEAMS VIEW */}
      {adminTab === 'teams' && (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs p-2 input-supabase text-xs"
          />

          <div className="supabase-card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 text-neutral-400 font-mono">
                <tr>
                  <th className="p-3">Team</th>
                  <th className="p-3">Reg ID</th>
                  <th className="p-3">Leader</th>
                  <th className="p-3">Phone / WA</th>
                  <th className="p-3">Proof</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredTeams.map(t => (
                  <tr key={t.registrationId} className="hover:bg-neutral-900/40">
                    <td className="p-3 flex items-center gap-2">
                      <img src={t.teamLogo} alt="" className="w-6 h-6 rounded object-cover" />
                      <span className="font-semibold text-white">{t.teamName}</span>
                    </td>
                    <td className="p-3 font-mono text-supabase">{t.registrationId}</td>
                    <td className="p-3">{t.teamLeader}</td>
                    <td className="p-3 text-neutral-400">{t.phoneNumber}</td>
                    <td className="p-3">
                      <button onClick={() => handleViewProof(t.paymentProof)} className="text-xs text-supabase hover:underline">
                        View
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleDeleteTeam(t.registrationId)} className="text-rose-400 hover:text-rose-300">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BRACKET VIEW */}
      {adminTab === 'bracket' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={handleGenerateBracket} className="btn-primary px-3 py-1.5 text-xs">
              Generate Bracket
            </button>
            <button onClick={handleTogglePublish} className="btn-secondary px-3 py-1.5 text-xs">
              {isPublished ? 'Unpublish' : 'Publish Bracket'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {matches.map(m => {
              const t1 = m.team1Id ? teamMap[m.team1Id] : null;
              const t2 = m.team2Id ? teamMap[m.team2Id] : null;
              return (
                <div key={m.id} className="supabase-card p-3 space-y-2 text-xs">
                  <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                    <span>{m.roundName} #{m.matchNumber}</span>
                    <span>{m.status}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center p-1.5 bg-neutral-950 rounded">
                      <span className="truncate">{t1 ? t1.teamName : 'TBD'}</span>
                      {t1 && m.status !== 'COMPLETED' && (
                        <button onClick={() => handleSetWinner(m.id, t1.registrationId)} className="text-supabase text-[11px] font-mono">
                          Win
                        </button>
                      )}
                    </div>
                    <div className="flex justify-between items-center p-1.5 bg-neutral-950 rounded">
                      <span className="truncate">{t2 ? t2.teamName : 'TBD'}</span>
                      {t2 && m.status !== 'COMPLETED' && (
                        <button onClick={() => handleSetWinner(m.id, t2.registrationId)} className="text-supabase text-[11px] font-mono">
                          Win
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SPONSORS VIEW */}
      {adminTab === 'sponsors' && (
        <div className="space-y-4">
          <form onSubmit={handleSponsorSubmit} className="supabase-card p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">{editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}</h3>
              {editingSponsor && (
                <button type="button" onClick={resetSponsorForm} className="text-neutral-400 hover:text-white text-[11px]">
                  Cancel
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Sponsor name"
                value={sponsorForm.name}
                onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
              <input
                type="text"
                placeholder="Role"
                value={sponsorForm.role}
                onChange={(e) => setSponsorForm({ ...sponsorForm, role: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
              <div className="md:col-span-2 space-y-2">
                <label className="text-neutral-400 block">Upload Sponsor Logo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={handleSponsorImageUpload}
                  className="w-full text-xs text-neutral-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-xs file:text-white"
                />
                {(sponsorImagePreview || sponsorForm.logoUrl) && (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2 flex items-center justify-center">
                    <img src={sponsorImagePreview || sponsorForm.logoUrl} alt="Sponsor preview" className="max-h-20 object-contain" />
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Profile link"
                value={sponsorForm.profileLink}
                onChange={(e) => setSponsorForm({ ...sponsorForm, profileLink: e.target.value })}
                className="w-full p-2 input-supabase text-xs md:col-span-2"
              />
              <input
                type="number"
                placeholder="Order index"
                value={sponsorForm.orderIndex}
                onChange={(e) => setSponsorForm({ ...sponsorForm, orderIndex: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
              <textarea
                placeholder="Short description"
                value={sponsorForm.description}
                onChange={(e) => setSponsorForm({ ...sponsorForm, description: e.target.value })}
                className="w-full p-2 input-supabase text-xs md:col-span-2 min-h-[80px]"
              />
            </div>

            <button type="submit" className="w-full py-2 rounded-lg btn-primary text-xs font-semibold">
              {editingSponsor ? 'Update Sponsor' : 'Add Sponsor'}
            </button>
          </form>

          <div className="space-y-3">
            {sponsors.map(sponsor => (
              <div key={sponsor.id} className="supabase-card p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src={sponsor.logoUrl || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80'} alt={sponsor.name} className="w-10 h-10 rounded object-cover border border-neutral-700" />
                  <div>
                    <div className="font-semibold text-white">{sponsor.name}</div>
                    <div className="text-[11px] text-neutral-400">{sponsor.role}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingSponsor(sponsor);
                      setSponsorForm({
                        name: sponsor.name,
                        role: sponsor.role,
                        description: sponsor.description || '',
                        logoUrl: sponsor.logoUrl || '',
                        profileLink: sponsor.profileLink || '',
                        orderIndex: sponsor.orderIndex || ''
                      });
                      setSponsorImagePreview(sponsor.logoUrl || '');
                    }}
                    className="px-2 py-1 rounded bg-neutral-800 text-neutral-200 text-[11px]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSponsor(sponsor.id)}
                    className="px-2 py-1 rounded bg-rose-950/40 text-rose-300 text-[11px]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RULES VIEW */}
      {adminTab === 'rules' && (
        <div className="space-y-4">
          <form onSubmit={handleRuleSubmit} className="supabase-card p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">{editingRule ? 'Edit Rule' : 'Add Rule'}</h3>
              {editingRule && (
                <button type="button" onClick={resetRuleForm} className="text-neutral-400 hover:text-white text-[11px]">
                  Cancel
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={ruleForm.category}
                onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              >
                <option>Tournament Rules</option>
                <option>Team Rules</option>
                <option>Gameplay Rules</option>
                <option>Disqualification Rules</option>
                <option>Payment Rules</option>
                <option>General Instructions</option>
              </select>
              <input
                type="number"
                placeholder="Order index"
                value={ruleForm.orderIndex}
                onChange={(e) => setRuleForm({ ...ruleForm, orderIndex: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
              <input
                type="text"
                placeholder="Rule title"
                value={ruleForm.title}
                onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })}
                className="w-full p-2 input-supabase text-xs md:col-span-2"
              />
              <textarea
                placeholder="Rule content"
                value={ruleForm.content}
                onChange={(e) => setRuleForm({ ...ruleForm, content: e.target.value })}
                className="w-full p-2 input-supabase text-xs md:col-span-2 min-h-[110px]"
              />
            </div>

            <button type="submit" className="w-full py-2 rounded-lg btn-primary text-xs font-semibold">
              {editingRule ? 'Update Rule' : 'Add Rule'}
            </button>
          </form>

          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="supabase-card p-3">
                <div className="flex justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-supabase">{rule.category}</div>
                    <div className="font-semibold text-white">{rule.title}</div>
                    <div className="text-xs text-neutral-300">{rule.content}</div>
                  </div>
                  <div className="flex gap-2 items-start">
                    <button
                      onClick={() => {
                        setEditingRule(rule);
                        setRuleForm({
                          category: rule.category,
                          title: rule.title,
                          content: rule.content,
                          orderIndex: rule.orderIndex || ''
                        });
                      }}
                      className="px-2 py-1 rounded bg-neutral-800 text-neutral-200 text-[11px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="px-2 py-1 rounded bg-rose-950/40 text-rose-300 text-[11px]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS VIEW */}
      {adminTab === 'settings' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              let nextSettings = { ...settingsForm };
              if (paymentQrFile) {
                const uploadForm = new FormData();
                uploadForm.append('file', paymentQrFile);
                const uploadResponse = await fetchWithTimeout('/api/uploads/payment-qr', {
                  method: 'POST',
                  body: uploadForm
                }, 10000);
                const uploadData = await uploadResponse.json();
                if (!uploadResponse.ok || !uploadData.success || !uploadData.url) {
                  throw new Error(uploadData.error || 'Payment QR image upload failed.');
                }
                nextSettings = { ...nextSettings, paymentQrUrl: uploadData.url };
              }
              const response = await fetchWithTimeout('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizeSettingsPayload(nextSettings))
              }, 10000);
              const data = await response.json();
              if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to update settings.');
              }
              setSettingsForm(normalizeSettingsPayload(data.settings));
              setPaymentQrFile(null);
              setPaymentQrPreview(data.settings.paymentQrUrl || '');
              await fetchData();
              showToast("Settings updated", "success");
            } catch (err) {
              showToast(err.message || 'Failed to update settings.', 'error');
            }
          }}
          className="supabase-card p-6 space-y-4 max-w-lg text-xs"
        >
          <div>
            <label className="text-neutral-400 block mb-1">Tournament Name</label>
            <input
              type="text"
              value={settingsForm.tournamentName}
              onChange={(e) => setSettingsForm({ ...settingsForm, tournamentName: e.target.value })}
              className="w-full p-2 input-supabase text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-400 block mb-1">Tournament Date</label>
              <input
                type="date"
                value={settingsForm.tournamentDate || '2026-09-06'}
                onChange={(e) => setSettingsForm({ ...settingsForm, tournamentDate: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">Start Time</label>
              <input
                type="time"
                value={settingsForm.tournamentStartTime || '18:00'}
                onChange={(e) => setSettingsForm({ ...settingsForm, tournamentStartTime: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-400 block mb-1">Max Teams</label>
              <input
                type="number"
                value={settingsForm.maxTeams}
                onChange={(e) => setSettingsForm({ ...settingsForm, maxTeams: Number(e.target.value) })}
                className="w-full p-2 input-supabase text-xs"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">Registration Fee</label>
              <input
                type="text"
                value={settingsForm.registrationFee}
                onChange={(e) => setSettingsForm({ ...settingsForm, registrationFee: e.target.value })}
                className="w-full p-2 input-supabase text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-neutral-400 block mb-2">Registration Status</label>
            <select
              value={settingsForm.registrationStatus || normalizeRegistrationStatus(settingsForm)}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setSettingsForm({
                  ...settingsForm,
                  registrationStatus: nextStatus,
                  registrationOpen: nextStatus === 'open'
                });
              }}
              className="w-full p-2 input-supabase text-xs"
            >
              <option value="open">OPEN</option>
              <option value="closed">CLOSED</option>
              <option value="coming_soon">COMING SOON</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-neutral-400 block mb-1">Upload Payment QR Code</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePaymentQrUpload}
              className="w-full text-xs text-neutral-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-xs file:text-white"
            />
            {paymentQrPreview && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2 flex items-center justify-center">
                <img src={paymentQrPreview} alt="Payment QR preview" className="w-40 h-40 object-contain" />
              </div>
            )}
          </div>
          <button type="submit" className="w-full py-2 rounded-lg btn-primary text-xs font-semibold">
            Save Settings
          </button>
        </form>
      )}

      {/* Proof Modal */}
      {viewProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="supabase-card max-w-md w-full p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-neutral-400">Payment Screenshot</span>
              <button onClick={() => setViewProof(null)} className="text-neutral-500 hover:text-white">
                <i data-lucide="x" className="w-4 h-4"></i>
              </button>
            </div>
            <img src={viewProof} alt="Proof" className="max-h-80 mx-auto object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// ADMIN LOGIN MODAL
// =========================================================================
function AdminLoginModal({ onClose, onSuccess, showToast }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      onSuccess();
      return;
    }

    setError(data.error || data.message || 'Invalid username or password.');
    showToast(data.error || data.message || 'Invalid username or password.', 'error');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0c0c0c]/80 backdrop-blur-sm">
      <div className="w-full max-w-[1100px] min-h-[700px] overflow-hidden rounded-[28px] border border-[#262626] bg-[#0f0f0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.25fr] h-full">
          <div className="bg-[#111111] p-6 sm:p-8 lg:p-12 flex items-center justify-center border-r border-[#1c1c1c]">
            <div className="w-full max-w-[420px]">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-9 h-9 rounded-xl bg-[#1b1b1b] border border-[#2a2a2a] flex items-center justify-center shadow-[0_0_18px_rgba(62,207,142,0.18)]">
                  <div className="w-4 h-4 border-[3px] border-[#3ecf8e] rounded-[3px] rotate-45" style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}></div>
                </div>
                <div className="text-xl font-semibold text-white tracking-tight">DS Tamil Gaming</div>
              </div>

              <div className="mb-7">
                <h1 className="text-4xl font-bold tracking-[-0.05em] text-white">Admin Sign In</h1>
                <p className="mt-2 text-sm text-neutral-400">Sign in to manage Vortex Clash 2026</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Admin Username</label>
                  <input
                    type="text"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Bhuvi"
                    className="w-full h-12 rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] px-3.5 text-sm text-white placeholder:text-neutral-500 shadow-sm transition focus:border-[#3ecf8e] focus:outline-none focus:ring-2 focus:ring-[#3ecf8e]/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] px-3.5 text-sm text-white placeholder:text-neutral-500 shadow-sm transition focus:border-[#3ecf8e] focus:outline-none focus:ring-2 focus:ring-[#3ecf8e]/20"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#404040] bg-[#0b0b0b] text-[#3ecf8e] focus:ring-[#3ecf8e]"
                  />
                  <span>Remember me</span>
                </label>

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
                )}

                <button type="submit" className="w-full h-12 rounded-xl bg-[#3ecf8e] text-[#0c0c0c] text-sm font-semibold shadow-[0_16px_28px_rgba(62,207,142,0.22)] transition hover:bg-[#4fe3a0] hover:-translate-y-0.5">
                  Sign In
                </button>
              </form>
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#0e0e0e] p-6 sm:p-8 lg:p-10 flex items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.04),transparent_28%),linear-gradient(135deg,#0a0a0a_0%,#121212_45%,#0b0b0b_100%)]"></div>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(125deg, transparent 0%, rgba(62,207,142,0.16) 44%, transparent 58%)', transform: 'translateX(8%) rotate(12deg)' }}></div>

            <div className="relative w-full max-w-[620px] z-10">
              <div className="mb-8 flex justify-center">
                <div className="relative w-64 h-40">
                  <div className="absolute inset-x-0 top-0 h-28 opacity-70" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02) 25%, rgba(62,207,142,0.2) 60%, rgba(255,255,255,0.04))', clipPath: 'polygon(20% 100%, 50% 0%, 80% 100%)' }}></div>
                  <div className="absolute inset-x-10 bottom-0 h-20 bg-[#3ecf8e]/10 transform -skew-x-12 rounded-full blur-2xl"></div>
                  <div className="absolute left-0 right-0 bottom-4 h-14 bg-[#171717] opacity-90 border border-[#2a2a2a]" style={{ clipPath: 'polygon(12% 100%, 50% 0%, 88% 100%)' }}></div>
                  <div className="absolute left-1/2 top-3 h-28 w-40 -translate-x-1/2 border border-white/10 rotate-12 bg-white/5 blur-[1px]"></div>
                </div>
              </div>

              <div className="text-center text-white">
                <div className="text-xs font-mono tracking-[0.28em] text-[#a8f4c9] uppercase">DS TAMIL GAMING</div>
                <h2 className="mt-4 text-4xl leading-tight font-bold tracking-[-0.06em] text-white">Welcome to Vortex Clash 2026</h2>
                <p className="mt-4 mx-auto max-w-md text-sm leading-6 text-neutral-300">
                  Manage teams, registrations and tournament settings from your secure admin panel.
                </p>
              </div>

              <div className="mt-8 rounded-[22px] border border-[#2a2a2a] bg-[#151515] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.4)]">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h3 className="text-2xl font-semibold leading-snug text-white">Live admin controls for Vortex Clash</h3>
                    <p className="mt-3 max-w-xs text-sm leading-6 text-neutral-300">
                      Monitor registrations, update sponsors, edit rules, and manage the tournament from one secure dashboard.
                    </p>
                  </div>
                  <div className="flex -space-x-2">
                    <div className="w-9 h-9 rounded-full border-2 border-[#0f0f0f] bg-[radial-gradient(circle_at_30%_30%,#f3d4bd,#d0a97e_55%,#7b5431)]"></div>
                    <div className="w-9 h-9 rounded-full border-2 border-[#0f0f0f] bg-[radial-gradient(circle_at_30%_30%,#d7d7d7,#8f8f8f_60%,#3a3a3a)]"></div>
                    <div className="w-9 h-9 rounded-full border-2 border-[#0f0f0f] bg-[radial-gradient(circle_at_30%_30%,#f5d9ae,#b78f4b_55%,#5e4421)]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// FOOTER
// =========================================================================
function getChatReply(input, { settings, sponsors, rules }) {
  const text = input.toLowerCase();

  if (!settings) {
    return 'The tournament details are still loading. Please try again in a moment.';
  }

  if (text.includes('register') || text.includes('signup') || text.includes('join')) {
    return `Registration is ${settings.registrationOpen ? 'open' : 'currently closed'}. We have ${settings.maxTeams} total team slots and the entry fee is ${settings.registrationFee}.`;
  }

  if (text.includes('payment') || text.includes('fee') || text.includes('qr')) {
    return `The registration fee is ${settings.registrationFee}. ${settings.paymentInstructions}`;
  }

  if (text.includes('sponsor') || text.includes('partners')) {
    if (!sponsors || sponsors.length === 0) {
      return 'There are no sponsors listed yet.';
    }
    return `Our sponsors include ${sponsors.slice(0, 3).map(s => s.name).join(', ')}. You can also view the full list from the Sponsors page.`;
  }

  if (text.includes('rule') || text.includes('guideline')) {
    if (!rules || rules.length === 0) {
      return 'No rules are available right now.';
    }
    return `Key rules include: ${rules.slice(0, 3).map(rule => rule.title).join(', ')}. Please review all rules before registering.`;
  }

  if (text.includes('whatsapp') || text.includes('community')) {
    return `Join the official WhatsApp community here: ${settings.whatsappLink}`;
  }

  if (text.includes('discord')) {
    return `Join the official Discord server here: ${settings.discordLink}`;
  }

  if (text.includes('bracket') || text.includes('match') || text.includes('schedule')) {
    return 'The match bracket and schedule are available from the Bracket section. Admins will publish updates when matches are ready.';
  }

  if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
    return 'Hello! I can help with registration, payment, rules, sponsors, and tournament updates.';
  }

  if (text.includes('thank')) {
    return 'You are welcome! Let me know if you need any tournament help.';
  }

  return 'I can help with registration, payment, rules, sponsors, bracket info, and community links. Try asking about rules, sponsors, or registration.';
}

function Footer({ settings, setActiveTab, onOpenAdmin }) {
  return (
    <footer className="mt-16 py-10 text-xs relative z-10" style={{borderTop:'1px solid rgba(184,149,106,0.35)', background:'rgba(4,8,14,0.78)'}}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div style={{fontFamily:'Share Tech Mono, monospace', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.28em', color:'#71717a'}}>
          © 2026 <strong style={{color:'#b8956a'}}>DS TAMIL GAMING</strong> · VORTEX CLASH 2026
        </div>
        <div className="flex gap-6">
          {[
            { id: 'tournament', label: 'Tournament' },
            { id: 'bracket', label: 'Bracket' },
            { id: 'rules', label: 'Rules' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="genesis-nav-link" style={{fontSize:'10px'}}>{tab.label}</button>
          ))}
          <button onClick={onOpenAdmin} className="genesis-nav-link" style={{fontSize:'10px', color:'#e2a743'}}>Admin</button>
        </div>
      </div>
    </footer>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
