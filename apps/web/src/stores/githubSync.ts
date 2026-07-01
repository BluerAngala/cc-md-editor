import { watch } from 'vue'
import { formatLocalDateTime } from '@/i18n/translate'
import { GitHubSyncClient } from '@/services/github/client'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { usePostStore } from '@/stores/post'

const GITHUB_TOKEN_KEY = addPrefix('github_token')
const LAST_SYNC_KEY = addPrefix('github_last_sync')
const REPO_NAME_KEY = addPrefix('github_repo_name')

export type SyncScope = 'all' | 'editor' | 'reading' | 'ideaBoard'

// ── 远端路径 ──
const PATH_EDITOR_POSTS = 'editor/posts'
const PATH_EDITOR_SETTINGS = 'editor/settings.json'
const PATH_READING = 'reading/data.json'
const PATH_IDEA_BOARD = 'idea-board/notes.json'
const PATH_CONFIG = 'config.json'

// ── localStorage keys ──
const LS_READING_SOURCES = 'reading_sources'
const LS_READING_ARTICLES = 'reading_articles'
const LS_IDEA_BOARD = 'idea-board-notes'

const EDITOR_SETTING_KEYS = [
  addPrefix('theme'),
  addPrefix('themeSettings'),
  addPrefix('use_indent'),
  addPrefix('use_justify'),
  'isCiteStatus',
  'isCountStatus',
  'legend',
  'previewWidth',
  'locale',
  'showAIToolbox',
  'viewMode',
  'previewDevice',
  addPrefix('copyMode'),
  addPrefix('sort_mode'),
  addPrefix('enableImageReupload'),
  addPrefix('enableScrollSync'),
  'openai_type',
  'openai_temperature',
  'openai_max_token',
  addPrefix('css_content_config'),
  addPrefix('templates'),
  addPrefix('custom_components'),
  'quick_commands',
]

const SKIP_KEYS = new Set([
  GITHUB_TOKEN_KEY,
  LAST_SYNC_KEY,
  addPrefix('github_synced_files'),
  addPrefix('github_snapshot_hash'),
  addPrefix('current_post_id'),
])

export type GitHubSyncStatus = 'idle' | 'syncing' | 'error'

// ── helpers ──

function lsGet(key: string): string | null {
  return localStorage.getItem(key)
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) }
  catch { /* quota */ }
}

function collectEditorSettings(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of EDITOR_SETTING_KEYS) {
    const raw = lsGet(key)
    if (raw !== null) {
      try { out[key] = JSON.parse(raw) }
      catch { out[key] = raw }
    }
  }
  return out
}

function applyEditorSettings(data: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(data)) {
    if (SKIP_KEYS.has(k))
      continue
    try { lsSet(k, typeof v === 'string' ? v : JSON.stringify(v)) }
    catch { /* ignore */ }
  }
}

function collectReadingData(): Record<string, unknown> {
  const sources = lsGet(LS_READING_SOURCES)
  const articles = lsGet(LS_READING_ARTICLES)
  return {
    sources: sources ? JSON.parse(sources) : [],
    articles: articles ? JSON.parse(articles) : [],
  }
}

function applyReadingData(data: Record<string, unknown>): void {
  if (data.sources)
    lsSet(LS_READING_SOURCES, JSON.stringify(data.sources))
  if (data.articles)
    lsSet(LS_READING_ARTICLES, JSON.stringify(data.articles))
}

function collectIdeaBoardData(): unknown[] {
  const raw = lsGet(LS_IDEA_BOARD)
  return raw ? JSON.parse(raw) : []
}

function applyIdeaBoardData(data: unknown[]): void {
  lsSet(LS_IDEA_BOARD, JSON.stringify(data))
}

function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    if (line.startsWith('# '))
      return line.slice(2).trim().slice(0, 80)
  }
  return ''
}

// ── store ──

