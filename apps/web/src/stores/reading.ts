import { defineStore } from 'pinia'
import RSSParser from 'rss-parser'
import { computed, ref } from 'vue'

const STORAGE_SOURCES = 'reading_sources'
const STORAGE_ARTICLES = 'reading_articles'
const STORAGE_COLLECTORS = 'reading_collectors'

// CORS 代理：浏览器不能直接 fetch 任意网页
const CORS_PROXY = 'https://api.allorigins.win/raw?url='

// RSS 代理：浏览器直接 fetch RSS 会被 CORS 拦截
// rss2json 提供免费的 RSS 解析 API，返回结构化 JSON
const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json?rss_url='

async function fetchFeed(url: string): Promise<{ title: string, items: any[] }> {
  // 先尝试直接请求（自建 RSSHub 可能已配置 CORS）
  try {
    const parser = new RSSParser()
    const res = await window.fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const xml = await res.text()
      const feed = await parser.parseString(xml)
      return { title: feed.title || '', items: feed.items }
    }
  }
  catch { /* CORS 拦截，走代理 */ }

  // 走 rss2json 代理
  const res = await window.fetch(RSS2JSON_API + encodeURIComponent(url))
  if (!res.ok)
    throw new Error(`代理请求失败: ${res.status}`)
  const data = await res.json()
  if (data.status !== 'ok')
    throw new Error(data.message || 'RSS 解析失败')
  return {
    title: data.feed?.title || '',
    items: data.items.map((item: any) => ({
      title: item.title,
      link: item.link,
      content: item.content,
      contentSnippet: item.description?.replace(/<[^>]*>/g, '').slice(0, 200),
      creator: item.author,
      pubDate: item.pubDate,
      guid: item.guid,
    })),
  }
}

