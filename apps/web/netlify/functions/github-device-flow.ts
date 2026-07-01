import type { Context } from '@netlify/functions'

export default async (req: Request, _context: Context) => {
  const GITHUB_CLIENT_ID = Deno.env.get('VITE_GITHUB_CLIENT_ID') || ''
  if (!GITHUB_CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'VITE_GITHUB_CLIENT_ID not configured in Netlify env vars' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (action === 'device_code') {
      const res = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }),
      })
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (action === 'access_token') {
      const body = await req.json() as Record<string, string>
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: body.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Missing ?action=device_code or ?action=access_token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
