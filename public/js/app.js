const { useState, useEffect, useRef, useMemo } = React;

// Preset Clean Avatars
const PRESET_CRESTS = [
  { id: '1', name: 'Viper', url: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=200&q=80' },
  { id: '2', name: 'Titan', url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=200&q=80' },
  { id: '3', name: 'Shadow', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80' },
  { id: '4', name: 'Phoenix', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=200&q=80' },
  { id: '5', name: 'Cyber', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=200&q=80' },
  { id: '6', name: 'Apex', url: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?auto=format&fit=crop&w=200&q=80' }
];

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

// =========================================================================
// MAIN APP COMPONENT
// =========================================================================
function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [settings, setSettings] = useState(null);
  const [teams, setTeams] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [rules, setRules] = useState([]);
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

  const fetchData = async () => {
    try {
      const [sRes, tRes, spRes, rRes, bRes] = await Promise.all([
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/teams').then(r => r.json()),
        fetch('/api/sponsors').then(r => r.json()),
        fetch('/api/rules').then(r => r.json()),
        fetch('/api/bracket').then(r => r.json())
      ]);

      if (sRes.success) setSettings(sRes.settings);
      if (tRes.success) setTeams(tRes.teams);
      if (spRes.success) setSponsors(spRes.sponsors);
      if (rRes.success) setRules(rRes.rules);
      if (bRes.success) setBracketData(bRes);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  const refreshUserState = async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.success) setAuthUser(meData.user);
        else setAuthUser(null);
      } else {
        setAuthUser(null);
      }
    } catch {
      setAuthUser(null);
    }

    try {
      const teamRes = await fetch('/api/my-team');
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setMyTeam(teamData.success && teamData.team ? teamData.team : null);
      } else {
        setMyTeam(null);
      }
    } catch {
      setMyTeam(null);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      await fetchData();
      await refreshUserState();
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.success && meData.user && meData.user.role === 'admin') {
          setIsAdminLoggedIn(true);
        }
      }
      setLoading(false);
    };
    bootstrap();
    const interval = setInterval(() => {
      fetch('/api/live-sync')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            fetch('/api/bracket').then(r => r.json()).then(b => setBracketData(b));
            fetch('/api/teams').then(r => r.json()).then(t => {
              if (t.success) setTeams(t.teams);
            });
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  });

  const totalRegistered = teams.length;
  const maxCapacity = settings ? settings.maxTeams : 30;
  const isRegistrationFull = totalRegistered >= maxCapacity || (settings && !settings.registrationOpen);
  const hasExistingRegistration = !!myTeam;

  const handleChatSubmit = (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage = { id: Date.now(), type: 'user', text: trimmed };
    const reply = getChatReply(trimmed, { settings, sponsors, rules });

    setChatMessages(prev => [...prev, userMessage, { id: Date.now() + 1, type: 'bot', text: reply }]);
    setChatInput('');
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c0c] text-neutral-300">
        <div className="w-8 h-8 border-2 border-supabase border-t-transparent rounded-full animate-spin mb-3"></div>
        <div className="text-xs font-mono text-neutral-400">Loading platform...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0c0c0c] bg-dot-pattern text-neutral-200 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-80 bg-supabase-radial pointer-events-none -z-10"></div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border border-neutral-800 bg-neutral-900/95 backdrop-blur-md shadow-2xl flex items-center gap-3 text-xs text-white">
          <div className={`w-2 h-2 rounded-full ${toastMessage.type === 'error' ? 'bg-rose-500' : 'bg-supabase'}`}></div>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Supabase Clean Navbar */}
      <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-[#0c0c0c]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-supabase group-hover:border-supabase transition-colors">
              <i data-lucide="zap" className="w-4 h-4"></i>
            </div>
            <div>
              <div className="text-xs font-mono font-semibold tracking-wider text-supabase">DS TAMIL GAMING</div>
              <div className="text-sm font-bold text-white tracking-tight">VORTEX CLASH 2026</div>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium">
            {[
              { id: 'home', label: 'Home' },
              { id: 'tournament', label: 'Tournament' },
              { id: 'bracket', label: 'Bracket' },
              { id: 'sponsors', label: 'Sponsors' },
              { id: 'rules', label: 'Rules' },
              { id: 'register', label: 'Register' }
            ].map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    active
                      ? 'bg-neutral-800 text-white font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="hidden sm:flex items-center gap-3">
            <div className={`px-2.5 py-1 rounded-full text-xs font-mono border ${
              isRegistrationFull
                ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
            }`}>
              {isRegistrationFull ? 'Registration Full' : `${totalRegistered}/${maxCapacity} Registered`}
            </div>

            <button
              onClick={() => {
                if (isAdminLoggedIn) setActiveTab('admin');
                else setAdminLoginModal(true);
              }}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                activeTab === 'admin'
                  ? 'bg-emerald-500/10 border-supabase text-supabase'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
              title="Admin Panel"
            >
              <i data-lucide="shield" className="w-4 h-4"></i>
            </button>
          </div>

          {/* Mobile menu toggle */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300"
            >
              <i data-lucide={mobileMenuOpen ? 'x' : 'menu'} className="w-5 h-5"></i>
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-neutral-950 border-b border-neutral-800 px-4 py-4 space-y-2 text-xs">
          {['home', 'tournament', 'bracket', 'sponsors', 'rules', 'register'].map(id => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-md capitalize font-medium ${
                activeTab === id ? 'bg-neutral-800 text-white' : 'text-neutral-400'
              }`}
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
            className="w-full text-left px-3 py-2 rounded-md text-supabase bg-emerald-950/20 border border-emerald-800/40"
          >
            Admin Panel
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
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

      <div className="fixed bottom-4 right-4 z-40">
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="px-4 py-2.5 rounded-full bg-emerald-500 text-black font-semibold shadow-2xl hover:bg-emerald-400 transition-colors flex items-center gap-2 text-xs"
          >
            <i data-lucide="message-circle" className="w-4 h-4"></i>
            Ask Vortex Bot
          </button>
        ) : (
          <div className="w-[340px] max-w-[90vw] rounded-2xl border border-neutral-700 bg-neutral-950/95 shadow-2xl backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800 bg-neutral-900/80">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <i data-lucide="bot" className="w-3.5 h-3.5 text-supabase"></i>
                </div>
                Vortex Guide
              </div>
              <button onClick={() => setChatOpen(false)} className="text-neutral-400 hover:text-white">
                <i data-lucide="x" className="w-4 h-4"></i>
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto px-3 py-3 space-y-3 bg-[#111111]">
              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.type === 'user' ? 'bg-supabase text-black' : 'bg-neutral-800 text-neutral-100 border border-neutral-700'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-800 p-2.5 bg-neutral-900">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {['Rules', 'Sponsors', 'Register', 'Payment'].map(label => (
                  <button
                    key={label}
                    onClick={() => setChatInput(label)}
                    className="px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 text-[10px] text-neutral-200 hover:border-supabase"
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
                  className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-neutral-500 outline-none focus:border-supabase"
                />
                <button type="submit" className="px-3 py-2 rounded-lg bg-supabase text-black text-xs font-semibold hover:bg-emerald-400">
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
  return (
    <div className="space-y-12">
      
      {/* Clean Hero */}
      <section className="supabase-card p-6 sm:p-10 relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-supabase text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-supabase"></span>
              <span>DS TAMIL GAMING PRESENTS</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              VORTEX CLASH <span className="text-supabase">2026</span>
            </h1>

            <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-xl">
              {settings.description}
            </p>

            {/* Registration Metric */}
            <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2 max-w-md">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-neutral-400">Slots Claimed</span>
                <span className={isRegistrationFull ? 'text-rose-400' : 'text-supabase'}>
                  {isRegistrationFull ? 'Registration Full' : `${totalRegistered} of ${maxCapacity} Teams`}
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isRegistrationFull ? 'bg-rose-500' : 'bg-supabase'}`}
                  style={{ width: `${Math.min(100, (totalRegistered / maxCapacity) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                disabled={isRegistrationFull}
                onClick={() => setActiveTab('register')}
                className={`px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  isRegistrationFull
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'btn-primary'
                }`}
              >
                <i data-lucide="user-plus" className="w-4 h-4"></i>
                <span>{isRegistrationFull ? 'Registration Full' : 'Register Squad'}</span>
              </button>

              <button
                onClick={() => setActiveTab('bracket')}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold btn-secondary flex items-center gap-2"
              >
                <i data-lucide="git-branch" className="w-4 h-4"></i>
                <span>View Bracket</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/90 shadow-2xl group hover:border-emerald-500/40 transition-all duration-300">
              <div className="relative p-2 bg-gradient-to-b from-neutral-900 to-neutral-950 flex items-center justify-center">
                <img
                  src={settings.posterUrl || '/hero-poster.jpg'}
                  alt="DS VORTEX CLASH Official Poster"
                  className="w-full h-auto max-h-[380px] object-contain rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
              <div className="p-4 border-t border-neutral-800 flex justify-between items-center text-xs bg-neutral-900/80 backdrop-blur-sm">
                <span className="text-neutral-400">Entry Fee: <strong className="text-white font-mono text-sm">{settings.registrationFee}</strong></span>
                <span className="text-neutral-400">Format: <strong className="text-supabase font-mono">Knockout</strong></span>
              </div>
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
              <span className={isRegistrationFull ? 'text-rose-400' : 'text-supabase'}>
                {isRegistrationFull ? 'Closed' : 'Open'}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
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
  const [step, setStep] = useState(1);
  const [agreedRules, setAgreedRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registeredResult, setRegisteredResult] = useState(null);

  const [formData, setFormData] = useState({
    teamName: '',
    teamLogo: PRESET_CRESTS[0].url,
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
    const reader = new FileReader();
    reader.onloadend = () => setFormData(prev => ({ ...prev, teamLogo: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleProofUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
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
    if (!formData.joinedWhatsapp || !formData.joinedDiscord) {
      showToast("Please confirm community joins", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        const team = data.team;
        setRegisteredResult(team);
        setStep(5);
        if (window.confetti) window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        showToast(data.duplicate ? "Team already registered. Showing pass." : "Registration successful", data.duplicate ? "info" : "success");
        onRegisterSuccess();
      } else {
        showToast(data.message || "Failed to register", "error");
      }
    } catch {
      showToast("Network error submitting form", "error");
    } finally {
      setSubmitting(false);
    }
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

        <button onClick={() => window.print()} className="w-full py-2.5 rounded-lg btn-secondary text-xs font-medium">
          Print Team Pass
        </button>
      </div>
    );
  }

  if (isRegistrationFull && step !== 5) {
    return (
      <div className="supabase-card max-w-md mx-auto p-8 text-center space-y-3 my-8">
        <h2 className="text-lg font-bold text-white">Registration Closed</h2>
        <p className="text-xs text-neutral-400">All {maxCapacity} slots have been registered.</p>
      </div>
    );
  }

  // Success Step
  if (step === 5 && registeredResult) {
    const matchTimeText = getMatchStartText();

    return (
      <div className="supabase-card max-w-md mx-auto p-6 space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-supabase mx-auto">
          <i data-lucide="check" className="w-6 h-6"></i>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-supabase font-mono">VORTEX CLASH</div>
          <h2 className="text-xl font-bold text-white mt-1">Presented by DS TAMIL GAMING</h2>
          <p className="text-xs text-neutral-400 mt-1 font-mono">{registeredResult.registrationId}</p>
        </div>

        <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-left space-y-3 text-xs">
          <div className="flex items-center gap-3 border-b border-neutral-800 pb-3">
            <img src={registeredResult.teamLogo} alt="" className="w-10 h-10 rounded-lg object-cover" />
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
          <button onClick={() => window.print()} className="flex-1 py-2 rounded-lg btn-secondary text-xs font-medium">
            Print Pass
          </button>
          <button onClick={() => window.location.reload()} className="flex-1 py-2 rounded-lg btn-primary text-xs font-semibold">
            Done
          </button>
        </div>
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
            <div className="flex gap-2">
              {PRESET_CRESTS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, teamLogo: c.url })}
                  className={`p-1 rounded-lg border ${formData.teamLogo === c.url ? 'border-supabase bg-emerald-500/10' : 'border-neutral-800'}`}
                >
                  <img src={c.url} alt="" className="w-8 h-8 rounded object-cover" />
                </button>
              ))}
            </div>
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
    const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast("Team removed", "success");
      fetchData();
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
    formData.append('image', file);

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

    const method = editingSponsor ? 'PUT' : 'POST';
    const url = editingSponsor ? `/api/sponsors/${editingSponsor.id}` : '/api/sponsors';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      showToast(editingSponsor ? 'Sponsor updated' : 'Sponsor added', 'success');
      resetSponsorForm();
      fetchData();
    } else {
      showToast(data.message || 'Sponsor update failed', 'error');
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
                      <button onClick={() => setViewProof(t.paymentProof)} className="text-xs text-supabase hover:underline">
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
                <label className="text-neutral-400 block">Sponsor logo image</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
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
                placeholder="Logo URL (optional fallback)"
                value={sponsorForm.logoUrl}
                onChange={(e) => {
                  setSponsorForm({ ...sponsorForm, logoUrl: e.target.value });
                  setSponsorImagePreview(e.target.value);
                }}
                className="w-full p-2 input-supabase text-xs md:col-span-2"
              />
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
            await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settingsForm)
            });
            fetchData();
            showToast("Settings updated", "success");
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
          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={settingsForm.registrationOpen}
              onChange={(e) => setSettingsForm({ ...settingsForm, registrationOpen: e.target.checked })}
              className="accent-emerald-500 rounded"
            />
            <span className="text-white">Registration Open to Public</span>
          </label>
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
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      onSuccess();
      return;
    }

    setError(data.message || 'Invalid username or password.');
    showToast(data.message || 'Invalid username or password.', 'error');
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
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Username</label>
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
                    placeholder="••••"
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
    <footer className="border-t border-neutral-800/80 mt-16 py-8 text-xs text-neutral-500">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          © 2026 <strong>DS TAMIL GAMING</strong> • VORTEX CLASH 2026
        </div>
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('tournament')} className="hover:text-neutral-300">Tournament</button>
          <button onClick={() => setActiveTab('bracket')} className="hover:text-neutral-300">Bracket</button>
          <button onClick={() => setActiveTab('rules')} className="hover:text-neutral-300">Rules</button>
          <button onClick={onOpenAdmin} className="hover:text-supabase font-mono">Admin</button>
        </div>
      </div>
    </footer>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
