import { useState } from "react";

const SAMPLE_BRIEFS = [
  {
    weekDate: "Week of May 19–25, 2026",
    weekSummary: "A solid week for SuperYou — taste and convenience are doing the heavy lifting, with Blinkit driving most of the positive chatter. But a quieter undercurrent is worth watching: a small but vocal cohort is starting to scrutinise the ingredient list, and The Whole Truth keeps getting name-dropped as the benchmark for transparency. Nothing alarming yet. Worth watching.",
    sentimentScore: 67,
    sentimentLabel: "Cautiously Positive",
    totalMentions: "340+",
    topMentions: [
      {
        platform: "Reddit",
        subreddit: "IndianFitness",
        upvotes: 47,
        quote: "Tried the SuperYou chocolate wafer from Blinkit yesterday — honestly surprised, doesn't taste like a protein product at all. Will definitely reorder.",
        doorbin_read: "Taste is beating expectations — 'doesn't taste like protein' is exactly the conversion trigger SuperYou needs from first-timers."
      },
      {
        platform: "Reddit",
        subreddit: "india",
        upvotes: 31,
        quote: "₹100 for 40g is a lot yaar. The Whole Truth at least tells you every ingredient clearly. SuperYou feels more like a celebrity brand than a health brand to me.",
        doorbin_read: "Price + transparency anxiety in one comment. This is the exact consumer SuperYou risks losing to TWF if ingredient communication doesn't sharpen."
      },
      {
        platform: "Instagram",
        subreddit: null,
        upvotes: 0,
        quote: "Protein cold foam at Starbucks with SuperYou?? Finally something that actually fits into my morning without feeling like a supplement.",
        doorbin_read: "The Starbucks collab is converting habitual coffee drinkers — this is the 'seamless lifestyle fit' positioning working exactly as intended."
      }
    ],
    consumerTension: {
      headline: "Loved for taste, questioned for trust.",
      body: "SuperYou has cracked the hardest thing in functional snacking — making protein feel indulgent. Consumers are genuinely delighted by the taste. But a second question is forming in a smaller, more influential cohort: 'But what's actually in it?' The Whole Truth has trained Indian consumers to expect radical transparency. SuperYou hasn't answered that question yet — and the longer it stays unanswered, the louder it will get."
    },
    competitorSignal: {
      brand: "The Whole Truth",
      signal: "TWF is being cited in multiple threads this week as the 'honest alternative' to celebrity protein brands. Their no-nonsense ingredient labelling is resonating with the ingredient-scrutiny crowd — the same cohort that's mildly sceptical about SuperYou's positioning."
    },
    oneThingToDo: {
      action: "Publish one piece of content this week that shows exactly what fermented yeast protein is — not polished, not marketing, just honest. A 60-second factory or lab explainer from Nikunj (not Ranveer) would do it.",
      rationale: "The ingredient curiosity wave is rising — answer it now on your own terms before a skeptical Reddit thread does it for you."
    },
    emergingTheme: "Searches around 'yeast protein side effects' and 'fermented yeast protein what is it' are growing — consumer education gap forming around SuperYou Pro."
  },
  {
    weekDate: "Week of May 19–25, 2026",
    weekSummary: "Mixed signals this week — the Starbucks collab is still generating warmth, but chips pricing got called out in two separate threads and the word 'overpriced' appeared 11 times across monitored sources. The taste story remains strong. The value story is the open wound.",
    sentimentScore: 54,
    sentimentLabel: "Mixed",
    totalMentions: "280+",
    topMentions: [
      {
        platform: "Reddit",
        subreddit: "Fitness_India",
        upvotes: 62,
        quote: "SuperYou chips are genuinely good but ₹100 for a small packet is not a daily snack, it's an occasion snack. I'd switch from Lay's permanently if the price was within reach.",
        doorbin_read: "This consumer wants to be a repeat buyer but the price is creating friction. They're stuck between aspiration and habit — classic accessible-premium trap."
      },
      {
        platform: "Reddit",
        subreddit: "IndianFitness",
        upvotes: 28,
        quote: "Ranveer's brand or not, the peanut butter wafer actually slaps. Had it post-workout, felt fine, didn't feel like I was eating cardboard protein stuff.",
        doorbin_read: "Post-purchase advocacy from a skeptic — the product is converting doubters, which matters more than fan praise."
      },
      {
        platform: "Instagram",
        subreddit: null,
        upvotes: 0,
        quote: "Tried the Super Masala chips — the masala flavour is SO good but I kind of wish there was a ₹30 mini pack option for everyday snacking.",
        doorbin_read: "Price point request with a ready solution: a ₹30 mini SKU could unlock daily purchase behaviour from consumers currently treating SuperYou as a treat."
      }
    ],
    consumerTension: {
      headline: "They want to say yes. The price says no.",
      body: "SuperYou has successfully created desire. The product reviews are warm, the flavours are landing, and first-timers are pleasantly surprised. But there's a ceiling. At ₹100/pack, consumers are mentally categorising SuperYou as an 'occasion' brand — not a daily snack. The Whole Truth solved this with multipacks and subscriptions. SuperYou hasn't yet. The question isn't whether consumers like it. It's whether the price lets them love it consistently."
    },
    competitorSignal: {
      brand: "Cosmix",
      signal: "Cosmix is gaining ground in the 'clean nutrition' conversation on Instagram with women 25-35, positioning around adaptogen-protein blends. Not a direct category competitor yet, but they're building trust equity with the same audience SuperYou wants long-term."
    },
    oneThingToDo: {
      action: "Test a ₹30–35 mini pack of the Super Masala chips on Blinkit for 2 weeks — price it as a daily snack, not a premium product.",
      rationale: "Multiple independent consumers this week asked for a smaller, cheaper format. This is a product gap, not a marketing problem — and it's easy to test."
    },
    emergingTheme: "The phrase 'celebrity brand' vs 'real nutrition brand' is appearing as a framing in discussions — early signal that authenticity perception needs active management."
  }
];

