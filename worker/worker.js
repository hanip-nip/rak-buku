import { seal, unseal } from './seal.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const google = (env, params) =>
  fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const appOrigin = new URL(env.APP_URL).origin;
    const cors = req.headers.get('origin') === appOrigin
      ? { 'access-control-allow-origin': appOrigin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' }
      : {};
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
    const back = (hash) => Response.redirect(env.APP_URL + hash, 302);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (req.method === 'GET' && url.pathname === '/login') {
      const q = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: url.origin + '/callback',
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
      });
      return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q, 302);
    }

    if (req.method === 'GET' && url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) return back('#auth-error=' + encodeURIComponent(url.searchParams.get('error') || 'no_code'));
      try {
        const r = await google(env, { grant_type: 'authorization_code', code, redirect_uri: url.origin + '/callback' });
        const d = await r.json();
        if (!r.ok || !d.refresh_token) return back('#auth-error=' + encodeURIComponent(d.error || 'no_refresh_token'));
        return back('#auth=' + (await seal(d.refresh_token, env.SEAL_KEY)));
      } catch {
        return back('#auth-error=server_error');
      }
    }

    if (req.method === 'POST' && url.pathname === '/token') {
      let refresh;
      try {
        refresh = await unseal((await req.json()).blob, env.SEAL_KEY);
      } catch {
        return json({ error: 'relogin' }, 401);
      }
      const r = await google(env, { grant_type: 'refresh_token', refresh_token: refresh });
      const d = await r.json();
      if (d.error === 'invalid_grant') return json({ error: 'relogin' }, 401);
      if (!r.ok) return json({ error: d.error || 'upstream' }, 502);
      return json({ access_token: d.access_token, expires_in: d.expires_in });
    }

    return json({ error: 'not_found' }, 404);
  },
};
