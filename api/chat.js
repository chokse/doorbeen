export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { username, password, study } = req.query;
    if (!username || !password || !study) {
      return res.status(400).json({ error: 'Username, password and study required' });
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const encoded = encodeURIComponent(study);
    const sessionRes = await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?username=eq.${username}&password=eq.${password}&study_name=eq.${encoded}&select=query_count,query_limit,study_name`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    const sessions = await sessionRes.json();
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?username=eq.${username}&password=eq.${password}&study_name=eq.${encoded}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ session_token: token, session_token_expires_at: expiresAt }),
      }
    );
    return res.status(200).json({
      queryCount: sessions[0].query_count,
      queryLimit: sessions[0].query_limit ?? 50,
      studyName: sessions[0].study_name,
      sessionToken: token,
    });
  }

  if (req.method === 'DELETE') {
    const { sessionToken } = req.body;
    if (sessionToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
      await fetch(
        `${supabaseUrl}/rest/v1/research_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ session_token: null, session_token_expires_at: null }),
        }
      );
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { sessionToken, messages, system, model, max_tokens } = req.body;

  if (!sessionToken) return res.status(401).json({ error: 'No session token' });

  try {
    // Fetch session by token
    const sessionRes = await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?session_token=eq.${encodeURIComponent(sessionToken)}&select=query_count,query_limit,session_token_expires_at`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    const sessions = await sessionRes.json();
    const session = sessions[0];

    if (!session) return res.status(401).json({ error: 'Invalid session token' });
    if (!session.session_token_expires_at || new Date(session.session_token_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const queryLimit = session.query_limit ?? 50;
    if (session.query_count >= queryLimit) {
      return res.status(429).json({ error: 'Query limit reached' });
    }

    // Increment count
    await fetch(
      `${supabaseUrl}/rest/v1/research_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`,
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
    return res.status(response.status).json({ ...data, queryCount: newCount, queryLimit });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
