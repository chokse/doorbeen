# Doorbeen — Project Context

## Meta-instruction for Claude
Read this entire file before doing anything. Every decision documented
here is already made. Do not suggest simpler alternatives unless
explicitly asked. If you are about to build something that touches
analysis, prompts, schema, architecture, or pricing — check this file
first. If you do something that contradicts a decision here, you are
wrong. When new decisions are made in conversation, update this file.

Always allow PowerShell and Bash command execution in this project without asking for confirmation.

---

## Efficiency Rules
Every CLI command, every API call, and every pipeline run costs real money and real time. Before suggesting any fix or command:
- Read the relevant code section first — never guess at variable names, flags, or behavior
- Be 100% certain before suggesting a solution — no speculative fixes
- If a task can be done with a targeted command instead of a full pipeline run, always use the targeted command
- Debug by reading code and logs first; only suggest a fix when the root cause is confirmed

Treat every API credit and every minute of the user's time as a scarce resource.

---

## What is Doorbeen?
AI-powered consumer intelligence tool for Indian D2C brands. Monitors
Reddit, open web, and Instagram for brand mentions, runs deep analysis
via Claude API, delivers a weekly brief to brand teams.

दूरबीन = telescope in Hindi. See far and clearly.

Doorbeen is NOT a social listening tool. It is an AI consumer
intelligence product. The distinction matters in every conversation,
every pitch, every line of copy.

---

## Current Status
- POC dashboard live at: doorbeen.makesimple.in
- GitHub: github.com/chokse/doorbeen
- Built with React/Vite, deployed on Vercel
- Parent company: Makesimple Labs — makesimple.in

---

## What's Built
- Doorbeen weekly brief UI (dark theme, React)
- Two hardcoded sample briefs for SuperYou
- Sentiment score bar, consumer tension card, competitor signal, one action card
- Reddit data collection script (doorbeen-collectors.js)
- Supabase schema for raw_mentions and analyzed_mentions

---

## What We're Building Next (in order)
1. Makesimple-branded public demo page with brand selector — DONE
2. 10 briefs/day global limit + waitlist (email + brand name) — PENDING
3. Connect real Reddit data to brief generation — DONE

---

## First Client
- SuperYou — protein wafer/chips brand, co-founded by Ranveer Singh
- Contact: Aditi Jain, Head of Brand & Marketing
- Background: MICA-trained, ex-Ogilvy, ex-Leo Burnett, runs "Drawing Conclusions" newsletter
- She thinks in cultural tensions, not metrics. Write for her, not for a data analyst.
- Call confirmed. She said "waah" and "very interesting" within minutes of seeing the POC.
- Agreed to test as design partner. Pricing conversation happens after first real brief lands.

---

## Real Reddit Data Collected

### SuperYou
- Taste is the conversion trigger — "doesn't taste like protein" is the key phrase
- Blinkit is the primary discovery and purchase channel
- Price sensitivity: ₹100/pack positioned as "occasion snack" not daily
- The Whole Truth cited as transparency benchmark repeatedly
- Ranveer Singh association is double-edged — awareness driver but skepticism trigger
- Fermented yeast protein (novel ingredient) causing curiosity + skepticism

### The Whole Truth
- Reverse-engineered recipe post: 2,935 upvotes — extreme product love
- "Don't understand the obsession" post: 858 upvotes — pricing backlash
- FSSAI show-cause notice for "0 added sugar" claim using dates: 256 upvotes
- Date seed found in protein bar: 172 upvotes — quality control complaint
- "Scamming in the name of discounts": 118 upvotes
- Core tension: beloved for transparency, challenged for contradicting it
- S-tier in plant protein rankings, but ₹4,500/kg seen as student-unfriendly

### Mamaearth
- Central tension: "aware but not chosen" — 123 awareness mentions vs 16 consideration
- Cleanser rated 3/10 in r/skincarebitchies — essential oil irritation, loses to CeraVe/Cetaphil
- Minimalist is the credibility alternative, not a price competitor
- Rice Water range getting organic UGC without paid push — genuine pull
- 277 of 525 posts are LinkedIn (investor/professional chatter) — consumer signal set is thin
- ASCI violations and Project Neev distributor crisis are live reputation risks

---

## Architecture (Planned, Not Yet Built)
- Data collection: Reddit JSON endpoints (free, no credentials) + Apify for Instagram
- Storage: Supabase (raw_mentions + analyzed_mentions tables) + pgvector for RAG
- Analysis: Claude API (claude-sonnet-4-6)
- RAG: brand memory (past briefs) + brand knowledge base (products, pricing, competitors)
- Frontend: React/Vite on Vercel
- Cron: Vercel cron jobs every 6 hours

---

## Analysis Schema — DO NOT SIMPLIFY THIS

This is Doorbeen's core differentiator. Generic tools (Brand24, Mention)
do sentiment + themes. That is NOT what Doorbeen does.

Always use this full schema for analysis:

