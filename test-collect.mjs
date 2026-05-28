// test-collect.mjs
// Collects Reddit + Instagram + LinkedIn mentions for SuperYou and saves to Supabase.
// Run with: node --env-file=.env test-collect.mjs

import { createClient } from '@supabase/supabase-js';

// ── Env check ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const APIFY_TOKEN   = process.env.APIFY_API_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run with: node --env-file=.env test-collect.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Brand slug + optional source flag from CLI ────────────────────────────
const BRAND_SLUG = process.argv[2];
if (!BRAND_SLUG) {
  console.error('Usage: node --env-file=.env test-collect.mjs <brand-slug> [--reddit|--instagram|--linkedin]');
  console.error('Example: node --env-file=.env test-collect.mjs mamaearth --instagram');
  process.exit(1);
}

const SOURCE_FLAG = process.argv[3]; // --reddit | --instagram | --linkedin | undefined (= all)
const RUN_REDDIT    = !SOURCE_FLAG || SOURCE_FLAG === '--reddit';
const RUN_INSTAGRAM = !SOURCE_FLAG || SOURCE_FLAG === '--instagram';
const RUN_LINKEDIN  = !SOURCE_FLAG || SOURCE_FLAG === '--linkedin';

// BRAND is built dynamically in main from the Supabase brands table (see Step 0)
let BRAND;

const REDDIT_DELAY_MS = 2000;
const APIFY_POLL_MS   = 5000;
const APIFY_MAX_POLLS = 24;

// ── Shared helpers ─────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Reddit ─────────────────────────────────────────────────────────────────
function normalizeRedditPost(post, source) {
  return {
    brand:        BRAND.key,
    platform:     'reddit',
    source_type:  source,
    external_id:  `rd_${post.id}`,
    title:        post.title        || '',
    body:         post.selftext     || '',
    url:          `https://reddit.com${post.permalink}`,
    author:       post.author       || '',
    subreddit:    post.subreddit    || '',
    score:        post.score        || 0,
    num_comments: post.num_comments || 0,
    created_at:   new Date(post.created_utc * 1000).toISOString(),
    collected_at: new Date().toISOString(),
    analyzed:     false,
  };
}

async function fetchReddit(url, label) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Doorbeen/1.0 brand-intelligence-tool' }
    });
    if (!res.ok) { console.warn(`  ⚠  HTTP ${res.status} — ${label}`); return []; }
    const data = await res.json();
    return (data?.data?.children || []).map(p => p.data);
  } catch (err) {
    console.warn(`  ⚠  Fetch error (${label}): ${err.message}`);
    return [];
  }
}

async function collectReddit() {
  console.log('\n────────────────────────────────────────────────');
  console.log(' Reddit collection');
  console.log(`  ${BRAND.reddit_queries.length} queries × ${BRAND.subreddits.length + 1} sources`);
  console.log('────────────────────────────────────────────────');

  const queryResults = await Promise.all(
    BRAND.reddit_queries.map(async (query, qi) => {
      const posts = [];

      const globalUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=25&t=month`;
      const globalPosts = await fetchReddit(globalUrl, 'global');
      posts.push(...globalPosts.map(p => normalizeRedditPost(p, 'global_search')));
      console.log(`\n  [${qi + 1}/${BRAND.reddit_queries.length}] ${query}\n    global_search → ${globalPosts.length}`);

      if (!query.includes('subreddit:')) {
        for (const sub of BRAND.subreddits) {
          const subUrl = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=top&limit=10&t=month`;
          const subPosts = await fetchReddit(subUrl, `r/${sub}`);
          posts.push(...subPosts.map(p => normalizeRedditPost(p, sub)));
          if (subPosts.length) console.log(`    r/${sub} → ${subPosts.length}`);
        }
      }

      return posts;
    })
  );

  const raw = queryResults.flat();
  const seen = new Set();
  return raw.filter(r => {
    if (seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });
}

// ── Instagram via Apify ────────────────────────────────────────────────────
function normalizeInstagramPost(post, source) {
  return {
    brand:        BRAND.key,
    platform:     'instagram',
    source_type:  source,
    external_id:  `ig_${post.id || post.shortCode || String(Date.now() + Math.random())}`,
    title:        '',
    body:         post.caption || post.text || '',
    url:          post.url || (post.shortCode ? `https://instagram.com/p/${post.shortCode}` : ''),
    author:       post.ownerUsername || '',
    subreddit:    null,
    score:        post.likesCount    || 0,
    num_comments: post.commentsCount || 0,
    created_at:   post.timestamp     || new Date().toISOString(),
    collected_at: new Date().toISOString(),
    analyzed:     false,
  };
}

