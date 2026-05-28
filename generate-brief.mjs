// generate-brief.mjs
// Reads analyzed_mentions for a brand, aggregates into a signal package,
// calls Claude to generate a structured brief, saves to Supabase, prints JSON.
//
// Run with: node --env-file=.env generate-brief.mjs <brand>
// Examples: node --env-file=.env generate-brief.mjs thewholetruth
//           node --env-file=.env generate-brief.mjs superyou
//
// ── Supabase: run this once to create the briefs table ───────────────────────
// CREATE TABLE briefs (
//   id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   brand         TEXT NOT NULL,
//   period_label  TEXT,
//   generated_at  TIMESTAMPTZ DEFAULT NOW(),
//   brief_json    JSONB
// );
// CREATE INDEX idx_briefs_brand ON briefs(brand);
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Env check ─────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

// ── Brand from CLI arg ─────────────────────────────────────────────────────────
const BRAND = process.argv[2];
if (!BRAND) {
  console.error('Usage: node --env-file=.env generate-brief.mjs <brand>');
  console.error('Example: node --env-file=.env generate-brief.mjs thewholetruth');
  process.exit(1);
}

const BRAND_DISPLAY_NAMES = {
  thewholetruth: 'The Whole Truth',
  superyou:      'SuperYou',
  mamaearth:     'Mamaearth',
};
const BRAND_NAME = BRAND_DISPLAY_NAMES[BRAND] ?? BRAND;

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// claude-sonnet-4-20250514 returns 404 — claude-sonnet-4-6 is the working alias
const MODEL = 'claude-sonnet-4-6';

// ── Helpers ───────────────────────────────────────────────────────────────────
function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const val = item[key] ?? 'unknown';
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

function topN(countObj, n) {
  return Object.entries(countObj)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
}

