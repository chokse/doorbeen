const query = '"the whole truth" protein bar';
const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=10&t=month`;

const res = await fetch(url, {
  headers: { 'User-Agent': 'Doorbeen/1.0 brand-intelligence-tool' }
});

const data = await res.json();
const posts = data?.data?.children || [];

console.log(`Found ${posts.length} posts\n`);
posts.forEach(p => {
  const d = p.data;
  console.log(`[${d.score} upvotes] r/${d.subreddit} — ${d.title}`);
  console.log(`  ${d.url}\n`);
});