function AnimatedBar({ score }) {
  const color = score >= 65 ? "#4ade80" : score >= 45 ? "#facc15" : "#f87171";
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${score}%`, background: color,
        borderRadius: 99, boxShadow: `0 0 12px ${color}66`,
        transition: "width 1.4s cubic-bezier(.4,0,.2,1)"
      }} />
    </div>
  );
}

function PlatformBadge({ platform }) {
  const colors = {
    Reddit: { bg: "#ff4500", text: "#fff" },
    Instagram: { bg: "#e1306c", text: "#fff" },
    Twitter: { bg: "#1da1f2", text: "#fff" },
    News: { bg: "#6366f1", text: "#fff" },
  };
  const c = colors[platform] || { bg: "#334155", text: "#94a3b8" };
  return (
    <span style={{
      background: c.bg, color: c.text, fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 99, letterSpacing: 1, textTransform: "uppercase"
    }}>{platform}</span>
  );
}

export default function DoorbinPOC() {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [generated, setGenerated] = useState(false);

  const steps = [
    "Scanning Reddit threads...",
    "Pulling Instagram signals...",
    "Cross-referencing competitor mentions...",
    "Running sentiment analysis...",
    "Drawing conclusions...",
  ];

  const generate = async () => {
    setLoading(true);
    setBrief(null);
    setGenerated(false);
    for (let i = 0; i < steps.length; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, 800));
    }
    const picked = SAMPLE_BRIEFS[Math.floor(Math.random() * SAMPLE_BRIEFS.length)];
    setBrief(picked);
    setGenerated(true);
    setLoading(false);
  };

  const scoreColor = brief
    ? brief.sentimentScore >= 65 ? "#4ade80"
      : brief.sentimentScore >= 45 ? "#facc15" : "#f87171"
    : "#94a3b8";

  return (
    <div style={{
      minHeight: "100vh", background: "#080c14",
      fontFamily: "Georgia, 'Times New Roman', serif",
      color: "#e2e8f0", paddingBottom: 60,
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:28px; transition: border-color 0.3s; }
        .card:hover { border-color:rgba(99,102,241,0.3); }
        .reveal { animation: fadeUp 0.5s ease forwards; }
      `}</style>

      {/* Topbar */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "18px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.02)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #a855f7)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🔭</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, color: "#f8fafc" }}>DOORBIN</div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>Consumer Intelligence</div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: "#475569", fontFamily: "monospace",
          background: "rgba(255,255,255,0.03)", padding: "4px 12px",
          borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)"
        }}>CLIENT: SUPERYOU · ADITI JAIN</div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 0" }}>

        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#6366f1", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12 }}>Weekly Intelligence Brief</div>
          <h1 style={{ fontSize: 34, fontWeight: 400, lineHeight: 1.25, margin: 0, color: "#f8fafc", letterSpacing: -0.5 }}>
            What India is saying<br />
            <span style={{ color: "#6366f1", fontStyle: "italic" }}>about SuperYou.</span>
          </h1>
          <p style={{ color: "#64748b", marginTop: 14, fontSize: 14, lineHeight: 1.8, maxWidth: 520 }}>
            Doorbin monitors Reddit, Instagram, and the open web — then draws the conclusions that matter for your brand decisions. Delivered every Monday morning.
          </p>
        </div>

        {/* Button */}
        {!generated && (
          <button onClick={generate} disabled={loading} style={{
            background: loading ? "rgba(99,102,241,0.25)" : "linear-gradient(135deg,#6366f1,#a855f7)",
            color: "#fff", border: "none", borderRadius: 12, padding: "16px 36px",
            fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer",
            width: "100%", marginBottom: 24, letterSpacing: 0.5,
            boxShadow: loading ? "none" : "0 0 40px rgba(99,102,241,0.25)",
          }}>
            {loading
              ? <span style={{ animation: "pulse 1.2s infinite", display: "inline-block" }}>{steps[step]}</span>
              : "Generate This Week's Brief →"}
          </button>
        )}

        {/* Brief */}
        {brief && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Meta row */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", letterSpacing: 2 }}>{brief.weekDate.toUpperCase()}</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#334155" }} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: scoreColor, letterSpacing: 1 }}>{brief.sentimentLabel.toUpperCase()}</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#334155" }} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#475569" }}>{brief.totalMentions} MENTIONS TRACKED</span>
            </div>

            {/* Pulse */}
            <div className="card reveal" style={{ borderLeft: `3px solid ${scoreColor}` }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#475569", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 14 }}>The Pulse</div>
              <p style={{ fontSize: 15, lineHeight: 1.85, margin: "0 0 20px", color: "#cbd5e1", fontStyle: "italic" }}>
                "{brief.weekSummary}"
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}><AnimatedBar score={brief.sentimentScore} /></div>
                <div style={{ fontSize: 26, fontWeight: 300, color: scoreColor, fontFamily: "monospace", minWidth: 36 }}>{brief.sentimentScore}</div>
              </div>
            </div>

            {/* Mentions */}
            <div className="card reveal" style={{ animationDelay: "0.1s" }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#475569", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 18 }}>What People Are Actually Saying</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {brief.topMentions.map((m, i) => (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", paddingTop: i > 0 ? 20 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <PlatformBadge platform={m.platform} />
                      {m.subreddit && <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>r/{m.subreddit}</span>}
                      {m.upvotes > 0 && <span style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginLeft: "auto" }}>▲ {m.upvotes}</span>}
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: 14, color: "#94a3b8", lineHeight: 1.75, fontStyle: "italic" }}>"{m.quote}"</p>
                    <div style={{ background: "rgba(99,102,241,0.08)", borderLeft: "2px solid #6366f1", padding: "8px 14px", borderRadius: "0 8px 8px 0" }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "#818cf8" }}>DOORBIN → </span>
                      <span style={{ fontSize: 12, color: "#a5b4fc" }}>{m.doorbin_read}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tension */}
            <div className="card reveal" style={{ animationDelay: "0.2s", background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#6366f1", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 14 }}>The Tension This Week</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#f8fafc", marginBottom: 14, lineHeight: 1.3 }}>{brief.consumerTension.headline}</div>
              <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.85, margin: 0 }}>{brief.consumerTension.body}</p>
            </div>

            {/* Competitor + Emerging */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="card reveal" style={{ animationDelay: "0.3s" }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: "#475569", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12 }}>Competitor Signal</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 10 }}>{brief.competitorSignal.brand}</div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.75, margin: 0 }}>{brief.competitorSignal.signal}</p>
              </div>
              <div className="card reveal" style={{ animationDelay: "0.35s" }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: "#475569", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12 }}>Watch This Week</div>
                <p style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.75, margin: 0 }}>⚡ {brief.emergingTheme}</p>
              </div>
            </div>

            {/* Action */}
            <div className="card reveal" style={{
              animationDelay: "0.4s",
              background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(6,182,212,0.05))",
              borderColor: "rgba(16,185,129,0.25)"
            }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#10b981", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 14 }}>One Thing To Do This Week</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#f8fafc", marginBottom: 10, lineHeight: 1.4 }}>{brief.oneThingToDo.action}</div>
              <p style={{ fontSize: 13, color: "#6ee7b7", margin: 0, lineHeight: 1.75 }}>{brief.oneThingToDo.rationale}</p>
            </div>

            {/* Footer */}
            <div style={{ textAlign: "center", paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#1e293b", marginBottom: 16, letterSpacing: 1 }}>
                DOORBIN · CONSUMER INTELLIGENCE FOR INDIAN D2C BRANDS
              </div>
              <button onClick={() => { setBrief(null); setGenerated(false); }} style={{
                background: "transparent", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)",
                borderRadius: 8, padding: "10px 24px", fontSize: 13, cursor: "pointer",
                fontFamily: "monospace", letterSpacing: 1
              }}>↺ Generate Another Brief</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
