import type { Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

interface ShareRecord {
  bodyHtml: string
  stylesHtml: string
  title: string
  createdAt: number
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  // extract id from /functions/share-get?id=xxx or /s/xxx (via redirect)
  const id = url.searchParams.get('id') ?? url.pathname.split('/').pop()

  if (!id) {
    return new Response('Missing share ID', { status: 400 })
  }

  try {
    const store = getStore('shares')
    const record = await store.get(id, { type: 'json' }) as ShareRecord | null

    if (!record) {
      return new Response(renderNotFound(id), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return new Response(renderSharePage(record), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  catch (err) {
    return new Response(`Error: ${String(err)}`, { status: 500 })
  }
}

function renderSharePage(record: ShareRecord): string {
  const title = escapeHtml(record.title || '分享预览')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #f5f5f5;
    color: #333;
    line-height: 1.6;
  }
  .share-content ul,
  .share-content ol {
    list-style: none;
  }
  .share-content figcaption,
  .share-content .md-figcaption {
    text-align: center;
  }
  .share-content {
    max-width: 677px;
    margin: 20px auto;
    background: #fff;
    padding: 20px 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border-radius: 4px;
  }
  @media (max-width: 720px) {
    .share-content { margin: 0; border-radius: 0; }
  }
  .powered-by {
    text-align: center;
    padding: 20px;
    font-size: 12px;
    color: #999;
  }
  .powered-by a { color: #666; text-decoration: none; }
  .powered-by a:hover { text-decoration: underline; }
</style>
${record.stylesHtml}
</head>
<body>
<div class="share-content">
  ${record.bodyHtml}
</div>
<div class="powered-by">
  由 <a href="https://github.com/BluerAngala/cc-md-editor" target="_blank">CC Markdown 编辑器</a> 生成
</div>
</body>
</html>`
}

function renderNotFound(id: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>分享不存在</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; color: #666; }
  .msg { text-align: center; }
  h1 { font-size: 48px; color: #ccc; margin-bottom: 8px; }
  a { color: #07c160; text-decoration: none; }
</style>
</head>
<body>
<div class="msg">
  <h1>404</h1>
  <p>分享链接「${escapeHtml(id)}」不存在或已过期</p>
  <p style="margin-top:16px"><a href="/">返回编辑器</a></p>
</div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
