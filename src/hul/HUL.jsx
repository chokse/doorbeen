import React, { useState, useEffect, useRef } from 'react';
import { SYSTEM_PROMPT } from './studyContent.js';

// ── Auth ─────────────────────────────────────────────────────────────────────
const STUDIES = ['Peri/Menopause & Longevity'];
const QUERY_LIMIT = 50;
const UPGRADE_THRESHOLD = 45; // show soft nudge at this point

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
  {
    file: '/artwork/1280px-Gustav_Klimt_-_Death_and_Life_(First_Version)_-_1910-11.jpg',
    title: 'Death and Life',
    artist: 'Gustav Klimt, 1910–15',
    description: 'Klimt\'s meditation on the duality of existence. A richly decorated figure of Death faces a mass of sleeping humanity clinging together in life. Oil on canvas. Leopold Museum, Vienna.',
  },
  {
    file: '/artwork/960px-At_Eternity\'s_Gate_-_Vincent_Van_Gogh.jpg',
    title: 'At Eternity\'s Gate',
    artist: 'Vincent van Gogh, 1890',
    description: 'Painted weeks before his death, a figure of an old man sits collapsed in grief. Van Gogh described it as an expression of the existence of God and eternity. One of his most emotionally raw works. Oil on canvas. Kröller-Müller Museum, Netherlands.',
    objectPosition: 'top',
  },
  {
    file: '/artwork/960px-Sinaida_Jewgenjewna_Serebrjakowa_At_the_Dressing-Table_1909.jpg',
    title: 'At the Dressing Table',
    artist: 'Zinaida Serebriakova, 1909',
    description: 'The artist catches her own reflection mid-morning, radiating unselfconscious joy. One of the most celebrated self-portraits in Russian art. Oil on canvas. Tretyakov Gallery, Moscow.',
  },
  {
    file: '/artwork/self-portrait-between-the-clock-and-the-bed-1943-edvard-munc.jpg',
    title: 'Self-Portrait Between the Clock and the Bed',
    artist: 'Edvard Munch, 1940–43',
    description: 'Painted in his late 70s, Munch stands between a grandfather clock marking time running out and his bed, the final resting place. A quiet confrontation with mortality. Oil on canvas. Munch Museum, Oslo.',
    objectPosition: 'top',
  },
  {
    file: '/artwork/self-portrait-with-cropped-hair-1940-Frida Kahlo.jpg',
    title: 'Self-Portrait with Cropped Hair',
    artist: 'Frida Kahlo, 1940',
    description: 'Painted after her divorce from Diego Rivera, Kahlo sits in an oversized man\'s suit, her famous hair shorn and scattered around her. The text above reads: "Look, if I loved you, it was for your hair. Now that you\'re bald, I don\'t love you anymore." Oil on canvas. MoMA, New York.',
  },
  {
    file: '/artwork/self-portrait-with-halo-1889-paul-gauguin.jpg',
    title: 'Self-Portrait with Halo',
    artist: 'Paul Gauguin, 1889',
    description: 'Gauguin painted himself as a saint — part irony, part genuine grandiosity. The serpent and forbidden fruit signal both temptation and spiritual authority. Oil on wood. National Gallery of Art, Washington.',
  },
  {
    file: '/artwork/the-scream.jpg!HD-edvard munch.jpg',
    title: 'The Scream',
    artist: 'Edvard Munch, 1893',
    description: 'The most recognisable expression of existential anxiety in art history. Munch wrote: "I sensed an infinite scream passing through nature." Tempera on cardboard. National Museum, Oslo.',
  },
  {
    file: '/artwork/Self Portrait with Thorn Necklace and Hummingbird, 1940, By Frida Kahlo.jpg',
    title: 'Self-Portrait with Thorn Necklace and Hummingbird',
    artist: 'Frida Kahlo, 1940',
    description: 'Kahlo wears a necklace of thorns drawing blood, a dead hummingbird as pendant — in Mexican folklore, hummingbirds bring luck in love. A black cat and spider monkey flank her shoulders. Painted the same year as her divorce from Diego Rivera. Oil on canvas. Blanton Museum of Art, Austin.',
    objectPosition: 'center',
  },
  {
    file: '/artwork/Self-Portrait with Unicorn - Winslow Remedios Varo, in 1957.jpg',
    title: 'Self-Portrait with Unicorn',
    artist: 'Remedios Varo, c.1957',
    description: 'The Spanish-Mexican Surrealist paints herself alongside a wild-eyed white unicorn against a deep red background of twisting trees. Varo updates the medieval unicorn tradition — part mythology, part sensuality, part self-invention. Oil on fabric panel. Private collection.',
    objectPosition: 'center',
  },
];