function extractJson(text) {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  if (stripped.startsWith('{')) return stripped;
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return stripped;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log(' Doorbeen — Brief Generator');
console.log(` Brand  : ${BRAND_NAME} (${BRAND})`);
console.log(` Model  : ${MODEL}`);
console.log(` Started: ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════');

// ── Step 1: Fetch analyzed_mentions (joined with raw_mentions for URL + content) ──
console.log('\n── Step 1: Fetching analyzed_mentions…');

const { data: mentions, error: fetchErr } = await supabase
  .from('analyzed_mentions')
  .select('*, raw_mentions!raw_mention_id(url, title, body, score)')
  .eq('brand', BRAND);

if (fetchErr) {
  console.error('Failed to fetch analyzed_mentions:', fetchErr.message);
  process.exit(1);
}

if (!mentions?.length) {
  console.error('No analyzed mentions found for brand:', BRAND);
  process.exit(1);
}

console.log(`  Found ${mentions.length} analyzed posts`);

// ── Step 1b: Fetch latest brand profile ───────────────────────────────────────
console.log('\n── Step 1b: Fetching brand profile…');

const { data: brandProfile } = await supabase
  .from('brand_profiles')
  .select('profile_json, refreshed_at')
  .eq('brand', BRAND)
  .order('refreshed_at', { ascending: false })
  .limit(1)
  .single();

if (brandProfile?.profile_json) {
  console.log(`  Found profile (refreshed: ${brandProfile.refreshed_at})`);
} else {
  console.log('  No brand profile found — proceeding without context');
}

// ── Step 2: Aggregate ─────────────────────────────────────────────────────────
console.log('\n── Step 2: Aggregating signal data…');

// Sentiment counts
const sentimentCounts = countBy(mentions, 'sentiment');

// Emotion counts
const emotionCounts = countBy(mentions, 'emotion');

// Purchase stage counts
const stageCounts = countBy(mentions, 'purchase_stage');

// Top 10 themes — flatten topics TEXT[] arrays
const allTopics = mentions.flatMap(m => Array.isArray(m.topics) ? m.topics : []);
const topicCounts = allTopics.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
const top10Themes = topN(topicCounts, 10);

// Top 15 key insights — filter noise, sort by confidence descending
const noiseKeywords = ['unrelated', 'not related', 'irrelevant'];
const top15Insights = mentions
  .filter(m =>
    m.key_insight &&
    !noiseKeywords.some(kw => m.key_insight.toLowerCase().includes(kw))
  )
  .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  .slice(0, 15)
  .map(m => ({
    insight:    m.key_insight,
    confidence: m.confidence,
    platform:   m.platform,
  }));

// Top 3 competitors by mention count
const competitorCounts = mentions
  .filter(m => m.competitor_mentioned)
  .reduce((acc, m) => {
    acc[m.competitor_mentioned] = (acc[m.competitor_mentioned] || 0) + 1;
    return acc;
  }, {});
const top3Competitors = topN(competitorCounts, 3);

// Platform breakdown
const platformCounts = countBy(mentions, 'platform');

// ── Step 2b: Top source post per platform (for real quotes + URLs) ────────────
console.log('\n── Step 2b: Selecting top source posts per platform…');

const BRAND_ALIASES = {
  thewholetruth: ['the whole truth', 'twt', 'thewholetruth'],
  superyou:      ['superyou', 'super you'],
};
const aliases = (BRAND_ALIASES[BRAND] ?? [BRAND]).map(a => a.toLowerCase());

function mentionsBrand(raw) {
  const text = [raw?.title, raw?.body].filter(Boolean).join(' ').toLowerCase();
  return aliases.some(alias => text.includes(alias));
}

const PLATFORMS = ['reddit', 'instagram', 'linkedin'];

const top3SourcePosts = PLATFORMS.map(platform => {
  const best = mentions
    .filter(m => {
      const p = (m.platform ?? '').toLowerCase();
      const raw = m.raw_mentions;
      return (
        p === platform &&
        raw?.url &&
        (raw?.title?.trim() || raw?.body?.trim()) &&
        m.sentiment !== 'neutral' &&
        (m.complaint != null || m.praise != null || m.competitor_mentioned != null) &&
        mentionsBrand(raw)
      );
    })
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  if (!best) return null;

  const raw = best.raw_mentions;
  const content = [raw.title, raw.body]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .slice(0, 400);

  return {
    platform,
    content,
    url:         raw.url,
    key_insight: best.key_insight,
    confidence:  best.confidence,
  };
}).filter(Boolean);

top3SourcePosts.forEach(p =>
  console.log(`  [${p.platform}] (${p.confidence?.toFixed(2)}) ${p.url}`)
);

const aggregated = {
  total_analyzed:        mentions.length,
  sentiment_counts:      sentimentCounts,
  emotion_counts:        emotionCounts,
  purchase_stage_counts: stageCounts,
  top_10_themes:         top10Themes,
  top_15_key_insights:   top15Insights,
  competitor_counts:     top3Competitors,
  platform_counts:       platformCounts,
};

console.log('  Sentiment    :', JSON.stringify(sentimentCounts));
console.log('  Top 5 themes :', JSON.stringify(topN(topicCounts, 5)));
console.log('  Signal posts :', top15Insights.length, 'insights (from', mentions.length, 'total)');
console.log('  Competitors  :', JSON.stringify(top3Competitors));
console.log('  Platforms    :', JSON.stringify(platformCounts));

// ── Step 3: Call Claude ───────────────────────────────────────────────────────
console.log('\n── Step 3: Calling Claude…');

const SYSTEM_PROMPT = `You are Doorbeen — a consumer intelligence analyst for Indian D2C brands. You write weekly briefs for brand heads. Your writing is sharp, direct, and strategic. You sound like a brilliant junior strategist, not a bot. No jargon, no fluff, no filler phrases like 'it is worth noting that' or 'this suggests that'.

WRITING RULES — strictly enforced:
- No em dashes. Use a full stop or comma instead.
- No rule of three (never 'x, y, and z' as a rhetorical pattern)
- No significance inflation: never use 'pivotal', 'testament to', 'underscores', 'highlights', 'showcasing', 'nestled', 'vibrant'
- No signposting: never 'Let's look at', 'Here's what', 'It's worth noting'
- No hedging: never 'may suggest', 'could indicate', 'seems to'
- No generic conclusions: never 'the future looks bright', 'watch this space'
- Short sentences. One idea per sentence.
- Specific over general. Name the thing. Name the place. Name the number.
- Write like a sharp analyst who has seen the data and has a point of view. Not like a report generator.`;

const SOURCE_POSTS_BLOCK = top3SourcePosts.length > 0
  ? `\nSOURCE POSTS (use these for real quotes and URLs in top_mentions):\n${JSON.stringify(top3SourcePosts, null, 2)}\n`
  : '';

const BRAND_CONTEXT_BLOCK = brandProfile?.profile_json
  ? `BRAND CONTEXT — read this before analyzing anything:
${JSON.stringify(brandProfile.profile_json, null, 2)}

Instructions for using this context:
1. CONTRADICTION DETECTION — when a consumer complaint directly contradicts a brand promise (e.g. 'nothing to hide' brand + packaging tampering complaint), call it out explicitly in key_insight. These are the highest-value signals.
2. CONTROVERSY AWARENESS — you already know about known controversies. When mentions reference them, don't treat them as isolated incidents. Connect them to the broader pattern.
3. STRATEGIC FRAMING — every insight must be framed in the context of where this brand is right now (funding stage, growth trajectory, category battles). A packaging complaint means something different for a Series B brand heading toward IPO than for a bootstrapped startup.
4. COMPETITIVE INTELLIGENCE — use the competitor list to sharpen competitor_signal. Don't just name a competitor — explain the specific threat vector given what you know about both brands.
5. ONE THING TO DO — must be specific to this brand's actual situation this week. Reference real events, real product names, real platform names. Never generic.
6. TONE — write like a strategist who has been briefed on this brand, not like an analyst seeing it for the first time.

`
  : '';

const USER_PROMPT = `Generate a Doorbeen brief for ${BRAND_NAME} based on this consumer data from the last 30 days.

${BRAND_CONTEXT_BLOCK}DATA:
${JSON.stringify(aggregated, null, 2)}
${SOURCE_POSTS_BLOCK}
Return ONLY a valid JSON object with this exact structure:
{
  "act1": {
    "week_summary": "2-3 sentences. What is the dominant consumer story this month? Be specific, not generic.",
    "sentiment_score": 0,
    "top_tension": "one sharp sentence — the single biggest consumer concern right now",
    "top_praise": "one sentence — what consumers genuinely and repeatedly love",
    "competitor_signal": {
      "brand": "competitor brand name",
      "signal": "one sentence — what the competitive signal means for ${BRAND_NAME}"
    },
    "one_thing_to_do": {
      "action": "specific action the brand team can take this week",
      "rationale": "one sentence why this matters right now"
    },
    "top_mentions": [
      {
        "platform": "reddit|instagram|linkedin",
        "quote": "VERBATIM quote copied word-for-word from the 'body' or 'title' field in SOURCE POSTS above. Never paraphrase, summarise, or rewrite. If the post has no usable verbatim text, skip this entry.",
        "doorbeen_read": "one sharp insight from this specific quote — what it means for the brand",
        "url": "the source URL for this post — must match a URL from SOURCE POSTS above"
      }
    ]
  },
  "act2": {
    "emotion_breakdown": { "excited": 0, "disappointed": 0, "skeptical": 0, "curious": 0, "satisfied": 0, "angry": 0, "neutral": 0 },
    "purchase_stage_distribution": { "awareness": 0, "consideration": 0, "trial": 0, "post_purchase": 0, "repeat": 0, "lapsed": 0, "unknown": 0 },
    "top_insights": ["array of 5 most actionable insights, written as sharp one-liners a brand manager can act on"],
    "consumer_archetypes": [
      {
        "name": "short evocative name for this persona type",
        "description": "one sentence who this person is",
        "size": "approximate % of conversations this archetype represents",
        "signal": "one sentence what this archetype is saying about the brand right now"
      }
    ],
    "data_sources": { "reddit": 0, "instagram": 0, "linkedin": 0, "total": 0 }
  }
}`;

let briefJson = null;

// First attempt
const response = await anthropic.messages.create({
  model:      MODEL,
  max_tokens: 3500,
  system:     SYSTEM_PROMPT,
  messages:   [{ role: 'user', content: USER_PROMPT }],
});

const raw = response.content.find(b => b.type === 'text')?.text ?? '';
const cleaned = extractJson(raw);

try {
  briefJson = JSON.parse(cleaned);
  console.log('  ✓ Brief generated');
} catch {
  console.warn('  ⚠  JSON parse failed — retrying with stricter prompt…');
  console.warn('     ', cleaned.slice(0, 200));

  // Retry: continue the conversation with full context
  const retryResponse = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 3500,
    system:     SYSTEM_PROMPT,
    messages: [
      { role: 'user',      content: USER_PROMPT },
      { role: 'assistant', content: raw },
      { role: 'user',      content: 'Return ONLY the JSON object, nothing else, no explanation, no markdown.' },
    ],
  });

  const retryRaw     = retryResponse.content.find(b => b.type === 'text')?.text ?? '';
  const retryCleaned = extractJson(retryRaw);

  try {
    briefJson = JSON.parse(retryCleaned);
    console.log('  ✓ Brief generated (retry)');
  } catch {
    console.error('  ✗ Both attempts failed to produce valid JSON');
    console.error('     Raw response:', retryCleaned.slice(0, 500));
    process.exit(1);
  }
}

// ── Step 4: Save to Supabase ──────────────────────────────────────────────────
console.log('\n── Step 4: Saving brief to Supabase…');

const { error: insertErr } = await supabase
  .from('briefs')
  .insert({
    brand:        BRAND,
    period_label: 'Last 30 days',
    generated_at: new Date().toISOString(),
    brief_json:   briefJson,
  });

if (insertErr) {
  console.error('  ⚠  Supabase insert error:', insertErr.message);
  console.error('      Brief was generated — printing below anyway.');
} else {
  console.log('  ✓ Brief saved to briefs table');
}

// ── Step 5: Print full brief ──────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(' GENERATED BRIEF');
console.log('═══════════════════════════════════════════════════');
console.log(JSON.stringify(briefJson, null, 2));
console.log('\n  Finished:', new Date().toISOString());
console.log('═══════════════════════════════════════════════════');