async function runApifyActor(actorId, input) {
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!startRes.ok) throw new Error(`Apify start failed (${startRes.status}): ${startRes.statusText}`);
  const { data: run } = await startRes.json();

  for (let i = 0; i < APIFY_MAX_POLLS; i++) {
    await sleep(APIFY_POLL_MS);

    let status;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const statusRes = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/runs/${run.id}?token=${APIFY_TOKEN}`
        );
        ({ data: status } = await statusRes.json());
        break;
      } catch (err) {
        if (attempt < 2) {
          console.warn(`  ⚠  Poll fetch failed (attempt ${attempt + 1}/3): ${err.message} — retrying in 10s`);
          await sleep(10000);
        } else {
          throw new Error(`Poll fetch failed after 3 attempts: ${err.message}`);
        }
      }
    }

    if (status.status === 'SUCCEEDED') {
      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${status.defaultDatasetId}/items?token=${APIFY_TOKEN}`
      );
      return await itemsRes.json();
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status.status)) {
      throw new Error(`Apify run ${status.status}`);
    }
    console.log(`    polling… (${(i + 1) * APIFY_POLL_MS / 1000}s)`);
  }

  throw new Error('Apify run timed out after 2 minutes');
}

async function collectInstagram() {
  console.log('\n────────────────────────────────────────────────');
  console.log(' Instagram collection (via Apify)');

  if (!APIFY_TOKEN) {
    console.log('  ⚠  No APIFY_API_TOKEN — skipping');
    console.log('────────────────────────────────────────────────');
    return [];
  }

  console.log(`  Profile: @${BRAND.instagram_username}`);
  console.log(`  Hashtags: #${BRAND.instagram_hashtags.join(', #')}`);
  console.log('────────────────────────────────────────────────');

  const results = [];

  try {
    console.log(`\n  [1] Profile scrape: @${BRAND.instagram_username}`);
    const posts = await runApifyActor('apify~instagram-post-scraper', {
      username:     [BRAND.instagram_username],
      resultsLimit: 20,
    });
    results.push(...posts.map(p => normalizeInstagramPost(p, 'own_profile')));
    console.log(`    own_profile → ${posts.length} posts`);
  } catch (err) {
    console.warn(`  ⚠  Profile scrape failed: ${err.message}`);
  }

  for (const [hi, hashtag] of BRAND.instagram_hashtags.entries()) {
    try {
      console.log(`\n  [${hi + 2}] Hashtag scrape: #${hashtag}`);
      const posts = await runApifyActor('apify~instagram-hashtag-scraper', {
        hashtags:     [hashtag],
        resultsLimit: 15,
      });
      results.push(...posts.map(p => normalizeInstagramPost(p, `hashtag_${hashtag}`)));
      console.log(`    #${hashtag} → ${posts.length} posts`);
    } catch (err) {
      console.warn(`  ⚠  Hashtag #${hashtag} failed: ${err.message}`);
    }
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });
}

// ── LinkedIn via Apify ─────────────────────────────────────────────────────
function normalizeLinkedInPost(post, source) {
  return {
    brand:        BRAND.key,
    platform:     'linkedin',
    source_type:  source,
    external_id:  `li_${post.id || post.urn || String(Date.now() + Math.random())}`,
    title:        '',
    body:         post.text || post.content || post.description || '',
    url:          post.url || post.postUrl || '',
    author:       post.authorName || post.author?.name || '',
    subreddit:    null,
    score:        post.likesCount  || post.likes    || 0,
    num_comments: post.commentsCount || post.comments || 0,
    created_at:   (typeof post.postedAt === 'object' ? post.postedAt?.date : post.postedAt)
                  || post.date || new Date().toISOString(),
    collected_at: new Date().toISOString(),
    analyzed:     false,
  };
}

async function collectLinkedIn() {
  console.log('\n────────────────────────────────────────────────');
  console.log(' LinkedIn collection (via Apify)');

  if (!APIFY_TOKEN) {
    console.log('  ⚠  No APIFY_API_TOKEN — skipping');
    console.log('────────────────────────────────────────────────');
    return [];
  }

  console.log(`  Queries: ${BRAND.linkedin_queries.length}`);
  console.log('────────────────────────────────────────────────');

  const results = [];

  for (const [qi, query] of BRAND.linkedin_queries.entries()) {
    try {
      console.log(`\n  [${qi + 1}/${BRAND.linkedin_queries.length}] ${query}`);
      const posts = await runApifyActor('harvestapi~linkedin-post-search', {
        searchQueries:       [query],
        maxPosts:            20,
        scrapeComments:      true,
        postNestedComments:  false,
        scrapeReactions:     false,
        postNestedReactions: false,
      });
      const normalized = (posts || []).map(p => normalizeLinkedInPost(p, 'search'));
      results.push(...normalized);
      console.log(`    → ${normalized.length} posts`);
    } catch (err) {
      console.warn(`  ⚠  Query "${query}" failed: ${err.message}`);
    }

    await sleep(15000);
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });
}