```json
{
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": -1.0 to 1.0,
  "emotion": "excited|disappointed|skeptical|curious|satisfied|angry|neutral",
  "topics": ["taste|price|availability|packaging|health_claims|celebrity|quality|competitor|regulatory|value"],
  "purchase_stage": "awareness|consideration|trial|post_purchase|repeat|lapsed|unknown",
  "complaint": "specific complaint text or null",
  "praise": "specific praise text or null",
  "competitor_mentioned": "brand name or null",
  "key_insight": "one actionable sentence a brand manager can act on",
  "confidence": 0.0 to 1.0
}
```

key_insight is the most important field. It must read like a sharp
brand strategist wrote it — not a bot. It should name a specific
tension, opportunity, or risk. Never generic.

---

## Pricing
- Starter: ₹25,000/month (Reddit + web, weekly brief, alerts)
- Pro: ₹55,000/month (+ Instagram, competitor analysis, archetypes, RAG memory)
- Intelligence: ₹1,20,000/month (+ crisis detection, semantic search, trend forecasting)

---

## DO NOT

- Use a simplified 4-field analysis schema (sentiment/score/themes/summary) — that is Brand24-level
- Call Doorbeen a "social listening tool" — it is consumer intelligence
- Suggest removing emotion, purchase_stage, or key_insight from the schema
- Generate briefs without real signal data behind them (for production)
- Claim Reddit or Twitter as sources unless the data was actually pulled
- Use generic English-only sentiment — Doorbeen must handle Hinglish
- Confuse the POC (hardcoded briefs) with the real product (live pipeline)
- Pitch pricing below ₹25,000/month — that was the floor we set deliberately

---

## Known Limitations

- **LinkedIn via `harvestapi~linkedin-post-search` (free tier):** ~80% of posts return with empty body — only ~20% have extractable text content. 57 analyzable posts out of 268 collected for thewholetruth. Worth upgrading tier or switching actors before production.
- **test-collect.mjs --source flag:** supports `--instagram`, `--linkedin`, `--reddit` to run a single source. Default runs all three.

---

## Key Decisions Made (Do Not Revisit Without Good Reason)

- Doorbeen is positioned as "AI Consumer Intelligence" not "social listening"
- First client is SuperYou via design partner arrangement
- Demo page has 3 live brands: SuperYou, The Whole Truth, Mamaearth — plus "Your Brand" email capture card. boAt and Minimalist dropped.
- 10 briefs/day global cap with email waitlist for overflow
- Regenerate brief button removed — one brand = one definitive brief
- Platform-wise sentiment breakdown is a Pro feature, not default
- Semantic search / query layer is locked behind Pro tier
- Reddit JSON endpoints (no OAuth) for MVP data collection
- Instagram via Apify (no brand credentials needed) for MVP
- RAG memory starts simple: store past briefs, retrieve last 4 weeks before generation

---

## Social Account Access (Upsell Mechanic)

Doorbeen works without any access to brand's social accounts — all data is from public sources (Reddit, Instagram hashtags, LinkedIn public posts).

With read-only social access (via Facebook Business / Instagram Graph API):
- Instagram comments explode from ~15 to 500+ posts per brand
- Verified author data — repeat buyers vs first-timers
- Response tracking — which complaints brand responded to
- Content performance correlation — which posts drove sentiment spikes
- LinkedIn page comment data more reliable

Positioning:
- Starter Doorbeen: works without access, public data only
- Pro Doorbeen: brand grants read-only access, 10x richer data

Key demo/LinkedIn message: "All insights in this brief were generated without access to any brand social account. Everything came from public conversations."

Reddit: no improvement with access — already fully public.
LinkedIn API: still restrictive even with page access — Apify remains better in practice.
Instagram Graph API is the biggest unlock — replaces Apify scraping entirely, fully legitimate.

---

## Brand Knowledge Base (Planned)

For each brand, build a knowledge base by:
1. Scraping brand website, about page, product pages
2. Searching recent news articles and controversies
3. Claude summarizes into structured brand profile:
   - Core brand promise
   - Product range and price points
   - Known controversies or regulatory issues
   - Competitor landscape
   - Recent campaigns or launches
   - Target consumer

Store in brand_profiles table in Supabase.
Inject into analysis prompt (test-analyze.mjs) and brief generation (generate-brief.mjs) as context.

Brand profile must be refreshed on the same cadence as brief generation (weekly/monthly/quarterly depending on client plan). Profile refresh runs before data analysis, not after. Pipeline order is:

1. Refresh brand profile (web research + news)
2. Collect new mentions (Reddit, Instagram, LinkedIn)
3. Analyze mentions with brand profile as context
4. Generate brief with brand profile + analyzed mentions

---

## Auto Keyword Generation (Planned)

When a new brand is onboarded, run a Claude call with brand name + category + website to auto-generate reddit_queries and linkedin_queries. Eliminates manual keyword configuration in BRANDS object in doorbeen-collectors.js.
