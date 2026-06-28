import type { Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

interface ShareRecord {
  bodyHtml: string
  stylesHtml: string
  title: string
  createdAt: number
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (const b of bytes)
    id += chars[b % chars.length]
  return id
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { htmlSnapshot, title } = body as {
      htmlSnapshot?: { bodyHtml?: string, stylesHtml?: string }
      title?: string
    }

    if (!htmlSnapshot?.bodyHtml) {
      return new Response(JSON.stringify({ error: 'Missing htmlSnapshot' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const id = generateId()
    const store = getStore('shares')
    const record: ShareRecord = {
      bodyHtml: htmlSnapshot.bodyHtml,
      stylesHtml: htmlSnapshot.stylesHtml ?? '',
      title: title ?? '',
      createdAt: Date.now(),
    }

    await store.setJSON(id, record)

    const url = new URL(req.url)
    const baseUrl = `${url.protocol}//${url.host}`
    const shareUrl = `${baseUrl}/s/${id}`

    return new Response(JSON.stringify({
      id,
      url: shareUrl,
      expiresAt: null,
      updated: false,
      protected: false,
    }), {
      status: 200,
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
