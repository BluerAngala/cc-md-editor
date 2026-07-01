import { defineStore } from 'pinia'
import RSSParser from 'rss-parser'
import { ref } from 'vue'

const STORAGE_SOURCES = 'reading_sources'
const STORAGE_ARTICLES = 'reading_articles'

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

export interface RSSSource {
  id: string
  url: string
  title: string
  category: string
  addedAt: number
  /** 自动刷新间隔（分钟），0 = 关闭 */
  refreshInterval: number
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
}

const DEFAULT_SOURCES: RSSSource[] = [
  { id: 'solidot', url: 'https://feeds.feedburner.com/solidot', title: '奇客Solidot', category: '科技', addedAt: Date.now(), refreshInterval: 30 },
  { id: '36kr', url: 'https://36kr.com/feed', title: '36氪', category: '商业', addedAt: Date.now(), refreshInterval: 30 },
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

  function triggerSync() {
    window.dispatchEvent(new CustomEvent('md:data-changed', { detail: { scope: 'reading' } }))
  }

  // ── 计算属性 ─────────────────────────────────────────
  const categories = computed(() => {
    const cats = new Set(sources.value.map(s => s.category).filter(Boolean))
    return Array.from(cats).sort()
  })

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

  async function fetchAll() {
    loading.value = true
    error.value = ''
    try {
      const results = await Promise.allSettled(
        sources.value.map(async (src) => {
          try {
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
            } as Article))
          }
          catch (e) {
            console.warn(`[ReadingStore] Failed to fetch ${src.url}:`, e)
            return []
          }
        }),
      )
      // 合并新文章，去重
      const newArticles = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
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
      const feed = await fetchFeed(src.url)
      const srcTitle = feed.title || src.title
      const newArticles = feed.items.map(item => ({
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
    }, 60_000)
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer)
      autoRefreshTimer = null
    }
  }

  /** 是否有任何源开启了自动刷新 */
  const hasAutoRefresh = computed(() => sources.value.some(s => s.refreshInterval > 0))

  function reloadFromStorage() {
    sources.value = loadFromStorage<RSSSource[]>(STORAGE_SOURCES, DEFAULT_SOURCES)
    articles.value = loadFromStorage<Article[]>(STORAGE_ARTICLES, [])
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
