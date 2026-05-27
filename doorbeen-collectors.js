// ============================================================
// DOORBEEN — DATA COLLECTION SCRIPTS
// Reddit (free, works now) + Instagram via Apify
// Deploy these as Vercel API routes or run as Node.js scripts
// ============================================================

// ============================================================
// DEPENDENCIES
// npm install @supabase/supabase-js node-fetch
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// BRAND CONFIG — fetched dynamically from Supabase brands table
// To add a new brand: INSERT a row into the brands table with
// slug, name, website, reddit_queries, linkedin_queries,
// instagram_username, instagram_hashtags, subreddits
// ============================================================

async function getBrandConfig(brandSlug) {
  const { data, error } = await supabase
    .from('brands')
    .select('name, reddit_queries, linkedin_queries, instagram_username, instagram_hashtags, subreddits')
    .eq('slug', brandSlug)
    .single();

  if (error || !data) {
    throw new Error(`Brand "${brandSlug}" not found in Supabase brands table: ${error?.message ?? 'no data'}`);
  }
  return data;
}

// ============================================================
// REDDIT COLLECTOR
// Uses public JSON endpoints — no credentials needed
// Rate limit: stay under 10 requests/minute
// ============================================================

async function collectRedditMentions(brandSlug) {
  const brand = await getBrandConfig(brandSlug);
  const results = [];

  for (const query of brand.reddit_queries) {
    try {
      // Global search
      const globalUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=25&t=week`;
      const globalRes = await fetch(globalUrl, {
        headers: { 'User-Agent': 'Doorbeen/1.0 brand-intelligence-tool' }
      });

      if (globalRes.ok) {
        const data = await globalRes.json();
        const posts = data?.data?.children || [];
        results.push(...posts.map(p => normalizeRedditPost(p.data, brandSlug, 'global_search')));
      }

      // Rate limit respect — 6 seconds between calls = 10/minute max
      await sleep(6000);

      // Subreddit-specific searches
      for (const sub of brand.subreddits) {
        const subUrl = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=top&limit=10&t=month`;
        const subRes = await fetch(subUrl, {
          headers: { 'User-Agent': 'Doorbeen/1.0 brand-intelligence-tool' }
        });

        if (subRes.ok) {
          const data = await subRes.json();
          const posts = data?.data?.children || [];
          results.push(...posts.map(p => normalizeRedditPost(p.data, brandSlug, sub)));
        }

        await sleep(6000);
      }

    } catch (err) {
      console.error(`Reddit error for query "${query}":`, err.message);
    }
  }

  // Deduplicate by Reddit post ID
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });

  console.log(`Reddit: found ${unique.length} unique posts for ${brandSlug}`);
  return unique;
}

function normalizeRedditPost(post, brandKey, source) {
  return {
    brand: brandKey,
    platform: 'reddit',
    source_type: source,
    external_id: post.id,
    title: post.title || '',
    body: post.selftext || '',
    url: `https://reddit.com${post.permalink}`,
    author: post.author || '',
    subreddit: post.subreddit || '',
    score: post.score || 0,
    num_comments: post.num_comments || 0,
    created_at: new Date(post.created_utc * 1000).toISOString(),
    collected_at: new Date().toISOString(),
    analyzed: false,
  };
}

// ============================================================
// INSTAGRAM COLLECTOR via Apify
// Requires: APIFY_API_TOKEN in env
// Free tier: 100 results/month
// Paid tier: ~$30/month for more
//
// Two modes:
// 1. Profile scraper — gets posts from brand's own account
// 2. Hashtag scraper — gets public posts with brand hashtags
// ============================================================

