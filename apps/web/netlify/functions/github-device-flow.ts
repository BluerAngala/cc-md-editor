/**
 * Netlify Function: GitHub Device Flow 代理
 * 浏览器不能直接调 GitHub 的 Device Flow 端点（CORS 限制），
 * 通过这个函数中转。
 */

import type { Context } from '@netlify/functions'

const GITHUB_CLIENT_ID = Deno.env.get('VITE_GITHUB_CLIENT_ID') || ''

export default async (req: Request, _context: Context) => {
  if (!GITHUB_CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'VITE_GITHUB_CLIENT_ID not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (action === 'device_code') {
    // 发起 Device Flow
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo',
      }),
    })
    const data = await res.text()
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (action === 'access_token') {
    // 轮询获取 access_token
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
    const data = await res.text()
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'Missing ?action=device_code or ?action=access_token' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}
