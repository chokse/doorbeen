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
const MODEL    = 'claude-haiku-4-5-20251001';
const CONCURRENCY = 5;
const BATCH_SIZE  = 20;

const BRAND = process.argv[2];
if (!BRAND) {
  console.error('Usage: node --env-file=.env test-analyze.mjs <brand-slug>');
  console.error('Example: node --env-file=.env test-analyze.mjs thewholetruth');
  process.exit(1);
}

// SYSTEM_PROMPT is built dynamically after the brand profile is fetched (see Step 0 in main).

// ── Helpers ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Build the system prompt, optionally injecting the brand profile as context. */
function buildSystemPrompt(profileJson) {
  const contextBlock = profileJson
    ? `\nBRAND CONTEXT:\n${JSON.stringify(profileJson, null, 2)}\n\nUse this context to:\n1. CONTRADICTION DETECTION — flag when this post contradicts the brand's core promise\n2. CONTROVERSY AWARENESS — connect mentions to known controversies rather than treating them as isolated\n3. SHARPER KEY_INSIGHT — make it specific to this brand's actual situation, not generic\n4. COMPETITOR SIGNALS — use the known competitor list to identify meaningful competitive mentions\n`
    : '';

  return `You are a consumer intelligence analyst for Indian D2C brands. Analyze this social media post and return ONLY valid JSON, no preamble, no markdown.${contextBlock}
Return this exact JSON structure:
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
}

/** Strip fences; fall back to brace-scan if result doesn't start with {. */
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

/** Call Claude and parse the JSON response. Returns null on failure.
 *  On a parse failure, retries once by continuing the conversation with
 *  a stricter instruction before giving up. */
async function analyzePost(title, body, systemPrompt) {
  const userContent = [title, body].filter(Boolean).join('\n\n').slice(0, 4000);
  const messages = [{ role: 'user', content: userContent }];

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
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
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
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

// 0. Fetch latest brand profile and build system prompt
console.log('\n── Step 0: Fetching brand profile…');

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
  console.warn('  ⚠  No brand profile found — proceeding without context');
}

const SYSTEM_PROMPT = buildSystemPrompt(brandProfile?.profile_json ?? null);

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
let saved   = 0;
let failed  = 0;
let skipped = 0;
const sentimentCounts = {};
const emotionCounts   = {};
const topicCounts     = {};
const topInsights     = [];

// Pending buffer for batched Supabase writes
const pendingRows = [];   // { row, rawId }

async function flushBatch() {
  if (!pendingRows.length) return;
  const batch = pendingRows.splice(0);
  const rows  = batch.map(p => p.row);
  const ids   = batch.map(p => p.rawId);

  const { error: insertErr } = await supabase.from('analyzed_mentions').insert(rows);
  if (insertErr) {
    console.warn(`  ⚠  Batch insert error: ${insertErr.message}`);
    failed += rows.length;
    return;
  }

  const { error: updateErr } = await supabase
    .from('raw_mentions')
    .update({ analyzed: true })
    .in('id', ids);
  if (updateErr) console.warn(`  ⚠  Batch update error: ${updateErr.message}`);

  saved += rows.length;
}

// 3. Analyse with CONCURRENCY workers + batched writes
let nextIdx = 0;

async function processWorker() {
  while (true) {
    const i = nextIdx++;
    if (i >= mentions.length) break;
    const mention = mentions[i];

    const label = mention.title?.slice(0, 60) || mention.url?.slice(-40) || mention.id;
    console.log(`[${i + 1}/${mentions.length}] ${label}`);

    const hasContent = [mention.title, mention.body].some(s => s?.trim());
    if (!hasContent) {
      console.log('  ⏭  skipped (empty title and body)');
      skipped++;
      continue;
    }

    let analysis = null;
    try {
      analysis = await analyzePost(mention.title, mention.body, SYSTEM_PROMPT);
    } catch (err) {
      console.warn(`  ⚠  Claude API error: ${err.message}`);
      failed++;
      continue;
    }

    if (!analysis) { failed++; continue; }

    const row = {
      raw_mention_id:       mention.id,
      brand:                mention.brand,
      platform:             mention.platform,
      sentiment:            analysis.sentiment           ?? null,
      sentiment_score:      analysis.sentiment_score     ?? null,
      emotion:              analysis.emotion             ?? null,
      topics:               Array.isArray(analysis.topics) ? analysis.topics : [],
      purchase_stage:       analysis.purchase_stage      ?? null,
      complaint:            analysis.complaint           ?? null,
      praise:               analysis.praise              ?? null,
      competitor_mentioned: analysis.competitor_mentioned ?? null,
      key_insight:          analysis.key_insight         ?? null,
      confidence:           analysis.confidence          ?? null,
    };

    pendingRows.push({ row, rawId: mention.id });

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
      topInsights.push({ confidence: analysis.confidence, key_insight: analysis.key_insight, url: mention.url });
    }

    console.log(`  ${analysis.sentiment} (${(analysis.sentiment_score ?? 0).toFixed(2)}) · ${analysis.emotion} · [${(analysis.topics ?? []).join(', ')}]`);
    console.log(`  → ${analysis.key_insight}`);

    if (pendingRows.length >= BATCH_SIZE) await flushBatch();
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, processWorker));
await flushBatch();

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
