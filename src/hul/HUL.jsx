import React, { useState, useEffect, useRef } from 'react';
import { SYSTEM_PROMPT_PRECISE, SYSTEM_PROMPT_COMPREHENSIVE } from './studyContent.js';

// ── Auth ─────────────────────────────────────────────────────────────────────
const CREDENTIALS = { username: 'huldoorbeen', password: 'msl2026' };
const STUDIES = ['Peri/Menopause & Longevity'];
const QUERY_LIMIT = 50;
const UPGRADE_THRESHOLD = 45; // show soft nudge at this point

// ── Response modes ────────────────────────────────────────────────────────────
const MODES = {
  precise:       { label: 'Precise',       model: 'claude-haiku-4-5-20251001', tokens: 400  },
  comprehensive: { label: 'Comprehensive', model: 'claude-sonnet-4-6',         tokens: 1200 },
};

// ── Suggested questions ───────────────────────────────────────────────────────
const SUGGESTED = [
  'What were the biggest emotional pain points for women in perimenopause?',
  'How do males experience ageing differently from females?',
  'What supplement formats do women prefer and why?',
  'What did respondents say about their ideal future self?',
  'Which white spaces are most urgent for HUL to address?',
];

// ── Placeholder artworks (SVG, using Doorbeen design system) ─────────────────
const ARTWORKS = [
  // Artwork 1: concentric circles
  `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="600" fill="#2a2520"/>
    <circle cx="300" cy="300" r="240" fill="none" stroke="#c0832e" stroke-width="1" opacity="0.3"/>
    <circle cx="300" cy="300" r="180" fill="none" stroke="#c0832e" stroke-width="1" opacity="0.5"/>
    <circle cx="300" cy="300" r="120" fill="none" stroke="#ffa86e" stroke-width="1.5" opacity="0.6"/>
    <circle cx="300" cy="300" r="60" fill="none" stroke="#ffa86e" stroke-width="2" opacity="0.8"/>
    <circle cx="300" cy="300" r="12" fill="#c0832e" opacity="0.9"/>
    <text x="300" y="520" text-anchor="middle" font-family="Poppins,sans-serif" font-size="11" fill="#c0832e" opacity="0.6" letter-spacing="4">MAKE SIMPLE LABS</text>
  </svg>`,
  // Artwork 2: waveform
  `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="600" fill="#1c1c1c"/>
    <path d="M0,300 Q75,200 150,300 T300,300 T450,300 T600,300" fill="none" stroke="#c0832e" stroke-width="1.5" opacity="0.4"/>
    <path d="M0,300 Q75,160 150,300 T300,300 T450,300 T600,300" fill="none" stroke="#ffa86e" stroke-width="1" opacity="0.3"/>
    <path d="M0,300 Q75,240 150,300 T300,300 T450,300 T600,300" fill="none" stroke="#c0832e" stroke-width="2.5" opacity="0.7"/>
    <path d="M0,320 Q75,220 150,320 T300,320 T450,320 T600,320" fill="none" stroke="#8c492a" stroke-width="1" opacity="0.3"/>
    <text x="300" y="540" text-anchor="middle" font-family="Poppins,sans-serif" font-size="11" fill="#c0832e" opacity="0.5" letter-spacing="4">DOORBEEN</text>
  </svg>`,
  // Artwork 3: grid of dots
  `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="600" fill="#2a2520"/>
    ${Array.from({length: 10}, (_, i) =>
      Array.from({length: 10}, (_, j) =>
        `<circle cx="${60 + i*50}" cy="${60 + j*50}" r="${(i+j) % 3 === 0 ? 4 : 2}" fill="#c0832e" opacity="${0.2 + ((i*j) % 5) * 0.12}"/>`
      ).join('')
    ).join('')}
    <text x="300" y="560" text-anchor="middle" font-family="Poppins,sans-serif" font-size="11" fill="#ffa86e" opacity="0.5" letter-spacing="4">2026</text>
  </svg>`,
  // Artwork 4: two overlapping circles (Doorbeen motif)
  `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="600" fill="#1c1c1c"/>
    <circle cx="240" cy="300" r="140" fill="none" stroke="#c0832e" stroke-width="1.5" opacity="0.6"/>
    <circle cx="360" cy="300" r="140" fill="none" stroke="#ffa86e" stroke-width="1.5" opacity="0.6"/>
    <circle cx="240" cy="300" r="140" fill="#c0832e" opacity="0.04"/>
    <circle cx="360" cy="300" r="140" fill="#ffa86e" opacity="0.04"/>
    <text x="300" y="520" text-anchor="middle" font-family="Poppins,sans-serif" font-size="13" fill="#c0832e" opacity="0.7" letter-spacing="3">DOORBEEN</text>
    <text x="300" y="540" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#c0832e" opacity="0.4" letter-spacing="3">BY MAKE SIMPLE LABS</text>
  </svg>`,
  // Artwork 5: horizontal lines, data-like
  `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="600" fill="#2a2520"/>
    ${Array.from({length: 20}, (_, i) => {
      const y = 80 + i * 22;
      const w = 80 + ((i * 37) % 320);
      const op = 0.15 + (i % 4) * 0.12;
      const color = i % 3 === 0 ? '#ffa86e' : '#c0832e';
      return `<rect x="80" y="${y}" width="${w}" height="3" rx="2" fill="${color}" opacity="${op}"/>`;
    }).join('')}
    <text x="300" y="560" text-anchor="middle" font-family="Poppins,sans-serif" font-size="11" fill="#c0832e" opacity="0.5" letter-spacing="4">CONSUMER INTELLIGENCE</text>
  </svg>`,
];