/** 通过 CORS 代理获取网页 HTML */
async function fetchHTML(url: string): Promise<string> {
  const res = await window.fetch(CORS_PROXY + encodeURIComponent(url), {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok)
    throw new Error(`获取页面失败: ${res.status}`)
  return res.text()
}

/** 用 CSS 选择器从 HTML 中提取文章列表 */
function parseHTMLWithSelectors(html: string, selectors: CollectorSelectors, sourceId: string, sourceTitle: string, baseUrl = ''): Article[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const items = doc.querySelectorAll(selectors.item)
  const articles: Article[] = []

  items.forEach((el, i) => {
    const titleEl = selectors.title ? el.querySelector(selectors.title) : null
    const linkEl = selectors.link ? el.querySelector(selectors.link) : null
    const contentEl = selectors.content ? el.querySelector(selectors.content) : null
    const summaryEl = selectors.summary ? el.querySelector(selectors.summary) : null
    const authorEl = selectors.author ? el.querySelector(selectors.author) : null
    const dateEl = selectors.date ? el.querySelector(selectors.date) : null

    const title = titleEl?.textContent?.trim() || ''
    if (!title)
      return

    const href = linkEl?.getAttribute('href') || ''
    const link = href.startsWith('http') ? href : href.startsWith('/') ? new URL(baseUrl).origin + href : ''
    const content = contentEl?.innerHTML || ''
    const summary = summaryEl?.textContent?.trim() || content.replace(/<[^>]*>/g, '').slice(0, 200)
    const author = authorEl?.textContent?.trim() || ''
    const dateStr = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || ''
    const publishedAt = dateStr ? new Date(dateStr).getTime() || Date.now() - i * 60000 : Date.now() - i * 60000

    articles.push({
      id: `col-${sourceId}-${link || title}-${i}`,
      sourceId,
      sourceTitle,
      title,
      link,
      content,
      summary,
      author,
      publishedAt,
      read: false,
      starred: false,
      type: 'collector',
    })
  })

  return articles
}

export interface RSSSource {
  id: string
  url: string
  title: string
  category: string
  addedAt: number
  /** 自动刷新间隔（分钟），0 = 关闭 */
  refreshInterval: number
}

export interface CollectorSource {
  id: string
  url: string
  title: string
  category: string
  addedAt: number
  refreshInterval: number
  /** 提取规则：CSS 选择器 */
  selectors: CollectorSelectors
  /** AI 分析时的原始描述 */
  description: string
}

export interface CollectorSelectors {
  /** 文章列表容器（每项 = 一篇文章） */
  item: string
  /** 相对于 item 的选择器 */
  title: string
  link: string
  content: string
  summary: string
  author: string
  date: string
}

export interface Article {
  id: string
  sourceId: string
  sourceTitle: string
  title: string
  link: string
  content: string
  summary: string
  author: string
  publishedAt: number
  read: boolean
  starred: boolean
  /** rss = RSS 订阅，collector = 通用采集 */
  type?: 'rss' | 'collector'
}

const DEFAULT_SOURCES: RSSSource[] = [
  { id: 'solidot', url: 'https://feeds.feedburner.com/solidot', title: '奇客Solidot', category: '科技', addedAt: Date.now(), refreshInterval: 30 },
  { id: '36kr', url: 'https://36kr.com/feed', title: '36氪', category: '商业', addedAt: Date.now(), refreshInterval: 30 },
  // 法律/政策源（JSON API）
  { id: 'gov-policy', url: 'legal://gov-policy', title: '中国政府网·最新政策', category: '政策法规', addedAt: Date.now(), refreshInterval: 60 },
  { id: 'cctv-law', url: 'legal://cctv-law', title: '央视网·法治频道', category: '法治资讯', addedAt: Date.now(), refreshInterval: 60 },
]

const DEFAULT_COLLECTORS: CollectorSource[] = [
  { id: 'gzlawyer', url: 'https://www.gzlawyer.org/notices', title: '广州律协', category: '律师协会', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="info"]', title: '', link: '', content: '', summary: '', author: '', date: '.date, .time, time' }, description: '广州律师协会通知公告' },
  { id: 'chinacourt-qa', url: 'https://www.chinacourt.cn/article/index/id/MzAwNDAwNTBIApMEAAA.shtml', title: '中国法院网·法律问答', category: '司法案例', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="/article/"]', title: '', link: '', content: '', summary: '', author: '', date: '.right, .date, time' }, description: '中国法院网法律问答' },
  { id: 'chinacourt-case', url: 'https://www.chinacourt.cn/article/index/id/MzAwNDAwNTAwNyACAAA.shtml', title: '中国法院网·案例点评', category: '司法案例', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="/article/"]', title: '', link: '', content: '', summary: '', author: '', date: '.right, .date, time' }, description: '中国法院网案例点评' },
  { id: 'court-judicial', url: 'https://www.court.gov.cn/fabu/gengduo/17.html', title: '最高法·司法文件', category: '司法文件', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="court.gov.cn"]', title: '', link: '', content: '', summary: '', author: '', date: 'span, .date, time' }, description: '最高人民法院司法文件' },
  { id: 'court-interpretation', url: 'https://www.court.gov.cn/fabu/gengduo/16.html', title: '最高法·司法解释', category: '司法文件', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="court.gov.cn"]', title: '', link: '', content: '', summary: '', author: '', date: 'span, .date, time' }, description: '最高人民法院司法解释' },
  { id: 'moj-law', url: 'http://www.moj.gov.cn/pub/sfbgw/flfggz/flfg/', title: '司法部·最新发布', category: '政策法规', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="moj.gov.cn"]', title: '', link: '', content: '', summary: '', author: '', date: 'span, .date, time' }, description: '司法部法律法规' },
  { id: 'samr-law', url: 'https://www.samr.gov.cn/flfg/', title: '市监局·法规', category: '政策法规', addedAt: Date.now(), refreshInterval: 120, selectors: { item: 'a[href*="samr.gov.cn"]', title: '', link: '', content: '', summary: '', author: '', date: 'span, .date, time' }, description: '市场监管总局法规' },
  { id: 'ai-hot', url: 'https://aihot.virxact.com/', title: 'AI热点资讯', category: '科技资讯', addedAt: Date.now(), refreshInterval: 60, selectors: { item: 'a[href]', title: '', link: '', content: '', summary: '', author: '', date: 'span, .date, time' }, description: 'AI 热点新闻聚合' },
]

export const useReadingStore = defineStore('reading', () => {
  // ── 数据 ─────────────────────────────────────────────
  const sources = ref<RSSSource[]>(loadFromStorage<RSSSource[]>(STORAGE_SOURCES, DEFAULT_SOURCES))
  const articles = ref<Article[]>(loadFromStorage<Article[]>(STORAGE_ARTICLES, []))
  const loading = ref(false)
  const error = ref('')
  const activeSourceId = ref<string | null>(null)
  const activeArticleId = ref<string | null>(null)
  const searchQuery = ref('')
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
  /** 每个源上次自动刷新的时间戳 */
  const lastFetchMap = ref<Record<string, number>>({})

  // ── 采集器数据 ───────────────────────────────────────
  const collectors = ref<CollectorSource[]>(loadFromStorage<CollectorSource[]>(STORAGE_COLLECTORS, DEFAULT_COLLECTORS))
  const collectorLoading = ref(false)
  const collectorError = ref('')

  function triggerSync() {
    window.dispatchEvent(new CustomEvent('md:data-changed', { detail: { scope: 'reading' } }))
  }

  // ── 计算属性 ─────────────────────────────────────────
  const categories = computed(() => {
    const cats = new Set([
      ...sources.value.map(s => s.category),
      ...collectors.value.map(s => s.category),
    ].filter(Boolean))
    return Array.from(cats).sort()
  })

  /** 合并 RSS + 采集器源列表，供侧栏显示 */
  const allSources = computed(() => [
    ...sources.value.map(s => ({ ...s, sourceType: 'rss' as const })),
    ...collectors.value.map(s => ({ ...s, sourceType: 'collector' as const })),
  ])

  /** 每个源的未读数 */
  const unreadCountMap = computed(() => {
    const map: Record<string, number> = {}
    for (const a of articles.value) {
      if (!a.read) {
        map[a.sourceId] = (map[a.sourceId] || 0) + 1
      }
    }
    return map
  })

  const totalUnread = computed(() => articles.value.filter(a => !a.read).length)

  // ── 列表（收藏夹分组） ────────────────────────────────
  const STORAGE_LISTS = 'reading_lists'
  interface ReadingList {
    id: string
    name: string
    articleIds: string[]
    createdAt: number
  }
  const lists = ref<ReadingList[]>(loadFromStorage<ReadingList[]>(STORAGE_LISTS, []))

  function addList(name: string) {
    lists.value.push({ id: `list-${Date.now()}`, name, articleIds: [], createdAt: Date.now() })
    localStorage.setItem(STORAGE_LISTS, JSON.stringify(lists.value))
  }

  function removeList(id: string) {
    lists.value = lists.value.filter(l => l.id !== id)
    localStorage.setItem(STORAGE_LISTS, JSON.stringify(lists.value))
  }

  function addToList(listId: string, articleId: string) {
    const list = lists.value.find(l => l.id === listId)
    if (list && !list.articleIds.includes(articleId)) {
      list.articleIds.push(articleId)
      localStorage.setItem(STORAGE_LISTS, JSON.stringify(lists.value))
    }
  }

  function removeFromList(listId: string, articleId: string) {
    const list = lists.value.find(l => l.id === listId)
    if (list) {
      list.articleIds = list.articleIds.filter(id => id !== articleId)
      localStorage.setItem(STORAGE_LISTS, JSON.stringify(lists.value))
    }
  }

  function getListArticles(listId: string): Article[] {
    const list = lists.value.find(l => l.id === listId)
    if (!list)
      return []
    const idSet = new Set(list.articleIds)
    return articles.value.filter(a => idSet.has(a.id))
  }

  const filteredArticles = computed(() => {
    let result = articles.value
    if (activeSourceId.value)
      result = result.filter(a => a.sourceId === activeSourceId.value)
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      result = result.filter(a =>
        a.title.toLowerCase().includes(q)
        || a.summary.toLowerCase().includes(q)
        || a.sourceTitle.toLowerCase().includes(q),
      )
    }
    return result.sort((a, b) => b.publishedAt - a.publishedAt)
  })

  const activeArticle = computed(() =>
    articles.value.find(a => a.id === activeArticleId.value) || null,
  )

  // ── 操作 ─────────────────────────────────────────────
  function addSource(url: string, title: string, category: string, refreshInterval = 30) {
    const id = `src-${Date.now()}`
    sources.value.push({ id, url, title, category, addedAt: Date.now(), refreshInterval })
    saveSources()
  }

  function updateSourceInterval(id: string, minutes: number) {
    const src = sources.value.find(s => s.id === id)
    if (src) {
      src.refreshInterval = minutes
      saveSources()
    }
  }

  function removeSource(id: string) {
    sources.value = sources.value.filter(s => s.id !== id)
    articles.value = articles.value.filter(a => a.sourceId !== id)
    saveSources()
    saveArticles()
  }

  // ── 采集器操作 ───────────────────────────────────────
  function addCollector(url: string, title: string, category: string, selectors: CollectorSelectors, description: string, refreshInterval = 60) {
    const id = `col-${Date.now()}`
    collectors.value.push({ id, url, title, category, addedAt: Date.now(), refreshInterval, selectors, description })
    saveCollectors()
  }

  function removeCollector(id: string) {
    collectors.value = collectors.value.filter(s => s.id !== id)
    articles.value = articles.value.filter(a => a.sourceId !== id)
    saveCollectors()
    saveArticles()
  }

  function updateCollectorInterval(id: string, minutes: number) {
    const src = collectors.value.find(s => s.id === id)
    if (src) {
      src.refreshInterval = minutes
      saveCollectors()
    }
  }

  async function fetchCollector(src: CollectorSource) {
    try {
      const html = await fetchHTML(src.url)
      const newArticles = parseHTMLWithSelectors(html, src.selectors, src.id, src.title, src.url)
      const existingIds = new Set(articles.value.map(a => a.id))
      const toAdd = newArticles.filter(a => !existingIds.has(a.id))
      if (toAdd.length) {
        articles.value = [...toAdd, ...articles.value].slice(0, 500)
        saveArticles()
      }
      lastFetchMap.value[src.id] = Date.now()
    }
    catch (e) {
      console.warn(`[ReadingStore] Collector fetch failed for ${src.url}:`, e)
    }
  }

  /** 预览采集结果（不保存） */
  async function previewCollector(url: string, selectors: CollectorSelectors): Promise<Article[]> {
    const html = await fetchHTML(url)
    return parseHTMLWithSelectors(html, selectors, 'preview', '', url)
  }

  /** 获取网页 HTML（供 AI 分析用） */
  async function fetchPageHTML(url: string): Promise<string> {
    return fetchHTML(url)
  }

  /**
   * 全文提取：从文章链接获取完整正文。
   * 使用 CORS 代理 + DOM 解析提取主要内容。
   */
  async function fetchFullText(url: string): Promise<string> {
    const html = await fetchHTML(url)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    // 移除噪音元素
    doc.querySelectorAll('script, style, noscript, nav, footer, header, aside, iframe, .ad, .advertisement, .sidebar, .comment').forEach(el => el.remove())
    // 尝试常见正文容器
    const selectors = ['article', 'main', '.post-content', '.article-content', '.entry-content', '.content', '#content', '.post-body']
    for (const sel of selectors) {
      const el = doc.querySelector(sel)
      if (el && el.textContent && el.textContent.trim().length > 200) {
        return el.innerHTML
      }
    }
    // 回退到 body
    return doc.body?.innerHTML || ''
  }

  /**
   * RSSHub 路由发现：输入 URL，查询 RSSHub API 获取可用的 RSS 路由。
   */
  async function discoverRSSHubRoutes(url: string): Promise<Array<{ name: string, path: string }>> {
    try {
      const domain = new URL(url).hostname
      const res = await window.fetch(`https://rsshub.app/v1/website?domain=${domain}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok)
        return []
      const data = await res.json()
      if (data.routes && Array.isArray(data.routes)) {
        return data.routes.map((r: string) => ({
          name: r,
          path: `https://rsshub.app${r}`,
        }))
      }
      return []
    }
    catch {
      return []
    }
  }

  // ── 法律/政策数据源 ──────────────────────────────────

  /** 中国政府网·最新政策（JSON API） */
  async function fetchGovPolicy(maxItems = 10): Promise<Article[]> {
    try {
      const res = await window.fetch(
        CORS_PROXY + encodeURIComponent('https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json'),
        { signal: AbortSignal.timeout(15000) },
      )
      if (!res.ok)
        return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, maxItems).map((item: any, i: number) => ({
        id: `gov-policy-${item.URL?.match(/content_(\d+)\.htm/)?.[1] || i}`,
        sourceId: 'gov-policy',
        sourceTitle: '中国政府网',
        title: item.TITLE || '无标题',
        link: item.URL || '',
        content: '',
        summary: item.SUB_TITLE || '',
        author: '',
        publishedAt: item.DOCRELPUBTIME ? new Date(item.DOCRELPUBTIME).getTime() : Date.now(),
        read: false,
        starred: false,
        type: 'collector' as const,
      }))
    }
    catch (e) {
      console.warn('[GovPolicy] Fetch failed:', e)
      return []
    }
  }

  /** 央视网·法治频道（JSONP API） */
  async function fetchCctvLaw(maxItems = 10): Promise<Article[]> {
    try {
      const res = await window.fetch(
        CORS_PROXY + encodeURIComponent('https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/law_1.jsonp?cb=law'),
        { signal: AbortSignal.timeout(15000) },
      )
      if (!res.ok)
        return []
      let text = await res.text()
      // 剥离 JSONP 包裹：law({...})
      text = text.replace(/^law\(/, '').replace(/\);?$/, '')
      const data = JSON.parse(text)
      const items = data?.data?.list || []
      return items.slice(0, maxItems).map((item: any, i: number) => ({
        id: `cctv-law-${item.url?.match(/ARTI[\w-]+/)?.[0] || i}`,
        sourceId: 'cctv-law',
        sourceTitle: '央视网·法治',
        title: item.title || '无标题',
        link: item.url || '',
        content: '',
        summary: item.brief || '',
        author: '',
        publishedAt: item.focus_date ? new Date(item.focus_date).getTime() : Date.now(),
        read: false,
        starred: false,
        type: 'collector' as const,
      }))
    }
    catch (e) {
      console.warn('[CctvLaw] Fetch failed:', e)
      return []
    }
  }

  async function fetchAll() {
    loading.value = true
    error.value = ''
    try {
      // 并行获取 RSS + 采集器
      const [rssResults, collectorResults] = await Promise.all([
        Promise.allSettled(
          sources.value.map(async (src) => {
            try {
              // 法律/政策 JSON 源
              if (src.url.startsWith('legal://')) {
                const id = src.url.replace('legal://', '')
                if (id === 'gov-policy')
                  return fetchGovPolicy()
                if (id === 'cctv-law')
                  return fetchCctvLaw()
                return []
              }
              // 标准 RSS 源
              const feed = await fetchFeed(src.url)
              const srcTitle = feed.title || src.title
              return feed.items.map(item => ({
                id: `art-${src.id}-${item.guid || item.link || Date.now()}`,
                sourceId: src.id,
                sourceTitle: srcTitle,
                title: item.title || '无标题',
                link: item.link || '',
                content: item.content || item.contentSnippet || '',
                summary: item.contentSnippet?.slice(0, 200) || item.content?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
                author: item.creator || item.author || '',
                publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
                read: false,
                starred: false,
                type: 'rss' as const,
              } as Article))
            }
            catch (e) {
              console.warn(`[ReadingStore] Failed to fetch ${src.url}:`, e)
              return []
            }
          }),
        ),
        Promise.allSettled(
          collectors.value.map(async (src) => {
            try {
              const html = await fetchHTML(src.url)
              return parseHTMLWithSelectors(html, src.selectors, src.id, src.title, src.url)
            }
            catch (e) {
              console.warn(`[ReadingStore] Failed to collect ${src.url}:`, e)
              return []
            }
          }),
        ),
      ])
      // 合并新文章，去重
      const newArticles = [
        ...rssResults.flatMap(r => r.status === 'fulfilled' ? r.value : []),
        ...collectorResults.flatMap(r => r.status === 'fulfilled' ? r.value : []),
      ]
      const existingIds = new Set(articles.value.map(a => a.id))
      const toAdd = newArticles.filter(a => !existingIds.has(a.id))
      articles.value = [...toAdd, ...articles.value].slice(0, 500) // 最多 500 篇
      saveArticles()
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '获取失败'
    }
    finally {
      loading.value = false
    }
  }

  function markRead(id: string) {
    const article = articles.value.find(a => a.id === id)
    if (article) {
      article.read = true
      saveArticles()
    }
  }

  function toggleStar(id: string) {
    const article = articles.value.find(a => a.id === id)
    if (article) {
      article.starred = !article.starred
      saveArticles()
    }
  }

  function setActiveArticle(id: string | null) {
    activeArticleId.value = id
    if (id)
      markRead(id)
  }

  function deleteArticle(id: string) {
    articles.value = articles.value.filter(a => a.id !== id)
    if (activeArticleId.value === id)
      activeArticleId.value = null
    saveArticles()
  }

  function deleteArticles(ids: Set<string>) {
    articles.value = articles.value.filter(a => !ids.has(a.id))
    if (activeArticleId.value && ids.has(activeArticleId.value))
      activeArticleId.value = null
    saveArticles()
  }

  function starArticles(ids: Set<string>) {
    for (const article of articles.value) {
      if (ids.has(article.id))
        article.starred = true
    }
    saveArticles()
  }

  function unstarArticles(ids: Set<string>) {
    for (const article of articles.value) {
      if (ids.has(article.id))
        article.starred = false
    }
    saveArticles()
  }

  // ── 自动刷新（按订阅源间隔） ──────────────────────
  async function fetchSource(src: RSSSource) {
    try {
      let newArticles: Article[] = []
      if (src.url.startsWith('legal://')) {
        const id = src.url.replace('legal://', '')
        if (id === 'gov-policy')
          newArticles = await fetchGovPolicy()
        else if (id === 'cctv-law')
          newArticles = await fetchCctvLaw()
      }
      else {
        const feed = await fetchFeed(src.url)
        const srcTitle = feed.title || src.title
        newArticles = feed.items.map(item => ({
          id: `art-${src.id}-${item.guid || item.link || Date.now()}`,
          sourceId: src.id,
          sourceTitle: srcTitle,
          title: item.title || '无标题',
          link: item.link || '',
          content: item.content || item.contentSnippet || '',
          summary: item.contentSnippet?.slice(0, 200) || item.content?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
          author: item.creator || item.author || '',
          publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
          read: false,
          starred: false,
        } as Article))
      }
      const existingIds = new Set(articles.value.map(a => a.id))
      const toAdd = newArticles.filter(a => !existingIds.has(a.id))
      if (toAdd.length) {
        articles.value = [...toAdd, ...articles.value].slice(0, 500)
        saveArticles()
      }
      lastFetchMap.value[src.id] = Date.now()
    }
    catch (e) {
      console.warn(`[ReadingStore] Auto-refresh failed for ${src.url}:`, e)
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh()
    // 每分钟检查一次哪些源需要刷新
    autoRefreshTimer = setInterval(() => {
      if (loading.value)
        return
      const now = Date.now()
      for (const src of sources.value) {
        if (src.refreshInterval <= 0)
          continue
        const lastFetch = lastFetchMap.value[src.id] || 0
        if (now - lastFetch >= src.refreshInterval * 60 * 1000)
          void fetchSource(src)
      }
      for (const src of collectors.value) {
        if (src.refreshInterval <= 0)
          continue
        const lastFetch = lastFetchMap.value[src.id] || 0
        if (now - lastFetch >= src.refreshInterval * 60 * 1000)
          void fetchCollector(src)
      }
    }, 60_000)
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer)
      autoRefreshTimer = null
    }
  }

  /** 是否有任何源开启了自动刷新 */
  const hasAutoRefresh = computed(() =>
    sources.value.some(s => s.refreshInterval > 0) || collectors.value.some(s => s.refreshInterval > 0),
  )

  function reloadFromStorage() {
    sources.value = loadFromStorage<RSSSource[]>(STORAGE_SOURCES, DEFAULT_SOURCES)
    articles.value = loadFromStorage<Article[]>(STORAGE_ARTICLES, [])
    collectors.value = loadFromStorage<CollectorSource[]>(STORAGE_COLLECTORS, [])
  }

  function resetToDefaults() {
    sources.value = [...DEFAULT_SOURCES]
    saveSources()
    void fetchAll()
  }

  // ── 持久化 ───────────────────────────────────────────
  function saveSources() {
    localStorage.setItem(STORAGE_SOURCES, JSON.stringify(sources.value))
    triggerSync()
  }

  function saveArticles() {
    localStorage.setItem(STORAGE_ARTICLES, JSON.stringify(articles.value))
    triggerSync()
  }

  function saveCollectors() {
    localStorage.setItem(STORAGE_COLLECTORS, JSON.stringify(collectors.value))
    triggerSync()
  }

  return {
    sources,
    articles,
    loading,
    error,
    activeSourceId,
    activeArticleId,
    searchQuery,
    categories,
    filteredArticles,
    activeArticle,
    hasAutoRefresh,
    // 未读计数
    unreadCountMap,
    totalUnread,
    // 列表
    lists,
    addList,
    removeList,
    addToList,
    removeFromList,
    getListArticles,
    // 采集器
    collectors,
    collectorLoading,
    collectorError,
    allSources,
    addCollector,
    removeCollector,
    updateCollectorInterval,
    fetchCollector,
    previewCollector,
    fetchPageHTML,
    fetchFullText,
    discoverRSSHubRoutes,
    fetchGovPolicy,
    fetchCctvLaw,
    // RSS
    addSource,
    updateSourceInterval,
    removeSource,
    fetchAll,
    markRead,
    toggleStar,
    setActiveArticle,
    deleteArticle,
    deleteArticles,
    starArticles,
    unstarArticles,
    startAutoRefresh,
    stopAutoRefresh,
    reloadFromStorage,
    resetToDefaults,
  }
})

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      // 空数组回退到默认值，避免用户清空订阅后无法恢复
      if (Array.isArray(parsed) && parsed.length === 0)
        return fallback
      return parsed
    }
  }
  catch { /* ignore */ }
  return fallback
}