export const useGitHubSyncStore = defineStore('githubSync', () => {
  const postStore = usePostStore()

  const token = store.reactive(GITHUB_TOKEN_KEY, '')
  const lastSyncAt = store.reactive(LAST_SYNC_KEY, 0)
  const status = ref<GitHubSyncStatus>('idle')
  const lastError = ref('')
  const storedRepoName = store.reactive(REPO_NAME_KEY, '')

  watch(token, async (t) => {
    if (!t || storedRepoName.value)
      return
    try {
      const c = new GitHubSyncClient(() => t)
      const username = await c.getUsername()
      storedRepoName.value = `${username}/cc-md-editor-data`
    }
    catch { /* ignore */ }
  }, { immediate: true })

  const isConfigured = computed(() => Boolean(token.value))
  const client = computed(() => isConfigured.value ? new GitHubSyncClient(() => token.value) : null)

  function setToken(t: string) { token.value = t }
  function clearToken() {
    token.value = ''
    lastSyncAt.value = 0
    storedRepoName.value = ''
  }

  const MIN_SYNC_INTERVAL_MS = 10_000

  async function sync(scope: SyncScope = 'all'): Promise<void> {
    if (!client.value || status.value === 'syncing')
      return
    if (lastSyncAt.value > 0 && Date.now() - lastSyncAt.value < MIN_SYNC_INTERVAL_MS)
      return

    status.value = 'syncing'
    lastError.value = ''

    try {
      const repo = await client.value.ensureRepo()
      const c = client.value

      // ── editor ──
      if (scope === 'all' || scope === 'editor') {
        // settings
        const remoteSettings = await c.readFile(repo, PATH_EDITOR_SETTINGS)
        if (remoteSettings) {
          applyEditorSettings(JSON.parse(remoteSettings.content))
        }
        await c.writeFile(
          repo,
          PATH_EDITOR_SETTINGS,
          JSON.stringify(collectEditorSettings(), null, 2),
          'update editor settings',
          remoteSettings?.sha,
        )

        // posts
        const remotePosts = await c.listFiles(repo, PATH_EDITOR_POSTS)
        const remoteMap = new Map<string, { sha: string }>()
        for (const f of remotePosts) {
          if (f.name.endsWith('.md'))
            remoteMap.set(f.name.replace(/\.md$/, ''), { sha: f.sha })
        }

        // pull missing posts
        for (const [id] of remoteMap) {
          if (postStore.getPostById(id))
            continue
          const file = await c.readFile(repo, `${PATH_EDITOR_POSTS}/${id}.md`)
          if (!file)
            continue
          const title = extractTitle(file.content) || id.slice(0, 8)
          postStore.posts.push({
            id,
            title,
            content: file.content,
            history: [{ datetime: formatLocalDateTime(), content: file.content }],
            createDatetime: new Date(),
            updateDatetime: new Date(),
          })
        }

        // push local posts
        for (const post of postStore.posts) {
          const remote = remoteMap.get(post.id)
          const path = `${PATH_EDITOR_POSTS}/${post.id}.md`
          const msg = remote ? `update: ${post.title}` : `create: ${post.title}`
          await c.writeFile(repo, path, post.content, msg, remote?.sha)
        }
      }

      // ── reading ──
      if (scope === 'all' || scope === 'reading') {
        const remote = await c.readFile(repo, PATH_READING)
        if (remote)
          applyReadingData(JSON.parse(remote.content))
        await c.writeFile(
          repo,
          PATH_READING,
          JSON.stringify(collectReadingData(), null, 2),
          'update reading data',
          remote?.sha,
        )
      }

      // ── idea board ──
      if (scope === 'all' || scope === 'ideaBoard') {
        const remote = await c.readFile(repo, PATH_IDEA_BOARD)
        if (remote)
          applyIdeaBoardData(JSON.parse(remote.content))
        await c.writeFile(
          repo,
          PATH_IDEA_BOARD,
          JSON.stringify(collectIdeaBoardData(), null, 2),
          'update idea board',
          remote?.sha,
        )
      }

      // ── config (global metadata) ──
      if (scope === 'all') {
        const remoteConfig = await c.readFile(repo, PATH_CONFIG)
        await c.writeFile(
          repo,
          PATH_CONFIG,
          JSON.stringify({ lastSyncAt: Date.now(), version: 2 }, null, 2),
          'update config',
          remoteConfig?.sha,
        )
      }

      lastSyncAt.value = Date.now()
      await postStore.persistImmediately()
      status.value = 'idle'
    }
    catch (e) {
      status.value = 'error'
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }

  // ── reset remote ──

  async function deleteDir(repo: string, dirPath: string): Promise<void> {
    const c = client.value!
    try {
      const entries = await c.listFiles(repo, dirPath)
      for (const entry of entries) {
        if (entry.type === 'dir')
          await deleteDir(repo, entry.path)
        else await c.deleteFile(repo, entry.path, `reset: ${entry.name}`, entry.sha)
      }
    }
    catch { /* already deleted */ }
  }

  async function resetRemote(): Promise<void> {
    if (!client.value)
      return
    status.value = 'syncing'
    lastError.value = ''
    try {
      const repo = storedRepoName.value
      // delete everything
      try {
        const root = await client.value.listFiles(repo, '')
        for (const f of root) {
          if (f.type === 'dir')
            await deleteDir(repo, f.path)
          else await client.value.deleteFile(repo, f.path, `reset: ${f.name}`, f.sha)
        }
      }
      catch { /* empty repo */ }

      // push all local data fresh
      await sync('all')
    }
    catch (e) {
      status.value = 'error'
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }

  // ── auto sync ──
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingScope: SyncScope = 'all'
  const AUTO_SYNC_DEBOUNCE_MS = 5 * 60 * 1000
  let watcherStarted = false

  function scheduleAutoSync(scope: SyncScope = 'all') {
    if (!isConfigured.value)
      return
    if (debounceTimer)
      clearTimeout(debounceTimer)
    pendingScope = scope
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void sync(pendingScope)
    }, AUTO_SYNC_DEBOUNCE_MS)
  }

  function startAutoSyncWatcher() {
    if (watcherStarted)
      return
    watcherStarted = true
    watch(() => postStore.posts, () => scheduleAutoSync('editor'), { deep: true })
    window.addEventListener('md:data-changed', (e) => {
      const detail = (e as CustomEvent).detail
      scheduleAutoSync(detail?.scope || 'all')
    })
  }

  watch(isConfigured, (ok) => {
    if (ok)
      startAutoSyncWatcher()
  }, { immediate: true })

  return {
    token,
    lastSyncAt,
    status,
    lastError,
    repoFullName: storedRepoName,
    isConfigured,
    setToken,
    clearToken,
    sync,
    resetRemote,
    scheduleAutoSync,
  }
})
