import { defineStore } from 'pinia'
import RSSParser from 'rss-parser'
import { ref } from 'vue'

const STORAGE_SOURCES = 'reading_sources'
const STORAGE_ARTICLES = 'reading_articles'

// CORS 代理：浏览器直接 fetch RSS 会被拦截，通过代理中转
const CORS_PROXY = 'https://api.allorigins.win/raw?url='

async function fetchWithProxy(url: string): Promise<string> {
  // 先尝试直接请求（自建 RSSHub 可能已配置 CORS）
  try {
    const res = await window.fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok)
      return await res.text()
  }
  catch { /* CORS 拦截，走代理 */ }
  // 走代理
  const res = await window.fetch(CORS_PROXY + encodeURIComponent(url))
  if (!res.ok)
    throw new Error(`代理请求失败: ${res.status}`)
  return await res.text()
}

export interface RSSSource {
  id: string
  url: string
  title: string
  category: string
  addedAt: number
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
  { id: 'scspcx', url: 'https://rsshub.app/sspai/matrix', title: '少数派', category: '科技', addedAt: Date.now() },
  { id: 'zhihu-hot', url: 'https://rsshub.app/zhihu/hotlist', title: '知乎热榜', category: '热点', addedAt: Date.now() },
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
  function addSource(url: string, title: string, category: string) {
    const id = `src-${Date.now()}`
    sources.value.push({ id, url, title, category, addedAt: Date.now() })
    saveSources()
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
      const parser = new RSSParser()
      const results = await Promise.allSettled(
        sources.value.map(async (src) => {
          try {
            const xml = await fetchWithProxy(src.url)
            const feed = await parser.parseString(xml)
            return feed.items.map(item => ({
              id: `art-${src.id}-${item.guid || item.link || Date.now()}`,
              sourceId: src.id,
              sourceTitle: src.title,
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

  // ── 持久化 ───────────────────────────────────────────
  function saveSources() {
    localStorage.setItem(STORAGE_SOURCES, JSON.stringify(sources.value))
  }

  function saveArticles() {
    localStorage.setItem(STORAGE_ARTICLES, JSON.stringify(articles.value))
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
    addSource,
    removeSource,
    fetchAll,
    markRead,
    toggleStar,
    setActiveArticle,
  }
})

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw)
      return JSON.parse(raw)
  }
  catch { /* ignore */ }
  return fallback
}