export default function HUL() {
  // Auth state
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [selectedStudy, setSelectedStudy] = useState(STUDIES[0]);

  // Artwork carousel
  const [artIdx, setArtIdx] = useState(0);
  const [artFade, setArtFade] = useState(true);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('comprehensive');
  const [queryCount, setQueryCount] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Artwork rotation
  useEffect(() => {
    const timer = setInterval(() => {
      setArtFade(false);
      setTimeout(() => {
        setArtIdx(i => (i + 1) % ARTWORKS.length);
        setArtFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleLogin = () => {
    if (username.trim() === CREDENTIALS.username && password === CREDENTIALS.password) {
      setAuthed(true);
      setAuthError('');
    } else {
      setAuthError('Incorrect username or password.');
    }
  };

  const sendMessage = async (text) => {
    const q = text || input.trim();
    if (!q || loading) return;
    if (queryCount >= QUERY_LIMIT) { setShowUpgrade(true); return; }

    setInput('');
    const newMessages = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setLoading(true);

    const newCount = queryCount + 1;
    setQueryCount(newCount);
    if (newCount >= UPGRADE_THRESHOLD) setShowUpgrade(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODES[mode].model,
          max_tokens: MODES[mode].tokens,
          system: mode === 'precise' ? SYSTEM_PROMPT_PRECISE : SYSTEM_PROMPT_COMPREHENSIVE,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      const reply = data.content?.[0]?.text || 'Something went wrong. Please try again.';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Could not reach the server. Please try again.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const queriesLeft = QUERY_LIMIT - queryCount;

  // ── LOGIN SCREEN ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Poppins, sans-serif' }}>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; background: #f8f6f2; }
          .hul-input { width: 100%; padding: 12px 16px; border: 1px solid #e8e4de; border-radius: 8px; font-family: Poppins, sans-serif; font-size: 14px; background: #fff; color: #1c1c1c; transition: border-color 0.2s; outline: none; }
          .hul-input:focus { border-color: #c0832e; }
          .hul-btn { width: 100%; padding: 14px; background: #1c1c1c; color: #fff; border: none; border-radius: 8px; font-family: Poppins, sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
          .hul-btn:hover { background: #2a2520; }
          .art-fade { transition: opacity 0.4s ease; }
          select.hul-input { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; }
          @media (max-width: 700px) { .hul-left { display: none !important; } .hul-right { width: 100% !important; } }
        `}</style>

        {/* Left — artwork */}
        <div className="hul-left" style={{ width: '50%', background: '#2a2520', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="art-fade" style={{ opacity: artFade ? 1 : 0, width: '80%', maxWidth: 420 }}
            dangerouslySetInnerHTML={{ __html: ARTWORKS[artIdx] }} />
          <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: '#f0ede8', opacity: 0.9 }}>doorbeen</div>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500, fontSize: 10, letterSpacing: 2, color: '#c0832e', marginTop: 4 }}>by make simple labs</div>
          </div>
        </div>

        {/* Right — login */}
        <div className="hul-right" style={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: '#f8f6f2' }}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: '#1c1c1c', marginBottom: 4 }}>DOORBEEN</div>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 13, color: '#888', letterSpacing: 1 }}>Research Intelligence</div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 22, color: '#1c1c1c', lineHeight: 1.3, marginBottom: 8 }}>
                Access your study
              </div>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontSize: 14, color: '#666', lineHeight: 1.6 }}>
                Ask questions. Explore findings. Hear the consumer voice.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Study</label>
                <select className="hul-input" value={selectedStudy} onChange={e => setSelectedStudy(e.target.value)}>
                  {STUDIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Username</label>
                <input className="hul-input" type="text" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="enter username" />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Password</label>
                <input className="hul-input" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="enter password" />
              </div>
              {authError && <div style={{ fontFamily: 'Poppins, sans-serif', fontSize: 13, color: '#a63d2f' }}>{authError}</div>}
              <button className="hul-btn" onClick={handleLogin}>Enter</button>
            </div>

            <div style={{ marginTop: 40, fontFamily: 'Poppins, sans-serif', fontSize: 12, color: '#bbb', lineHeight: 1.6 }}>
              Access is restricted to authorised team members.<br />
              Questions? <a href="mailto:hello@makesimple.in" style={{ color: '#c0832e', textDecoration: 'none' }}>hello@makesimple.in</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CHAT SCREEN ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8f6f2', display: 'flex', flexDirection: 'column', fontFamily: 'Poppins, sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f8f6f2; }
        .msg-user { background: #1c1c1c; color: #f0ede8; border-radius: 16px 16px 4px 16px; padding: 14px 18px; font-size: 14px; line-height: 1.7; max-width: 75%; align-self: flex-end; }
        .msg-ai { background: #fff; border: 1px solid #e8e4de; color: #1c1c1c; border-radius: 16px 16px 16px 4px; padding: 16px 20px; font-size: 14px; line-height: 1.8; max-width: 85%; align-self: flex-start; }
        .mode-btn { padding: 6px 14px; border-radius: 100px; font-family: Poppins, sans-serif; font-size: 12px; font-weight: 500; border: 1px solid #e8e4de; cursor: pointer; transition: all 0.15s; background: #fff; color: #666; }
        .mode-btn.active { background: #1c1c1c; color: #fff; border-color: #1c1c1c; }
        .mode-btn:hover:not(.active) { border-color: #c0832e; color: #c0832e; }
        .suggest-chip { padding: 8px 14px; background: #fff; border: 1px solid #e8e4de; border-radius: 100px; font-family: Poppins, sans-serif; font-size: 12px; color: #666; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
        .suggest-chip:hover { border-color: #c0832e; color: #c0832e; }
        .send-btn { width: 44px; height: 44px; border-radius: 50%; background: #1c1c1c; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
        .send-btn:hover { background: #c0832e; }
        .send-btn:disabled { background: #e8e4de; cursor: default; }
        .chat-input { flex: 1; padding: 12px 16px; border: 1px solid #e8e4de; border-radius: 24px; font-family: Poppins, sans-serif; font-size: 14px; background: #fff; color: #1c1c1c; outline: none; resize: none; transition: border-color 0.2s; line-height: 1.5; }
        .chat-input:focus { border-color: #c0832e; }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: #c0832e; animation: dotBounce 1.2s ease infinite; }
        .dot:nth-child(2) { animation-delay: 0.15s; }
        .dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes dotBounce { 0%, 80%, 100% { transform: scale(0.5); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }
        .upgrade-bar { background: #fff8f0; border-top: 1px solid #f0e0cc; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        @media (max-width: 600px) { .msg-user, .msg-ai { max-width: 95%; } .chat-area { padding: 16px !important; } }
      `}</style>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e8e4de', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 3, color: '#1c1c1c' }}>doorbeen</div>
          <div style={{ fontWeight: 500, fontSize: 10, letterSpacing: 2, color: '#c0832e', marginTop: 2 }}>by make simple labs</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: 1 }}>{selectedStudy}</div>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: queriesLeft <= 10 ? '#a63d2f' : queriesLeft <= 20 ? '#c0832e' : '#1c1c1c',
              marginTop: 2,
              background: queriesLeft <= 10 ? '#fff0ee' : queriesLeft <= 20 ? '#fff8f0' : '#f0ede8',
              padding: '4px 10px',
              borderRadius: 20,
              border: `1px solid ${queriesLeft <= 10 ? '#f0ccc8' : queriesLeft <= 20 ? '#f0e0cc' : '#e8e4de'}`,
            }}>
              {queriesLeft} {queriesLeft === 1 ? 'query' : 'queries'} left
            </div>
          </div>
          <button
            onClick={() => { setAuthed(false); setMessages([]); setQueryCount(0); }}
            style={{
              background: 'none',
              border: '1px solid #e8e4de',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontFamily: 'Poppins, sans-serif',
              color: '#888',
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-area" style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: 800, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Welcome */}
        {messages.length === 0 && (
          <div style={{ padding: '32px 0' }}>
            <div style={{ fontWeight: 300, fontSize: 24, color: '#1c1c1c', lineHeight: 1.3, marginBottom: 8 }}>
              What would you like to know about the study?
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 32, lineHeight: 1.6 }}>
              Ask about consumer insights, verbatims, brand white spaces, or specific respondents.
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Suggested questions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SUGGESTED.map((q, i) => (
                <button key={i} className="suggest-chip" onClick={() => sendMessage(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((m, i) => (
          <React.Fragment key={i}>
            <div className={m.role === 'user' ? 'msg-user' : 'msg-ai'} style={{ whiteSpace: 'pre-wrap' }}>
              <span dangerouslySetInnerHTML={{ __html: m.content
                .replace(/^### (.*$)/gm, '<strong style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;display:block;margin:16px 0 6px">$1</strong>')
                .replace(/^## (.*$)/gm, '<strong style="font-size:15px;color:#1c1c1c;display:block;margin:18px 0 8px">$1</strong>')
                .replace(/^# (.*$)/gm, '<strong style="font-size:16px;color:#1c1c1c;display:block;margin:20px 0 8px">$1</strong>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/^- (.*$)/gm, '<div style="padding:3px 0 3px 16px;border-left:2px solid #e8e4de;margin:4px 0">$1</div>')
                .replace(/\n\n/g, '<br/><br/>')
                .replace(/\n/g, '<br/>')
              }} />
            </div>
            {m.role === 'assistant' && (
              <button
                onClick={() => navigator.clipboard.writeText(m.content)}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: 11,
                  color: '#bbb',
                  fontFamily: 'Poppins, sans-serif',
                  marginTop: -8,
                }}
                onMouseEnter={e => e.target.style.color = '#c0832e'}
                onMouseLeave={e => e.target.style.color = '#bbb'}
              >
                Copy
              </button>
            )}
          </React.Fragment>
        ))}

        {/* Loading */}
        {loading && (
          <div className="msg-ai" style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '18px 20px' }}>
            <div className="dot" />
            <div className="dot" />
            <div className="dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Upgrade nudge */}
      {showUpgrade && queriesLeft > 0 && (
        <div className="upgrade-bar">
          <div style={{ fontSize: 13, color: '#666' }}>
            You have <strong style={{ color: '#1c1c1c' }}>{queriesLeft} queries</strong> remaining on this study.
          </div>
          <a href="mailto:hello@makesimple.in?subject=Doorbeen%20Research%20Access" style={{ fontSize: 12, fontWeight: 600, color: '#c0832e', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Get unlimited access
          </a>
        </div>
      )}

      {/* Hard limit */}
      {queryCount >= QUERY_LIMIT && (
        <div className="upgrade-bar" style={{ background: '#fff0ee', borderTop: '1px solid #f0ccc8' }}>
          <div style={{ fontSize: 13, color: '#666' }}>
            You have used all {QUERY_LIMIT} queries on this study.
          </div>
          <a href="mailto:hello@makesimple.in?subject=Doorbeen%20Research%20Access" style={{ fontSize: 13, fontWeight: 600, color: '#a63d2f', textDecoration: 'none' }}>
            Contact Make Simple Labs to continue
          </a>
        </div>
      )}

      {/* Input area */}
      <div style={{ background: '#fff', borderTop: '1px solid #e8e4de', padding: '16px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {Object.entries(MODES).map(([key, val]) => (
              <button key={key} className={`mode-btn${mode === key ? ' active' : ''}`}
                onClick={() => setMode(key)}>
                {val.label}
              </button>
            ))}
          </div>
          {/* Input row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              placeholder={queryCount >= QUERY_LIMIT ? 'Query limit reached' : 'Ask about the study...'}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
              onKeyDown={handleKey}
              disabled={queryCount >= QUERY_LIMIT}
              style={{ height: 46 }}
            />
            <button className="send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading || queryCount >= QUERY_LIMIT}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#ccc', marginTop: 8, textAlign: 'center' }}>
            Powered by Doorbeen · Make Simple Labs · Goa
          </div>
        </div>
      </div>
    </div>
  );
}