async function collectInstagramMentions(brandSlug) {
  const brand = await getBrandConfig(brandSlug);
  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

  if (!APIFY_TOKEN) {
    console.warn('No APIFY_API_TOKEN set — skipping Instagram collection');
    return [];
  }

  const results = [];

  // Mode 1: Scrape brand's own profile posts + comments
  try {
    const profileRun = await triggerApifyActor(
      'apify~instagram-post-scraper',
      {
        directUrls: [`https://www.instagram.com/${brand.instagram_username}/`],
        resultsLimit: 20,
        addParentData: false,
      },
      APIFY_TOKEN
    );

    const profilePosts = profileRun || [];
    results.push(...profilePosts.map(p => normalizeInstagramPost(p, brandSlug, 'own_profile')));
    console.log(`Instagram profile: ${profilePosts.length} posts for ${brandSlug}`);
  } catch (err) {
    console.error('Instagram profile scrape error:', err.message);
  }

  // Mode 2: Scrape hashtag posts
  for (const hashtag of brand.instagram_hashtags) {
    try {
      const hashtagRun = await triggerApifyActor(
        'apify~instagram-hashtag-scraper',
        {
          hashtags: [hashtag],
          resultsLimit: 15,
        },
        APIFY_TOKEN
      );

      const hashtagPosts = hashtagRun || [];
      results.push(...hashtagPosts.map(p => normalizeInstagramPost(p, brandSlug, `hashtag_${hashtag}`)));
      console.log(`Instagram #${hashtag}: ${hashtagPosts.length} posts`);

    } catch (err) {
      console.error(`Instagram hashtag error for #${hashtag}:`, err.message);
    }
  }

  return results;
}

async function triggerApifyActor(actorId, input, token) {
  // Start the actor run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!startRes.ok) throw new Error(`Apify start failed: ${startRes.statusText}`);
  const { data: run } = await startRes.json();
  const runId = run.id;

  // Poll until finished (max 2 minutes), with fetch-retry on transient network errors
  for (let i = 0; i < 24; i++) {
    await sleep(5000);

    let status;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const statusRes = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${token}`
        );
        ({ data: status } = await statusRes.json());
        break;  // success — exit retry loop
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
      // Fetch results
      const resultsRes = await fetch(
        `https://api.apify.com/v2/datasets/${status.defaultDatasetId}/items?token=${token}`
      );
      return await resultsRes.json();
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status.status)) {
      throw new Error(`Apify run ${status.status}`);
    }
  }

  throw new Error('Apify run timed out after 2 minutes');
}

function normalizeInstagramPost(post, brandKey, source) {
  return {
    brand: brandKey,
    platform: 'instagram',
    source_type: source,
    external_id: post.id || post.shortCode || String(Date.now()),
    title: '',
    body: post.caption || post.text || '',
    url: post.url || `https://instagram.com/p/${post.shortCode}`,
    author: post.ownerUsername || '',
    subreddit: null,
    score: post.likesCount || 0,
    num_comments: post.commentsCount || 0,
    created_at: post.timestamp || new Date().toISOString(),
    collected_at: new Date().toISOString(),
    analyzed: false,
  };
}

// ============================================================
// SUPABASE — SAVE TO DATABASE
// Run this SQL first to create the table:
//
// CREATE TABLE raw_mentions (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   brand TEXT NOT NULL,
//   platform TEXT NOT NULL,
//   source_type TEXT,
//   external_id TEXT UNIQUE,
//   title TEXT,
//   body TEXT,
//   url TEXT,
//   author TEXT,
//   subreddit TEXT,
//   score INTEGER DEFAULT 0,
//   num_comments INTEGER DEFAULT 0,
//   created_at TIMESTAMPTZ,
//   collected_at TIMESTAMPTZ DEFAULT NOW(),
//   analyzed BOOLEAN DEFAULT FALSE
// );
//
// CREATE INDEX idx_raw_mentions_brand ON raw_mentions(brand);
// CREATE INDEX idx_raw_mentions_analyzed ON raw_mentions(analyzed);
// ============================================================

async function saveMentions(mentions) {
  if (!mentions.length) return;

  // Upsert — won't create duplicates if external_id already exists
  const { error } = await supabase
    .from('raw_mentions')
    .upsert(mentions, { onConflict: 'external_id', ignoreDuplicates: true });

  if (error) console.error('Supabase save error:', error.message);
  else console.log(`Saved ${mentions.length} mentions to Supabase`);
}

// ============================================================
// MAIN COLLECTION JOB
// Call this from a Vercel cron job (vercel.json) or manually
// ============================================================

