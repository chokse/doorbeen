// refresh-brand-profile.mjs
// Researches a brand using Claude + web_search, saves structured profile to Supabase,
// and updates the brands table with fresh reddit_queries + linkedin_queries.
//
// Run with: node --env-file=.env refresh-brand-profile.mjs <brand-slug>
// Example:  node --env-file=.env refresh-brand-profile.mjs thewholetruth
//
// ── Supabase: run this once to create brand_profiles table ───────────────────
// CREATE TABLE brand_profiles (
//   id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   brand        TEXT NOT NULL,
//   refreshed_at TIMESTAMPTZ DEFAULT NOW(),
//   profile_json JSONB
// );
// CREATE INDEX idx_brand_profiles_brand ON brand_profiles(brand);
//
// ── brands table must have these columns ────────────────────────────────────
// slug                TEXT PRIMARY KEY
// name                TEXT          -- display name e.g. "The Whole Truth"
// website             TEXT          -- e.g. "https://thewholetruth.in"
// reddit_queries      TEXT[]
// linkedin_queries    TEXT[]
// instagram_username  TEXT
// instagram_hashtags  TEXT[]
// subreddits          TEXT[]
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

// ── Brand from CLI arg ────────────────────────────────────────────────────────
const brandSlug = process.argv[2];
if (!brandSlug) {
  console.error('Usage: node --env-file=.env refresh-brand-profile.mjs <brand-slug>');
  console.error('Example: node --env-file=.env refresh-brand-profile.mjs thewholetruth');
  process.exit(1);
}

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const MODEL = 'claude-sonnet-4-6';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Try multiple extraction strategies so prose-wrapped JSON still parses
function extractJson(text) {
  // 1. Strip leading/trailing markdown fences
  const stripped = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  try { return JSON.parse(stripped); } catch {}

  // 2. Find first { … last } in the raw text
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log(' Doorbeen — Brand Profile Refresh');
console.log(` Brand  : ${brandSlug}`);
console.log(` Model  : ${MODEL}`);
console.log(` Started: ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════');

// ── Step 1: Fetch brand config from Supabase ──────────────────────────────────
console.log('\n── Step 1: Fetching brand config from Supabase…');

const { data: brand, error: brandErr } = await supabase
  .from('brands')
  .select('slug, name, website')
  .eq('slug', brandSlug)
  .single();

if (brandErr || !brand) {
  console.error(`Brand "${brandSlug}" not found in brands table:`, brandErr?.message ?? 'no data');
  console.error('Create a row in the brands table first with slug, name, and website.');
  process.exit(1);
}

console.log(`  Found: ${brand.name} — ${brand.website}`);

// ── Step 2: Claude with web_search ────────────────────────────────────────────
console.log('\n── Step 2: Researching brand with Claude + web_search…');

const SYSTEM_PROMPT = `You are a brand intelligence researcher for Indian D2C brands. Research thoroughly and extract specific, factual information. No generalizations. No filler.`;

const USER_PROMPT = `Research ${brand.name} thoroughly. Search for:
1. "${brand.name} India news 2025 2026"
2. "${brand.name} controversy complaint FSSAI recall"
3. "${brand.name} new product launch campaign 2025 2026"
4. Visit their website: ${brand.website}

Return ONLY valid JSON:
{
  "core_promise": "one specific sentence",
  "products": ["key products with approximate price points"],
  "price_range": "e.g. ₹100-500 per unit",
  "target_consumer": "specific — age, lifestyle, motivation",
  "brand_voice": "3-4 specific adjectives",
  "known_controversies": ["with brief specific context"],
  "competitors": ["direct competitors"],
  "recent_campaigns": ["with brief context"],
  "recent_news": ["with brief context"],
  "keywords": ["20-30 search keywords for Reddit and LinkedIn — include product names, abbreviations, founder names, controversies, competitor comparisons, quick commerce platforms"]
}`;

// Agentic loop — Claude may call web_search multiple times before returning JSON
const messages = [{ role: 'user', content: USER_PROMPT }];
let response;
let iterations = 0;
const MAX_ITERATIONS = 12;

while (iterations < MAX_ITERATIONS) {
  iterations++;
  console.log(`  Claude call ${iterations}…`);

  response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 4000,
    tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
    system:     SYSTEM_PROMPT,
    messages,
  });

  // Done — model produced its final response
  if (response.stop_reason !== 'tool_use') break;

  // Model wants to call web_search — append its message and feed back tool results
  messages.push({ role: 'assistant', content: response.content });

  const toolResults = response.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({
      type:        'tool_result',
      tool_use_id: b.id,
      content:     typeof b.output === 'string'
                     ? b.output
                     : JSON.stringify(b.output ?? ''),
    }));

  if (toolResults.length === 0) break;
  messages.push({ role: 'user', content: toolResults });
}

console.log(`  Done after ${iterations} Claude call(s). stop_reason: ${response.stop_reason}`);

// Extract the final text block (last text in response.content)
const finalText = [...(response?.content ?? [])]
  .reverse()
  .find(b => b.type === 'text')?.text ?? '';

let profileJson = extractJson(finalText);

if (profileJson) {
  console.log('  ✓ Profile JSON parsed');
} else {
  console.warn('  ⚠  JSON parse failed — retrying with stricter prompt…');
  console.warn('     ', finalText.slice(0, 200));

  // Retry: continue the conversation, ask for JSON only
  const retryMessages = [
    ...messages,
    { role: 'assistant', content: response.content },
    { role: 'user',      content: 'Return ONLY the JSON object, nothing else, no explanation, no markdown.' },
  ];

  const retryResponse = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 4000,
    system:     SYSTEM_PROMPT,
    messages:   retryMessages,
  });

  const retryText = [...(retryResponse?.content ?? [])]
    .reverse()
    .find(b => b.type === 'text')?.text ?? '';

  profileJson = extractJson(retryText);

  if (!profileJson) {
    console.error('  ✗ Both attempts failed to produce valid JSON');
    console.error('     Raw:', retryText.slice(0, 500));
    process.exit(1);
  }
  console.log('  ✓ Profile JSON parsed (retry)');
}

// ── Step 3: Save to brand_profiles ───────────────────────────────────────────
console.log('\n── Step 3: Saving brand profile to Supabase…');

const { error: profileErr } = await supabase
  .from('brand_profiles')
  .insert({
    brand:        brandSlug,
    refreshed_at: new Date().toISOString(),
    profile_json: profileJson,
  });

if (profileErr) {
  console.error('  ⚠  brand_profiles insert error:', profileErr.message);
  console.error('      Continuing anyway — will still update brands table.');
} else {
  console.log('  ✓ Saved to brand_profiles');
}

// ── Step 4: Update brands table with fresh keywords ───────────────────────────
console.log('\n── Step 4: Updating brands table with fresh keywords…');

const keywords = Array.isArray(profileJson.keywords) ? profileJson.keywords : [];
const redditQueries  = keywords.slice(0, 15);
const linkedinQueries = keywords.slice(-15);

console.log(`  Keywords total : ${keywords.length}`);
console.log(`  Reddit queries : ${redditQueries.length}`);
console.log(`  LinkedIn queries: ${linkedinQueries.length}`);

const { error: updateErr } = await supabase
  .from('brands')
  .update({
    reddit_queries:   redditQueries,
    linkedin_queries: linkedinQueries,
  })
  .eq('slug', brandSlug);

if (updateErr) {
  console.error('  ⚠  brands update error:', updateErr.message);
} else {
  console.log('  ✓ brands table updated');
}

// ── Step 5: Print full profile ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(' BRAND PROFILE');
console.log('═══════════════════════════════════════════════════');
console.log(JSON.stringify(profileJson, null, 2));
console.log('\n  Finished:', new Date().toISOString());
console.log('═══════════════════════════════════════════════════');
