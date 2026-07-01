import type { CollectorSelectors } from '@/stores/reading'
import { buildAIHeaders, resolveEndpointUrl, useAIFetch } from '@/composables/useAIFetch'
import { useAIConfigStore } from '@/stores/aiConfig'

/**
 * 分析网页 HTML，生成 CSS 选择器采集规则。
 * 使用用户配置的文本模型（OpenAI 兼容 API）。
 */
export function useCollectorAI() {
  const aiConfig = useAIConfigStore()
  const { fetchJSON } = useAIFetch()

  /**
   * 从 HTML 中提取精简的 DOM 结构摘要（去掉属性、脚本、样式，保留标签和文本）。
   * 限制长度避免超出 token 限制。
   */
  function simplifyHTML(html: string, maxLen = 8000): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    // 移除 script/style/nav/footer 等噪音
    doc.querySelectorAll('script, style, noscript, svg, nav, footer, header, iframe').forEach(el => el.remove())
    // 移除所有属性（只保留标签结构和文本）
    const body = doc.body
    if (!body)
      return html.slice(0, maxLen)

    function simplify(el: Element, depth = 0): string {
      if (depth > 8)
        return ''
      const tag = el.tagName.toLowerCase()
      const children = Array.from(el.childNodes).map((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent?.trim()
          return text ? ` ${text} ` : ''
        }
        if (child.nodeType === Node.ELEMENT_NODE) {
          return simplify(child as Element, depth + 1)
        }
        return ''
      }).join('')
      // 只保留 class 属性（对选择器生成最关键）
      const cls = el.getAttribute('class')
      const clsAttr = cls ? ` class="${cls.slice(0, 100)}"` : ''
      return `<${tag}${clsAttr}>${children}</${tag}>`
    }

    const simplified = simplify(body)
    return simplified.length > maxLen ? `${simplified.slice(0, maxLen)}\n...[截断]` : simplified
  }

  /**
   * 调用 AI 模型分析 HTML 并生成采集规则。
   */
  async function analyzePage(
    url: string,
    html: string,
    description: string,
    onProgress?: (msg: string) => void,
  ): Promise<CollectorSelectors> {
    const simplified = simplifyHTML(html)
    onProgress?.('正在分析页面结构...')

    const systemPrompt = `你是一个网页数据采集专家。用户会给你一个网页的 HTML 结构和采集需求，你需要输出 CSS 选择器来提取数据。

输出格式必须是严格的 JSON，不要包含任何其他文字：
{
  "item": "文章列表项的 CSS 选择器（每项 = 一篇文章/一条数据）",
  "title": "标题选择器（相对于 item）",
  "link": "链接选择器（相对于 item，提取 href）",
  "content": "内容选择器（相对于 item，可留空）",
  "summary": "摘要选择器（相对于 item，可留空）",
  "author": "作者选择器（相对于 item，可留空）",
  "date": "日期选择器（相对于 item，可留空）"
}

规则：
- 选择器要尽量精确、稳定（优先用 class，避免 nth-child）
- 留空字符串表示该字段无法从列表页获取
- link 的 href 如果是相对路径，系统会自动补全
- 只输出 JSON，不要解释`

    const userPrompt = `目标网页：${url}
采集需求：${description}

HTML 结构（已精简，保留 class 属性）：
${simplified}`

    const endpoint = aiConfig.textEndpoint || aiConfig.endpoint
    const apiKey = aiConfig.textApiKey || aiConfig.apiKey
    const model = aiConfig.textModel || aiConfig.model
    const type = aiConfig.textType || aiConfig.type

    const url_ = resolveEndpointUrl(endpoint, 'chat')
    const headers = buildAIHeaders(apiKey, type)

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      stream: false,
    }

    const res = await fetchJSON<{ choices?: Array<{ message?: { content?: string } }> }>(url_, headers, payload)
    if (!res.ok || !res.data) {
      throw new Error(`AI 分析失败: ${res.status} ${res.statusText}`)
    }

    const content = res.data.choices?.[0]?.message?.content || ''
    // 提取 JSON（AI 可能会包裹在 ```json ``` 中）
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AI 未返回有效的 JSON 格式')
    }

    const selectors = JSON.parse(jsonMatch[0]) as CollectorSelectors

    // 验证必填字段
    if (!selectors.item || !selectors.title) {
      throw new Error('AI 生成的选择器缺少必填字段（item、title）')
    }

    return selectors
  }

  return { analyzePage, simplifyHTML }
}
