export default async function handler(req, res) {
  if (req.method === 'GET') {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const sessionRes = await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?username=eq.${username}&select=query_count`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    const sessions = await sessionRes.json();
    return res.status(200).json({ queryCount: sessions[0]?.query_count ?? 0 });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { username, messages, system, model, max_tokens } = req.body;

  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // Fetch current query count
    const sessionRes = await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?username=eq.${username}&select=query_count`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    const sessions = await sessionRes.json();
    const session = sessions[0];

    if (!session) {
      return res.status(403).json({ error: 'Session not found' });
    }

    if (session.query_count >= 50) {
      return res.status(429).json({ error: 'Query limit reached' });
    }

    // Increment count
    await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?username=eq.${username}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          query_count: session.query_count + 1,
          last_query_at: new Date().toISOString(),
        }),
      }
    );

    // Call Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const data = await response.json();
    const newCount = session.query_count + 1;
    return res.status(response.status).json({ ...data, queryCount: newCount });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