// ── Save to Supabase ───────────────────────────────────────────────────────
async function saveMentions(mentions) {
  if (!mentions.length) return { saved: 0, skipped: 0 };

  const ids = mentions.map(m => m.external_id);

  // Batch pre-check to avoid URL length limits on large .in() queries
  const CHUNK = 200;
  const existingIds = new Set();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data: existing, error: fetchErr } = await supabase
      .from('raw_mentions')
      .select('external_id')
      .in('external_id', chunk);
    if (fetchErr) {
      console.error('Supabase pre-check error:', fetchErr.message);
      return { saved: 0, skipped: 0 };
    }
    for (const r of existing || []) existingIds.add(r.external_id);
  }

  const newMentions  = mentions.filter(m => !existingIds.has(m.external_id));
  const skippedCount = mentions.length - newMentions.length;

  if (!newMentions.length) return { saved: 0, skipped: skippedCount };

  // Batch inserts to avoid payload size limits
  let saved = 0;
  for (let i = 0; i < newMentions.length; i += CHUNK) {
    const chunk = newMentions.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase.from('raw_mentions').insert(chunk);
    if (insertErr) {
      console.error('Supabase insert error:', insertErr.message);
      return { saved, skipped: skippedCount };
    }
    saved += chunk.length;
  }

  return { saved, skipped: skippedCount };
}

// ── Main ───────────────────────────────────────────────────────────────────

// Step 0: fetch brand config from Supabase
console.log(`\n── Step 0: Fetching brand config for "${BRAND_SLUG}"…`);
const { data: brandConfig, error: brandErr } = await supabase
  .from('brands')
  .select('slug, name, reddit_queries, linkedin_queries, instagram_username, instagram_hashtags, subreddits')
  .eq('slug', BRAND_SLUG)
  .single();

if (brandErr || !brandConfig) {
  console.error(`Brand "${BRAND_SLUG}" not found in brands table:`, brandErr?.message ?? 'no data');
  console.error('Run refresh-brand-profile.mjs first to create the brand row.');
  process.exit(1);
}

BRAND = {
  key:                BRAND_SLUG,
  name:               brandConfig.name,
  reddit_queries:     brandConfig.reddit_queries     || [],
  subreddits:         brandConfig.subreddits         || [],
  instagram_username: brandConfig.instagram_username || '',
  instagram_hashtags: brandConfig.instagram_hashtags || [],
  linkedin_queries:   brandConfig.linkedin_queries   || [],
};
console.log(`  Found: ${BRAND.name} (${BRAND.reddit_queries.length} Reddit queries, ${BRAND.linkedin_queries.length} LinkedIn queries)`);

console.log('═══════════════════════════════════════════════════');
console.log(' Doorbeen — Full Collection Test (All Sources)');
console.log(` Brand   : ${BRAND.name}`);
console.log(` Started : ${new Date().toISOString()}`);
console.log(` Apify   : ${APIFY_TOKEN ? '✓ token present' : '✗ no token (Instagram + LinkedIn will be skipped)'}`);
console.log('═══════════════════════════════════════════════════');

const redditMentions    = RUN_REDDIT    ? await collectReddit()    : [];
const instagramMentions = RUN_INSTAGRAM ? await collectInstagram() : [];
const linkedinMentions  = RUN_LINKEDIN  ? await collectLinkedIn()  : [];

const allMentions = [...redditMentions, ...instagramMentions, ...linkedinMentions];

console.log(`\n── Saving ${allMentions.length} unique posts to Supabase…`);
const { saved, skipped } = await saveMentions(allMentions);

// ── Final summary ──────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(' COLLECTION SUMMARY');
console.log('═══════════════════════════════════════════════════');
console.log(`  Brand             : ${BRAND.name}`);
console.log(`  Reddit posts      : ${redditMentions.length}`);
console.log(`  Instagram posts   : ${instagramMentions.length}`);
console.log(`  LinkedIn posts    : ${linkedinMentions.length}`);
console.log(`  ─────────────────────────────────────`);
console.log(`  Total found       : ${allMentions.length}`);
console.log(`  Newly saved       : ${saved}`);
console.log(`  Skipped (dupe)    : ${skipped}`);

// Reddit breakdown by subreddit
if (redditMentions.length) {
  const bySub = {};
  for (const m of redditMentions) {
    const s = m.subreddit || '(global)';
    bySub[s] = (bySub[s] || 0) + 1;
  }
  console.log('\n  Reddit — by subreddit:');
  Object.entries(bySub)
    .sort(([, a], [, b]) => b - a)
    .forEach(([s, n]) => console.log(`    r/${s.padEnd(24)} ${n}`));
}

// Instagram breakdown by source
if (instagramMentions.length) {
  const bySrc = {};
  for (const m of instagramMentions) {
    bySrc[m.source_type] = (bySrc[m.source_type] || 0) + 1;
  }
  console.log('\n  Instagram — by source:');
  Object.entries(bySrc)
    .sort(([, a], [, b]) => b - a)
    .forEach(([s, n]) => console.log(`    ${s.padEnd(28)} ${n}`));
}

// LinkedIn author breakdown
if (linkedinMentions.length) {
  const byAuthor = {};
  for (const m of linkedinMentions) {
    const a = m.author || '(unknown)';
    byAuthor[a] = (byAuthor[a] || 0) + 1;
  }
  console.log('\n  LinkedIn — by author (top 10):');
  Object.entries(byAuthor)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([a, n]) => console.log(`    ${a.slice(0, 28).padEnd(28)} ${n}`));
}

console.log('\n  Finished:', new Date().toISOString());
console.log('═══════════════════════════════════════════════════');
