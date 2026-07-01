/* eslint-disable node/prefer-global/process */
import type { Context } from '@netlify/functions'

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  const clientId = process.env.VITE_GITHUB_CLIENT_ID || ''
  if (!clientId) {
    return Response.json({ error: 'VITE_GITHUB_CLIENT_ID not set in Netlify env vars' }, { status: 500 })
  }

  try {
    if (action === 'device_code') {
      const res = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
      })
      return Response.json(await res.json(), { status: res.status })
    }

    if (action === 'access_token') {
      const body = await req.json() as Record<string, string>
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          device_code: body.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      return Response.json(await res.json(), { status: res.status })
    }

    return Response.json({ error: 'Missing ?action=device_code or ?action=access_token' }, { status: 400 })
  }
  catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
