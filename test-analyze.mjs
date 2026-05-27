// test-analyze.mjs
// Reads raw_mentions for thewholetruth, analyses each via Claude, saves to analyzed_mentions.
// Run with: node --env-file=.env test-analyze.mjs
//
// ── Supabase: run this once to create the target table ────────────────────────
// CREATE TABLE analyzed_mentions (
//   id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   raw_mention_id      UUID REFERENCES raw_mentions(id) ON DELETE CASCADE,
//   brand               TEXT NOT NULL,
//   platform            TEXT,
//   sentiment           TEXT,
//   sentiment_score     FLOAT,
//   emotion             TEXT,
//   topics              TEXT[],
//   purchase_stage      TEXT,
//   complaint           TEXT,
//   praise              TEXT,
//   competitor_mentioned TEXT,
//   key_insight         TEXT,
//   confidence          FLOAT,
//   analyzed_at         TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX idx_analyzed_brand   ON analyzed_mentions(brand);
// CREATE INDEX idx_analyzed_insight ON analyzed_mentions(key_insight);
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Env check ──────────────────────────────────────────────────────────────
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── Config ─────────────────────────────────────────────────────────────────
const MODEL      = 'claude-sonnet-4-6';  // replaces claude-sonnet-4-20250514 (404'd early)
const BRAND      = 'superyou';
const DELAY_MS   = 1000;  // 1 s between Claude calls

const SYSTEM_PROMPT = `You are a consumer intelligence analyst for Indian D2C brands. Analyze this social media post and return ONLY valid JSON, no preamble, no markdown:

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
}`;

// ── Helpers ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Strip markdown code fences if Claude wraps the JSON in them. */
function extractJson(text) {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return stripped;
}

/** Call Claude and parse the JSON response. Returns null on failure.
 *  On a parse failure, retries once by continuing the conversation with
 *  a stricter instruction before giving up. */
