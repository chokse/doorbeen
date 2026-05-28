import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const BRANDS = [
  { name: 'SuperYou',        slug: 'superyou'      },
  { name: 'The Whole Truth', slug: 'thewholetruth' },
  { name: 'Mamaearth',       slug: 'mamaearth'     },
];

// ── Change 3: Loading step messages ──────────────────────────────────────────
const LOADING_STEPS = [
  'Scanning Reddit threads…',
  'Pulling LinkedIn signals…',
  'Pulling Instagram signals…',
  'Running sentiment analysis…',
  'Drawing conclusions…',
];

const EMOTION_COLORS = {
  curious:      '#2E5F8A',
  excited:      '#4A7C59',
  skeptical:    '#C49A2B',
  angry:        '#A63D2F',
  disappointed: '#8B6F5E',
  satisfied:    '#4A7C59',
  neutral:      '#9B9B9B',
};

// ── Change 6: Sentiment category label + color ────────────────────────────────
function getSentimentCategory(score) {
  if (score <= 30) return { label: 'Critical',            color: '#A63D2F' };
  if (score <= 50) return { label: 'Mixed',               color: '#C49A2B' };
  if (score <= 65) return { label: 'Cautiously Positive', color: '#C49A2B' };
  if (score <= 80) return { label: 'Positive',            color: '#4A7C59' };
  return               { label: 'Strong',               color: '#4A7C59' };
}

// ── Platform logos ────────────────────────────────────────────────────────
const PLATFORM_LOGOS = {
  Reddit:    'https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png',
  Instagram: 'https://static.cdninstagram.com/rsrc.php/v3/yI/r/VsNE-OHk_8a.png',
  LinkedIn:  'https://cdn-icons-png.flaticon.com/512/174/174857.png',
};

function PlatformLogo({ platform }) {
  const src = PLATFORM_LOGOS[platform];
  if (!src) return null;
  return (
    <img src={src} width="20" height="20" alt={platform}
      style={{ borderRadius: 4, flexShrink: 0, display: 'block' }} />
  );
}

// ── Shared components ──────────────────────────────────────────────────────