export default function HUL() {
  // Auth state
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [selectedStudy, setSelectedStudy] = useState('');

  // Artwork carousel
  const [artIdx, setArtIdx] = useState(0);
  const [artFade, setArtFade] = useState(true);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [queryCount, setQueryCount] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const queriesLeft = QUERY_LIMIT - queryCount;
  const [displayCount, setDisplayCount] = useState(queriesLeft);
  const [animating, setAnimating] = useState(false);

  // Artwork rotation
  useEffect(() => {
    const timer = setInterval(() => {
      setArtFade(false);
      setTimeout(() => {
        setArtIdx(i => (i + 1) % ARTWORKS.length);
        setArtFade(true);
      }, 1200);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Counter flip animation
  useEffect(() => {
    if (displayCount === queriesLeft) return;
    setAnimating(true);
    const timer = setTimeout(() => {
      setDisplayCount(queriesLeft);
      setAnimating(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [queriesLeft]);

  const handleLogin = async () => {
    if (!selectedStudy || !username || !password) {
      setAuthError('Please fill in all fields.');
      return;
    }
    try {
      const res = await fetch(
        `/api/chat?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&study=${encodeURIComponent(selectedStudy)}`
      );
      const data = await res.json();
      if (res.status === 401) {
        setAuthError('We couldn\'t find an account with those details. Please check your study selection, username and password.');
        return;
      }
      if (!res.ok) {
        setAuthError('Something went wrong. Please try again.');
        return;
      }
      setQueryCount(data.queryCount);
      setAuthed(true);
      setAuthError('');
    } catch {
      setAuthError('Could not connect. Please try again.');
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

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          study: selectedStudy,
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (data.queryCount !== undefined) {
        setQueryCount(data.queryCount);
        if (data.queryCount >= UPGRADE_THRESHOLD) setShowUpgrade(true);
        if (data.queryCount >= QUERY_LIMIT) setShowUpgrade(true);
      }
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
          .placard-wrap:hover .placard-expanded { display: block !important; }
          .placard-wrap:hover .placard-collapsed { border-radius: 6px 6px 0 0; }
          select.hul-input { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; }
          @media (max-width: 700px) { .hul-left { display: none !important; } .hul-right { width: 100% !important; } }
        `}</style>

        {/* Left — artwork */}
        <div className="hul-left" style={{ width: '50%', background: '#2a2520', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>

            {ARTWORKS.map((art, i) => (
              <div key={i} className="art-fade" style={{
                position: 'absolute', inset: 0,
                opacity: artIdx === i ? (artFade ? 1 : 0) : 0,
                transition: 'opacity 1.2s ease',
              }}>
                <img
                  src={art.file}
                  alt={art.title}
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: art.objectPosition || 'center',
                    display: 'block',
                  }}
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 40%, transparent 100%)',
                }}/>
              </div>
            ))}

            {/* Artwork placard - bottom left */}
            <div className="placard-wrap" style={{
              position: 'absolute', bottom: 80, left: 24,
              zIndex: 10,
            }}>
              <div className="placard-collapsed" style={{
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(8px)',
                borderRadius: 6,
                padding: '8px 12px',
                cursor: 'default',
              }}>
                <div style={{ fontFamily: 'Poppins, sans-serif',
                  fontWeight: 600, fontSize: 11, color: '#f0ede8',
                  letterSpacing: 0.5 }}>
                  {ARTWORKS[artIdx]?.title}
                </div>
                <div style={{ fontFamily: 'Poppins, sans-serif',
                  fontWeight: 400, fontSize: 10, color: '#c0c0c0',
                  marginTop: 2 }}>
                  {ARTWORKS[artIdx]?.artist}
                </div>
              </div>
              <div className="placard-expanded" style={{
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(8px)',
                borderRadius: 6,
                padding: '12px 14px',
                marginTop: 6,
                maxWidth: 260,
                display: 'none',
              }}>
                <div style={{ fontFamily: 'Poppins, sans-serif',
                  fontSize: 10, color: '#d0d0d0', lineHeight: 1.6 }}>
                  {ARTWORKS[artIdx]?.description}
                </div>
              </div>
            </div>

          </div>
          <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: '#f0ede8', opacity: 0.9 }}>doorbeen</div>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500, fontSize: 9, letterSpacing: 2, color: '#c0832e', marginTop: 4 }}>by make simple labs</div>
          </div>
        </div>

        {/* Right — login */}
        <div className="hul-right" style={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: '#f8f6f2' }}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <svg width="110" height="55" viewBox="0 0 110 55" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 12, display: 'block' }}>
                <circle cx="25" cy="27" r="25" fill="#1c1c1c"/>
                <circle cx="85" cy="27" r="25" fill="#1c1c1c"/>
              </svg>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 26, letterSpacing: 3, color: '#1c1c1c' }}>
                doorbeen
              </div>
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 10, letterSpacing: 2, color: '#c0832e' }}>
                by make simple labs
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Study</label>
                <select className="hul-input" value={selectedStudy} onChange={e => setSelectedStudy(e.target.value)}>
                  <option value="" disabled>choose study</option>
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
              <button className="hul-btn" onClick={handleLogin}>Log In</button>
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
        .full-report-btn { transition: background 0.15s, opacity 0.1s; }
        .full-report-btn:hover { background: rgba(200, 194, 187, 0.08) !important; cursor: pointer; }
        .full-report-btn:active { opacity: 0.7; }
      `}</style>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e8e4de', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 3, color: '#1c1c1c' }}>doorbeen</div>
          <div style={{ fontWeight: 500, fontSize: 10, letterSpacing: 2, color: '#c0832e', marginTop: 2 }}>by make simple labs</div>
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: '#1c1c1c', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
            {selectedStudy}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="/HUL-report.pdf"
            download
            className="full-report-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              border: '1px solid #b8b2ab',
              borderRadius: 6,
              background: 'none',
              fontSize: 11,
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 600,
              color: '#3d3a35',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="1" x2="6" y2="8"/>
              <polyline points="3,5.5 6,8.5 9,5.5"/>
              <line x1="1" y1="11" x2="11" y2="11"/>
            </svg>
            Full Report
          </a>
          <span style={{
            fontSize: 11,
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 500,
            color: queriesLeft <= 10 ? '#a63d2f' : '#3d3a35',
            whiteSpace: 'nowrap',
          }}>
            {queriesLeft} / {QUERY_LIMIT} queries remaining
          </span>
          <button
            onClick={() => { setAuthed(false); setMessages([]); setQueryCount(0); }}
            style={{
              background: 'none',
              border: '1px solid #e8e4de',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontFamily: 'Poppins, sans-serif',
              color: '#c0bbb5',
              cursor: 'pointer',
              opacity: 0.7,
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
          <a href="mailto:hello@makesimple.in?subject=doorbeen%20Research%20Access" style={{ fontSize: 12, fontWeight: 600, color: '#c0832e', textDecoration: 'none', whiteSpace: 'nowrap' }}>
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
          <a href="mailto:hello@makesimple.in?subject=doorbeen%20Research%20Access" style={{ fontSize: 13, fontWeight: 600, color: '#a63d2f', textDecoration: 'none' }}>
            Contact Make Simple Labs to continue
          </a>
        </div>
      )}

      {/* Input area */}
      <div style={{ background: '#fff', borderTop: '1px solid #e8e4de', padding: '16px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
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
            Powered by doorbeen · Make Simple Labs · Goa
          </div>
        </div>
      </div>
    </div>
  );
}