async function analyzePost(title, body) {
  const userContent = [title, body].filter(Boolean).join('\n\n').slice(0, 4000);
  const messages = [{ role: 'user', content: userContent }];

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 512,
    system:     SYSTEM_PROMPT,
    messages,
  });

  const raw = response.content.find(b => b.type === 'text')?.text ?? '';
  const json = extractJson(raw);

  try {
    return JSON.parse(json);
  } catch {
    console.warn('  ⚠  JSON parse failed — retrying with stricter prompt…');
    console.warn('     ', json.slice(0, 200));

    // Retry: continue the conversation so Claude has full context
    const retryResponse = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages: [
        ...messages,
        { role: 'assistant', content: raw },
        { role: 'user',      content: 'Return ONLY the JSON object, nothing else, no explanation.' },
      ],
    });

    const retryRaw  = retryResponse.content.find(b => b.type === 'text')?.text ?? '';
    const retryJson = extractJson(retryRaw);

    try {
      return JSON.parse(retryJson);
    } catch {
      console.warn('  ✗  Retry also failed, raw response:');
      console.warn('     ', retryJson.slice(0, 200));
      return null;
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log(' Doorbeen — Analysis Run');
console.log(` Brand  : ${BRAND}`);
console.log(` Model  : ${MODEL}`);
console.log(` Started: ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════');

// 1. Fetch unanalyzed raw mentions
const { data: mentions, error: fetchErr } = await supabase
  .from('raw_mentions')
  .select('id, brand, platform, title, body, url, subreddit, score')
  .eq('brand', BRAND)
  .eq('analyzed', false)
  .order('score', { ascending: false });   // highest-signal posts first

if (fetchErr) {
  console.error('Failed to fetch raw_mentions:', fetchErr.message);
  process.exit(1);
}

if (!mentions?.length) {
  console.log('\nNo unanalyzed posts found. All done!');
  process.exit(0);
}

console.log(`\nFound ${mentions.length} unanalyzed posts — processing...\n`);

// 2. Track results for the summary
let processed = 0;
let saved     = 0;
let failed    = 0;
let skipped   = 0;
const sentimentCounts  = {};
const emotionCounts    = {};
const topicCounts      = {};
const topInsights      = [];   // { confidence, key_insight, url }

// 3. Analyse each post
for (const [i, mention] of mentions.entries()) {
  const label = mention.title?.slice(0, 60) || mention.url?.slice(-40) || mention.id;
  console.log(`[${i + 1}/${mentions.length}] ${label}`);

  // Skip rows with no content — nothing for Claude to analyse
  const hasContent = [mention.title, mention.body].some(s => s?.trim());
  if (!hasContent) {
    console.log('  ⏭  skipped (empty title and body)');
    skipped++;
    continue;
  }

  let analysis = null;
  try {
    analysis = await analyzePost(mention.title, mention.body);
  } catch (err) {
    console.warn(`  ⚠  Claude API error: ${err.message}`);
    failed++;
    await sleep(DELAY_MS);
    continue;
  }

  if (!analysis) {
    failed++;
    await sleep(DELAY_MS);
    continue;
  }

  // 3a. Save to analyzed_mentions
  const row = {
    raw_mention_id:      mention.id,
    brand:               mention.brand,
    platform:            mention.platform,
    sentiment:           analysis.sentiment          ?? null,
    sentiment_score:     analysis.sentiment_score    ?? null,
    emotion:             analysis.emotion            ?? null,
    topics:              Array.isArray(analysis.topics) ? analysis.topics : [],
    purchase_stage:      analysis.purchase_stage     ?? null,
    complaint:           analysis.complaint          ?? null,
    praise:              analysis.praise             ?? null,
    competitor_mentioned:analysis.competitor_mentioned ?? null,
    key_insight:         analysis.key_insight        ?? null,
    confidence:          analysis.confidence         ?? null,
  };

  const { error: insertErr } = await supabase
    .from('analyzed_mentions')
    .insert(row);

  if (insertErr) {
    console.warn(`  ⚠  Supabase insert error: ${insertErr.message}`);
    failed++;
    await sleep(DELAY_MS);
    continue;
  }

  // 3b. Flip analyzed = true on the raw mention
  const { error: updateErr } = await supabase
    .from('raw_mentions')
    .update({ analyzed: true })
    .eq('id', mention.id);

  if (updateErr) {
    console.warn(`  ⚠  Could not mark analyzed: ${updateErr.message}`);
  }

  // 3c. Accumulate stats
  processed++;
  saved++;

  const s = analysis.sentiment ?? 'unknown';
  sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;

  const e = analysis.emotion ?? 'unknown';
  emotionCounts[e] = (emotionCounts[e] || 0) + 1;

  for (const topic of (analysis.topics ?? [])) {
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }

  const noiseKeywords = ['unrelated', 'not related', 'irrelevant'];
  const isNoise =
    noiseKeywords.some(kw => (analysis.key_insight ?? '').toLowerCase().includes(kw)) ||
    (!analysis.competitor_mentioned && !analysis.complaint && !analysis.praise);

  if (analysis.key_insight && (analysis.confidence ?? 0) > 0 && !isNoise) {
    topInsights.push({
      confidence:  analysis.confidence,
      key_insight: analysis.key_insight,
      url:         mention.url,
    });
  }

  console.log(`  ${analysis.sentiment} (${(analysis.sentiment_score ?? 0).toFixed(2)}) · ${analysis.emotion} · [${(analysis.topics ?? []).join(', ')}]`);
  console.log(`  → ${analysis.key_insight}`);

  await sleep(DELAY_MS);
}

// ── Summary ────────────────────────────────────────────────────────────────
const top5Insights = topInsights
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 5);

const top5Topics = Object.entries(topicCounts)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5);

console.log('\n═══════════════════════════════════════════════════');
console.log(' ANALYSIS SUMMARY');
console.log('═══════════════════════════════════════════════════');
console.log(`  Brand          : ${BRAND}`);
console.log(`  Total found    : ${mentions.length}`);
console.log(`  Skipped        : ${skipped}  (empty content)`);
console.log(`  Saved          : ${saved}`);
console.log(`  Failed         : ${failed}`);

console.log('\n  Sentiment breakdown:');
Object.entries(sentimentCounts)
  .sort(([, a], [, b]) => b - a)
  .forEach(([s, n]) => console.log(`    ${s.padEnd(12)} ${n}`));

console.log('\n  Emotion breakdown:');
Object.entries(emotionCounts)
  .sort(([, a], [, b]) => b - a)
  .forEach(([e, n]) => console.log(`    ${e.padEnd(14)} ${n}`));

console.log('\n  Top 5 themes:');
top5Topics.forEach(([t, n]) => console.log(`    ${t.padEnd(20)} ${n}`));

console.log('\n  Top 5 key insights (highest confidence, signal posts only):');
top5Insights.forEach((ins, i) => {
  console.log(`  ${i + 1}. [${(ins.confidence * 100).toFixed(0)}%] ${ins.key_insight}`);
  console.log(`     ${ins.url}`);
});

console.log('\n  Finished:', new Date().toISOString());
console.log('═══════════════════════════════════════════════════');