function AnimatedBar({ score }) {
  const color = score >= 65 ? '#4A7C59' : score >= 45 ? '#C49A2B' : '#A63D2F';
  return (
    <div style={{ background: '#E8E2DA', borderRadius: 99, height: 5, width: '100%', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${score}%`, background: color,
        borderRadius: 99, transition: 'width 1.4s cubic-bezier(.4,0,.2,1)',
      }} />
    </div>
  );
}

function HorizBar({ label, value, total, color, animate }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{
        fontFamily: 'Poppins, sans-serif', fontSize: 13, color: '#1A1A1A',
        width: 120, flexShrink: 0, textTransform: 'capitalize',
      }}>
        {label}
      </div>
      <div style={{ flex: 1, background: '#E8E2DA', borderRadius: 99, height: 7, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: animate ? `${pct}%` : '0%',
          background: color, borderRadius: 99,
          transition: 'width 0.8s ease',
        }} />
      </div>
      <div style={{
        fontFamily: 'Poppins, sans-serif', fontSize: 12, color: '#9B9B9B',
        width: 32, textAlign: 'right', flexShrink: 0,
      }}>
        {pct}%
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Doorbeen() {
  const [selectedBrand,   setSelectedBrand]   = useState(null);
  const [brief,           setBrief]           = useState(null);
  const [periodLabel,     setPeriodLabel]     = useState('Last 30 days');
  const [loading,         setLoading]         = useState(false);
  const [loadingStep,     setLoadingStep]     = useState(-1);   // Change 3
  const [showAct2,        setShowAct2]        = useState(false);
  const [barsReady,       setBarsReady]       = useState(false);
  const [scrolled,        setScrolled]        = useState(false);
  const [brandInput,      setBrandInput]      = useState('');
  const [briefTriggered,  setBriefTriggered]  = useState(false);
  const [showYourBrand,  setShowYourBrand]  = useState(false);
  const [inlineEmail,    setInlineEmail]    = useState('');
  const [leadSubmitted,  setLeadSubmitted]  = useState(false);
  const [leadError,      setLeadError]      = useState(null);

  const act2Ref  = useRef(null);
  const briefRef = useRef(null);  // Change 4: auto-scroll target

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (showAct2) {
      setTimeout(() => setBarsReady(true), 100);
      setTimeout(() => act2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } else {
      setBarsReady(false);
    }
  }, [showAct2]);

  // Selecting a brand only highlights the card — brief loads on explicit button click
  const selectBrand = (brand) => {
    setSelectedBrand(brand);
    setShowYourBrand(false);
    setBrief(null);
    setShowAct2(false);
    setBarsReady(false);
    setLoading(false);
    setLoadingStep(-1);
    setBriefTriggered(false);
  };

  // Triggered by "Generate Brief →" button
  const generateBrief = async () => {
    setBriefTriggered(true);
    setBrief(null);
    setShowAct2(false);
    setBarsReady(false);
    setLoading(true);
    setLoadingStep(0);

    // Fetch from Supabase in parallel with the animation
    const fetchPromise = supabase
      .from('briefs')
      .select('brief_json, period_label')
      .eq('brand', selectedBrand.slug)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    // Animate through each step (800ms each)
    for (let i = 0; i < LOADING_STEPS.length; i++) {
      setLoadingStep(i);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Wait for Supabase to resolve (if still pending)
    const { data } = await fetchPromise;

    setBrief(data?.brief_json ?? null);
    setPeriodLabel(data?.period_label ?? 'Last 30 days');
    setLoading(false);
    setLoadingStep(-1);

    setTimeout(() => briefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const selectYourBrand = () => {
    setShowYourBrand(true);
    setSelectedBrand(null);
    setBrief(null);
    setLoading(false);
    setLoadingStep(-1);
    setShowAct2(false);
    setBarsReady(false);
    setInlineEmail('');
    setLeadSubmitted(false);
    setLeadError(null);
    setBriefTriggered(false);
  };

  const submitLead = async () => {
    const { error } = await supabase
      .from('leads')
      .insert({ email: inlineEmail, source: 'your_brand' });
    if (error) {
      setLeadError('Something went wrong. Email us at hello@makesimple.in');
    } else {
      setLeadSubmitted(true);
    }
  };

  const act1 = brief?.act1;
  const act2  = brief?.act2;

  // Change 5: include optional url from brief_json top_mentions
  const mentions = brief ? [
    {
      platform:   'Reddit',
      quote:      act1.top_tension,
      annotation: act2?.top_insights?.[0] ?? null,
      url:        brief?.top_mentions?.[0]?.url ?? null,
    },
    {
      platform:   'Instagram',
      quote:      act1.top_praise,
      annotation: act2?.top_insights?.[1] ?? null,
      url:        brief?.top_mentions?.[1]?.url ?? null,
    },
    act1.competitor_signal?.signal
      ? {
          platform:   'LinkedIn',
          quote:      act1.competitor_signal.signal,
          annotation: act2?.top_insights?.[2] ?? null,
          url:        brief?.top_mentions?.[2]?.url ?? null,
        }
      : null,
  ].filter(Boolean) : [];

  const emotionTotal = act2 ? Object.values(act2.emotion_breakdown).reduce((a, b) => a + b, 0) : 0;
  const stageTotal   = act2 ? Object.values(act2.purchase_stage_distribution).reduce((a, b) => a + b, 0) : 0;

  const sentimentLabel = act1
    ? act1.sentiment_score >= 65 ? 'Positive'
    : act1.sentiment_score >= 45 ? 'Mixed'
    : 'Needs Attention'
    : '';

  // Change 6: category for The Pulse sentiment block
  const sentimentCat = act1 ? getSentimentCategory(act1.sentiment_score) : null;

  // Fix 5: crisis flag — low score but more positive than negative emotions
  const positiveEmotions = (act2?.emotion_breakdown?.excited ?? 0) + (act2?.emotion_breakdown?.satisfied ?? 0);
  const negativeEmotions  = (act2?.emotion_breakdown?.angry   ?? 0) + (act2?.emotion_breakdown?.disappointed ?? 0);
  const showCrisisFlag    = act1?.sentiment_score < 40 && positiveEmotions > negativeEmotions;
  if (showCrisisFlag) {
    console.warn(
      `[Doorbeen] Low sentiment score (${act1.sentiment_score}) for brand with more positive (${positiveEmotions}) than negative (${negativeEmotions}) emotions — score reflects crisis signals in the data, not overall mood.`
    );
  }

  const ds = act2?.data_sources;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)' }}>

      {/* ── Global styles ─────────────────────────────────────────────── */}
      <style>{`
        :root {
          --bg:            #F5F0EB;
          --bg-card:       #FDFAF7;
          --bg-dark:       #2C2C2C;
          --text-primary:  #1A1A1A;
          --text-secondary:#6B6B6B;
          --text-muted:    #9B9B9B;
          --accent-warm:   #A63D2F;
          --border:        #E8E2DA;
          --border-strong: #C8BFB5;
        }
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .reveal   { animation: fadeUp 0.5s ease both; }
        .reveal-1 { animation: fadeUp 0.5s 0.10s ease both; }
        .reveal-2 { animation: fadeUp 0.5s 0.20s ease both; }
        .reveal-3 { animation: fadeUp 0.5s 0.30s ease both; }
        .reveal-4 { animation: fadeUp 0.5s 0.40s ease both; }
        .reveal-5 { animation: fadeUp 0.5s 0.50s ease both; }

        /* Change 3: loading step animation */
        @keyframes stepPulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1;    }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
        .loading-step-text {
          animation: stepPulse 1.6s ease infinite;
        }

        /* Change 8: non-clickable content cards — no translateY, default cursor */
        .card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px;
          cursor: default;
          transition: border-color 0.2s;
        }
        .card:hover { border-color: var(--border-strong); }

        .brand-card {
          background: #FDFAF7;
          border: 1px solid #E8E2DA;
          border-radius: 12px;
          padding: 20px 24px;
          min-height: 64px;
          min-width: 0;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .brand-card:hover { border-color: #A63D2F; }
        .brand-card.selected { background: #1A1A1A; border: 2px solid #1A1A1A; }


        .insight-row {
          display: flex;
          gap: 16px;
          padding: 14px 14px;
          border-bottom: 1px solid var(--border);
          border-left: 2px solid transparent;
          transition: border-left-color 0.2s;
        }
        .insight-row:last-child { border-bottom: none; }
        .insight-row:hover { border-left-color: var(--accent-warm); }
        .insight-row:hover .insight-num { color: var(--accent-warm); }

        .makesimple-strip span { transition: color 0.2s; }
        .makesimple-strip:hover span { color: var(--accent-warm) !important; }

        .inline-input:focus { outline: none; border-color: #A63D2F !important; }

        /* Change 5: source link */
        .source-link {
          font-family: 'Poppins', sans-serif;
          font-size: 12px;
          color: #A63D2F;
          text-decoration: none;
          display: inline-block;
          margin-top: 10px;
        }
        .source-link:hover { text-decoration: underline; }

        /* ── Mobile ──────────────────────────────────────────────── */
        @media (max-width: 600px) {

          /* 1. Brand selector — single column on mobile */
          .brand-grid {
            grid-template-columns: 1fr !important;
          }
          .brand-card {
            min-width: 0;
            grid-column: span 1 !important;
          }

          /* 2. Archetype cards — single column */
          .archetype-grid {
            grid-template-columns: 1fr !important;
          }

          /* 3. Any explicit 2-column grid (competitor signal, future panels) */
          .two-col-grid {
            grid-template-columns: 1fr !important;
          }

          /* 4. Data sources row — stack label above platform chips */
          .data-sources-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .data-sources-row > span {
            margin-right: 0 !important;
            flex-shrink: 1 !important;
          }
          .data-sources-chips {
            flex-wrap: wrap !important;
            gap: 10px !important;
          }

          /* 5. CTA inputs — full width, stacked */
          .cta-input-row {
            flex-direction: column !important;
          }
          .cta-input-row input {
            min-width: 0 !important;
            width: 100% !important;
          }

          /* 6. Page containers — 16px side padding */
          .page-col {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
          .card {
            padding: 20px !important;
          }

          /* 7. Topbar */
          header {
            padding: 14px 16px !important;
          }

          /* Misc: scale down hero headline */
          .hero-headline {
            font-size: 30px !important;
          }
          .cta-headline {
            font-size: 28px !important;
          }
          .cta-section {
            padding: 56px 16px !important;
          }
        }
      `}</style>

      {/* ── TOPBAR ────────────────────────────────────────────────────── */}
      {/* Changes 1 + 2: DOORBEEN letterSpacing 3, "by Make Simple Labs" weight 600 color #6B6B6B letterSpacing 2 */}
      <header style={{
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.06)' : 'none',
        transition: 'box-shadow 0.3s',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: 3, color: '#1A1A1A' }}>
            doorbeen
          </div>
          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 10, letterSpacing: 2, color: '#6B6B6B' }}>
            by make simple labs
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <div className="page-col" style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 18 }}>
          Weekly Consumer Intelligence
        </div>
        <h1 className="hero-headline" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: 42, color: 'var(--text-primary)', lineHeight: 1.2, margin: '0 0 18px' }}>
          What India is saying<br />about your brand.
        </h1>
        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.85, maxWidth: 520, margin: '0 0 8px' }}>
          We track Reddit, Instagram, and LinkedIn for brand mentions, put them through Doorbeen's analysis engine, and deliver a weekly brief to your team.
        </p>
        {/* Change 9: powered by line */}
        <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500, fontSize: 13, color: '#A63D2F', margin: '0 0 56px' }}>
          Built on public conversations. No surveys. No brand access needed.
        </p>

        <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, letterSpacing: 0.3 }}>
          Select a brand
        </div>
        <div style={{ marginBottom: 72 }}>
          <div className="brand-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {BRANDS.map(brand => (
              <div
                key={brand.slug}
                className={`brand-card${selectedBrand?.slug === brand.slug ? ' selected' : ''}`}
                onClick={() => selectBrand(brand)}
              >
                <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: selectedBrand?.slug === brand.slug ? '#fff' : '#1A1A1A', textAlign: 'center' }}>
                  {brand.name}
                </div>
              </div>
            ))}

            {/* ── YOUR BRAND — 5th card, centered under 2×2 ─────────── */}
            <div
              className={`brand-card${showYourBrand ? ' selected' : ''}`}
              onClick={selectYourBrand}
            >
              <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: showYourBrand ? '#fff' : '#1A1A1A', textAlign: 'center' }}>
                Your Brand
              </div>
            </div>
          </div>

          {/* Generate Brief button — shows before click and cycles steps during loading */}
          {selectedBrand && (!briefTriggered || loading) && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button
                onClick={loading ? undefined : generateBrief}
                disabled={loading}
                style={{
                  background: '#1A1A1A', color: '#fff',
                  fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15,
                  borderRadius: 8, padding: '16px 40px',
                  border: 'none', cursor: loading ? 'default' : 'pointer',
                  width: '100%', maxWidth: 300,
                  transition: 'background 0.2s',
                  opacity: loading ? 0.85 : 1,
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#333'; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#1A1A1A'; }}
              >
                {loading && loadingStep >= 0 ? LOADING_STEPS[loadingStep] : 'Generate Brief →'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── YOUR BRAND INLINE FORM ────────────────────────────────────── */}
      {showYourBrand && (
        <div className="page-col" style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{
            maxWidth: 600, margin: '0 auto', padding: 40,
            background: '#FDFAF7', border: '1px solid #E8E2DA',
            borderRadius: 16, textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontSize: 11, fontVariant: 'small-caps', color: '#9B9B9B', letterSpacing: 2, marginBottom: 16 }}>
              Get Doorbeen for your brand
            </div>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 22, color: '#1A1A1A', marginBottom: 8 }}>
              Your consumers are talking.
            </div>
            <div style={{ fontFamily: 'Poppins, sans-serif', fontSize: 15, color: '#6B6B6B', marginBottom: 32, lineHeight: 1.7 }}>
              We monitor Reddit, Instagram, and LinkedIn — and turn what they're saying into a weekly brief your team can act on.
            </div>

            {leadSubmitted ? (
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
                We'll be in touch within 48 hours.
              </p>
            ) : (
              <>
                <input
                  className="inline-input"
                  type="email"
                  placeholder="your work email"
                  value={inlineEmail}
                  onChange={e => setInlineEmail(e.target.value)}
                  style={{
                    width: '100%', fontFamily: 'Poppins, sans-serif', fontSize: 14,
                    padding: '14px 18px', border: '1px solid #E8E2DA', borderRadius: 8,
                    marginBottom: 16, background: '#fff', color: '#1A1A1A', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                />
                <button
                  onClick={submitLead}
                  style={{
                    width: '100%', fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15,
                    padding: 16, background: '#A63D2F', color: '#fff', border: 'none',
                    borderRadius: 8, cursor: 'pointer', transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#8B3225'}
                  onMouseLeave={e => e.currentTarget.style.background = '#A63D2F'}
                >
                  Request a Brief
                </button>
                {leadError && (
                  <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 13, color: '#A63D2F', marginTop: 12, marginBottom: 0 }}>
                    {leadError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── BRIEF ─────────────────────────────────────────────────────── */}
      {selectedBrand && briefTriggered && !loading && (
        <div ref={briefRef} className="page-col" style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 80px' }}>

          {!brief && (
            <div className="card">
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontStyle: 'italic', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.85, margin: 0 }}>
                Brief coming soon. We're collecting data for this brand.
              </p>
            </div>
          )}

          {brief && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* META ROW */}
              <div className="reveal" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase' }}>
                  {periodLabel}
                </span>
                <span style={{ color: 'var(--border-strong)' }}>·</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {sentimentLabel}
                </span>
                {ds?.total > 0 && <>
                  <span style={{ color: 'var(--border-strong)' }}>·</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', letterSpacing: 1 }}>
                    {ds.total} conversations
                  </span>
                </>}
              </div>

              {/* DATA SOURCES ROW */}
              {ds && (
                <div className="reveal data-sources-row" style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)',
                    letterSpacing: 2, textTransform: 'uppercase', marginRight: 20, flexShrink: 0,
                  }}>
                    Data collected over {periodLabel.toLowerCase()}
                  </span>
                  <div className="data-sources-chips" style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                    {ds.reddit > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <PlatformLogo platform="Reddit" />
                        <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{ds.reddit}</span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)' }}>reddit</span>
                      </div>
                    )}
                    {ds.reddit > 0 && ds.instagram > 0 && (
                      <span style={{ fontFamily: 'Inter, sans-serif', color: 'var(--border-strong)', margin: '0 14px' }}>·</span>
                    )}
                    {ds.instagram > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <PlatformLogo platform="Instagram" />
                        <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{ds.instagram}</span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)' }}>instagram</span>
                      </div>
                    )}
                    {ds.instagram > 0 && ds.linkedin > 0 && (
                      <span style={{ fontFamily: 'Inter, sans-serif', color: 'var(--border-strong)', margin: '0 14px' }}>·</span>
                    )}
                    {ds.linkedin > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <PlatformLogo platform="LinkedIn" />
                        <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{ds.linkedin}</span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)' }}>linkedin</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* THE PULSE */}
              <div className="card reveal-1" style={{ borderLeft: '3px solid var(--accent-warm)' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                  The Pulse
                </div>
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.85, margin: '0 0 24px' }}>
                  "{act1.week_summary}"
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <AnimatedBar score={act1.sentiment_score} />
                  </div>
                  {/* Change 6: sentiment category label above score */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    {sentimentCat && (
                      <div style={{
                        fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 13,
                        color: sentimentCat.color, marginBottom: 3,
                      }}>
                        {sentimentCat.label}
                      </div>
                    )}
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 }}>
                      Sentiment Score
                    </div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 28, color: 'var(--accent-warm)', lineHeight: 1 }}>
                      {act1.sentiment_score}/100
                    </div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' }}>
                      0 = very negative · 100 = very positive
                    </div>
                    {showCrisisFlag && (
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--text-muted)', marginTop: 6, maxWidth: 170, lineHeight: 1.45, textAlign: 'right' }}>
                        Score reflects crisis signals in data
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* WHAT PEOPLE ARE ACTUALLY SAYING */}
              <div className="card reveal-2">
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
                  What People Are Actually Saying
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {mentions.map((m, i) => (
                    <div key={i} style={{
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      paddingTop: i > 0 ? 24 : 0,
                      paddingBottom: i < mentions.length - 1 ? 24 : 0,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <PlatformLogo platform={m.platform} />
                      </div>
                      <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 12px' }}>
                        "{m.quote}"
                      </p>
                      {m.annotation && (
                        <div style={{
                          borderLeft: '2px solid var(--accent-warm)',
                          background: 'rgba(166,61,47,0.04)',
                          padding: '14px 18px', borderRadius: '0 8px 8px 0',
                        }}>
                          <span style={{
                            fontFamily: 'Poppins, sans-serif',
                            fontSize: 14, color: 'var(--accent-warm)', fontWeight: 600,
                          }}>
                            DOORBEEN →{' '}
                          </span>
                          <span style={{
                            fontFamily: 'Poppins, sans-serif',
                            fontSize: 14, color: '#4A4A4A', fontWeight: 400,
                          }}>
                            {m.annotation}
                          </span>
                        </div>
                      )}
                      {/* Change 5: source link */}
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="source-link">
                          View original post →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* THE TENSION */}
              <div className="card reveal-3" style={{ background: 'rgba(166,61,47,0.04)', border: '1px solid rgba(166,61,47,0.2)' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--accent-warm)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                  The Tension
                </div>
                <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 20, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 18 }}>
                  {act1.top_tension}
                </div>
                <div style={{ borderTop: '1px solid rgba(166,61,47,0.15)', paddingTop: 16 }}>
                  <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.75, margin: 0 }}>
                    {act1.top_praise}
                  </p>
                </div>
              </div>

              {/* COMPETITOR SIGNAL */}
              <div className="card reveal-3">
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                  Competitor Signal
                </div>
                <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--accent-warm)', marginBottom: 12 }}>
                  {act1.competitor_signal?.brand}
                </div>
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.75, margin: 0 }}>
                  {act1.competitor_signal?.signal}
                </p>
              </div>

              {/* ONE THING TO DO — Change 7: padding 40px, action 22px, border 2px */}
              <div className="card reveal-4" style={{
                padding: 40,
                background: 'linear-gradient(135deg, rgba(74,124,89,0.06), rgba(74,124,89,0.02))',
                border: '2px solid rgba(74,124,89,0.4)',
              }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#4A7C59', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                  One Thing To Do
                </div>
                <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 22, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: 12 }}>
                  {act1.one_thing_to_do?.action}
                </div>
                <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.75, margin: 0 }}>
                  {act1.one_thing_to_do?.rationale}
                </p>
              </div>

              {/* SEE DEEPER INSIGHTS */}
              {!showAct2 && (
                <button
                  onClick={() => setShowAct2(true)}
                  style={{
                    width: '100%', background: 'transparent',
                    border: '1px solid var(--accent-warm)', color: 'var(--accent-warm)',
                    fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 13,
                    letterSpacing: 1, padding: '16px', borderRadius: 12,
                    cursor: 'pointer', marginTop: 8, transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(166,61,47,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  SEE DEEPER INSIGHTS →
                </button>
              )}

              {/* ── ACT 2 ──────────────────────────────────────────────── */}
              {showAct2 && act2 && (
                <div ref={act2Ref} style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 8 }}>

                  {/* EMOTION BREAKDOWN */}
                  <div className="card reveal-1">
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
                      How People Are Feeling
                    </div>
                    {Object.entries(act2.emotion_breakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([emotion, count]) => (
                        <HorizBar
                          key={emotion}
                          label={emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                          value={count}
                          total={emotionTotal}
                          color={EMOTION_COLORS[emotion] || '#9B9B9B'}
                          animate={barsReady}
                        />
                      ))}
                  </div>

                  {/* CONSUMER ARCHETYPES */}
                  <div className="card reveal-2">
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
                      Who's Talking About This Brand
                    </div>
                    <div className="archetype-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                      {act2.consumer_archetypes?.slice(0, 3).map((arch, i) => (
                        <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
                          <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {arch.name}
                          </div>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--accent-warm)', marginBottom: 12 }}>
                            {arch.size}
                          </div>
                          <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
                            {arch.description}
                          </p>
                          <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginTop: 14 }}>
                            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
                              {arch.signal}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* PURCHASE STAGE */}
                  <div className="card reveal-3">
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
                      Where Consumers Are In Their Journey
                    </div>
                    {['awareness', 'consideration', 'trial', 'post_purchase', 'repeat', 'lapsed'].map(stage => (
                      <HorizBar
                        key={stage}
                        label={stage.replace('_', ' ')}
                        value={act2.purchase_stage_distribution[stage] || 0}
                        total={stageTotal}
                        color="#2E5F8A"
                        animate={barsReady}
                      />
                    ))}
                  </div>

                  {/* TOP INSIGHTS */}
                  <div className="card reveal-4">
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
                      What Doorbeen Found
                    </div>
                    <div>
                      {act2.top_insights?.map((insight, i) => (
                        <div key={i} className="insight-row">
                          <div className="insight-num" style={{
                            fontFamily: 'Inter, sans-serif', fontSize: 28,
                            color: 'var(--border-strong)', lineHeight: 1,
                            minWidth: 36, paddingTop: 3, transition: 'color 0.2s', flexShrink: 0,
                          }}>
                            {String(i + 1).padStart(2, '0')}
                          </div>
                          <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, margin: 0 }}>
                            {insight}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MAKESIMPLE STRIP ──────────────────────────────────────────── */}
      <a href="https://makesimple.in" target="_blank" rel="noopener noreferrer"
        className="makesimple-strip"
        style={{
          display: 'block', width: '100%',
          background: '#F0EBE3', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
          padding: '24px 20px', textAlign: 'center', textDecoration: 'none',
        }}
      >
        <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontStyle: 'italic', fontSize: 13, color: '#4A4A4A' }}>
          doorbeen, 2026<br />make simple labs, Goa
        </span>
      </a>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <div className="cta-section" style={{ background: 'var(--bg-dark)', padding: '80px 40px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9B9B9B', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 24 }}>
            Get This For Your Brand
          </div>
          <h2 className="cta-headline" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: 38, color: '#FFFFFF', lineHeight: 1.2, margin: 0 }}>
            Your consumers are talking.
          </h2>
          <h2 className="cta-headline" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: 38, color: 'var(--accent-warm)', lineHeight: 1.2, margin: '0 0 24px' }}>
            Are you listening?
          </h2>
          <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 15, color: '#9B9B9B', lineHeight: 1.85, maxWidth: 480, margin: '0 auto 40px' }}>
            We monitor what consumers say about your brand across Reddit, Instagram, and LinkedIn. We turn it into a weekly brief your team can act on.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, margin: '0 auto' }}>
            {leadSubmitted ? (
              <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 400, fontSize: 15, color: '#9B9B9B', margin: 0, textAlign: 'center' }}>
                We'll be in touch.
              </p>
            ) : (
              <>
                <input
                  type="email" placeholder="your@email.com"
                  value={inlineEmail} onChange={e => setInlineEmail(e.target.value)}
                  style={{
                    width: '100%', background: '#3D3D3D', border: '1px solid #4D4D4D',
                    color: '#FFFFFF', fontFamily: 'Poppins, sans-serif', fontSize: 14,
                    padding: '14px 18px', borderRadius: 8, outline: 'none', transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#A63D2F'}
                  onBlur={e => e.target.style.borderColor = '#4D4D4D'}
                />
                <button
                  onClick={submitLead}
                  style={{
                    background: '#A63D2F', color: '#FFFFFF',
                    fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 15,
                    border: 'none', padding: '16px', borderRadius: 8,
                    cursor: 'pointer', width: '100%', transition: 'background 0.2s', letterSpacing: 0.5,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#8B3225'}
                  onMouseLeave={e => e.currentTarget.style.background = '#A63D2F'}
                >
                  Request a Brief
                </button>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