export async function runCollectionJob(brandSlug = 'superyou') {
  console.log(`\n=== Doorbeen Collection Job: ${brandSlug} ===`);
  console.log(`Started at: ${new Date().toISOString()}`);

  const [redditMentions, instagramMentions, linkedinMentions] = await Promise.allSettled([
    collectRedditMentions(brandSlug),
    collectInstagramMentions(brandSlug),
    collectLinkedInMentions(brandSlug),
  ]);

  const allMentions = [
    ...(redditMentions.status   === 'fulfilled' ? redditMentions.value   : []),
    ...(instagramMentions.status === 'fulfilled' ? instagramMentions.value : []),
    ...(linkedinMentions.status  === 'fulfilled' ? linkedinMentions.value  : []),
  ];

  await saveMentions(allMentions);

  console.log(`\nCollection complete.`);
  console.log(`Reddit:    ${redditMentions.value?.length    || 0} posts`);
  console.log(`Instagram: ${instagramMentions.value?.length || 0} posts`);
  console.log(`LinkedIn:  ${linkedinMentions.value?.length  || 0} posts`);
  console.log(`Total saved: ${allMentions.length}`);

  return { total: allMentions.length };
}

// ============================================================
// VERCEL CRON JOB SETUP
// Add this to vercel.json in your project root:
//
// {
//   "crons": [{
//     "path": "/api/collect",
//     "schedule": "0 */6 * * *"  <- runs every 6 hours
//   }]
// }
//
// And create /api/collect.js:
//
// import { runCollectionJob } from '../doorbeen-collectors.js';
// export default async function handler(req, res) {
//   const result = await runCollectionJob('superyou');
//   res.json(result);
// }
// ============================================================

// ============================================================
// REQUIRED ENV VARIABLES
// Add these to Vercel dashboard → Settings → Environment Variables
//
// SUPABASE_URL=https://xxxx.supabase.co
// SUPABASE_SERVICE_KEY=your-service-key
// APIFY_API_TOKEN=your-apify-token (optional, for Instagram)
// ============================================================

// ============================================================
// LINKEDIN COLLECTOR via Apify
// Actor: apify~linkedin-search-scraper
// Requires: APIFY_API_TOKEN in env
//
// LinkedIn has no public search JSON endpoint, so we use the
// same Apify pattern as Instagram — fire an actor run per query,
// poll until SUCCEEDED, collect items.
//
// Rate: LinkedIn is aggressive about scraping; keep resultsLimit
// low (≤20/query) and add generous delays between runs.
// ============================================================

async function collectLinkedInMentions(brandSlug) {
  const brand = await getBrandConfig(brandSlug);
  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

  if (!APIFY_TOKEN) {
    console.warn('No APIFY_API_TOKEN set — skipping LinkedIn collection');
    return [];
  }

  if (!brand.linkedin_queries?.length) {
    console.warn(`No linkedin_queries defined for brand: ${brandSlug}`);
    return [];
  }

  console.log(`LinkedIn: running ${brand.linkedin_queries.length} queries for ${brandSlug}`);
  const results = [];

  for (const [qi, query] of brand.linkedin_queries.entries()) {
    console.log(`  [${qi + 1}/${brand.linkedin_queries.length}] ${query}`);
    try {
      const posts = await triggerApifyActor(
        'harvestapi~linkedin-post-search',
        {
          searchQueries:       [query],  // one query per run — dedup by external_id after
          maxPosts:            20,
          scrapeComments:      true,     // comments = consumer voice
          postNestedComments:  false,
          scrapeReactions:     false,
          postNestedReactions: false,
        },
        APIFY_TOKEN
      );

      const normalized = (posts || []).map(p => normalizeLinkedInPost(p, brandSlug, query));
      results.push(...normalized);
      console.log(`    → ${normalized.length} posts`);
    } catch (err) {
      console.error(`  LinkedIn error for query "${query}":`, err.message);
    }

    // LinkedIn scraping needs a longer cool-down than Reddit
    await sleep(15000);
  }

  // Deduplicate by external_id
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });
}

function normalizeLinkedInPost(post, brandKey, query) {
  return {
    brand:        brandKey,
    platform:     'linkedin',
    source_type:  'search',
    external_id:  `li_${post.id || post.urn || String(Date.now() + Math.random())}`,
    title:        '',
    body:         post.text || post.content || post.description || '',
    url:          post.url || post.postUrl || '',
    author:       post.authorName || post.author?.name || '',
    subreddit:    null,
    score:        post.likesCount || post.likes || 0,
    num_comments: post.commentsCount || post.comments || 0,
    created_at:   (typeof post.postedAt === 'object' ? post.postedAt?.date : post.postedAt)
                  || post.date || new Date().toISOString(),
    collected_at: new Date().toISOString(),
    analyzed:     false,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
