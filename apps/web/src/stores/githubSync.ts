import { watch } from 'vue'
import { formatLocalDateTime } from '@/i18n/translate'
import { GitHubSyncClient } from '@/services/github/client'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { usePostStore } from '@/stores/post'

const GITHUB_TOKEN_KEY = addPrefix('github_token')
const LAST_SYNC_KEY = addPrefix('github_last_sync')
const SNAPSHOT_HASH_KEY = addPrefix('github_snapshot_hash')
const REPO_NAME_KEY = addPrefix('github_repo_name')

// 远端路径
const PATH_POSTS = 'editor/posts'
const PATH_SNAPSHOT = 'snapshot.json'
const PATH_META = 'sync-meta.json'

// snapshot.json 包含的 localStorage keys
const SNAPSHOT_KEYS = [
  'reading_sources',
  'reading_articles',
  'idea-board-notes',
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

export type GitHubSyncStatus = 'idle' | 'syncing' | 'error'

interface SyncMeta {
  lastSyncAt: number
  snapshotHash: string
}

// 各 scope 对应的 keys
const SCOPE_KEYS: Record<string, string[]> = {
  reading: ['reading_sources', 'reading_articles'],
  ideaBoard: ['idea-board-notes'],
  editor: SNAPSHOT_KEYS.filter(k => k !== 'reading_sources' && k !== 'reading_articles' && k !== 'idea-board-notes'),
  all: SNAPSHOT_KEYS,
}

/** 收集快照（按 scope 过滤） */
function collectSnapshot(scope: string = 'all'): Record<string, unknown> {
  const keys = SCOPE_KEYS[scope] || SNAPSHOT_KEYS
  const snap: Record<string, unknown> = {}
  for (const key of keys) {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      try { snap[key] = JSON.parse(raw) }
      catch { snap[key] = raw }
    }
  }
  return snap
}

/** 应用快照到本地（按 scope 过滤） */
function applySnapshot(snap: Record<string, unknown>, scope: string = 'all'): void {
  const keys = new Set(SCOPE_KEYS[scope] || SNAPSHOT_KEYS)
  for (const [key, value] of Object.entries(snap)) {
    if (!keys.has(key))
      continue
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    catch { /* ignore */ }
  }
}

/** 简单 hash 用于变更检测 */
function hashSnapshot(snap: Record<string, unknown>): string {
  const str = JSON.stringify(snap)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

export const useGitHubSyncStore = defineStore('githubSync', () => {
  const postStore = usePostStore()

  const token = store.reactive(GITHUB_TOKEN_KEY, '')
  const lastSyncAt = store.reactive(LAST_SYNC_KEY, 0)
  const snapshotHash = store.reactive(SNAPSHOT_HASH_KEY, '')
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
    snapshotHash.value = ''
    storedRepoName.value = ''
  }

  const MIN_SYNC_INTERVAL_MS = 10_000

  async function sync(scope: 'all' | 'editor' | 'reading' | 'ideaBoard' = 'all'): Promise<void> {
    if (!client.value || status.value === 'syncing')
      return
    if (lastSyncAt.value > 0 && Date.now() - lastSyncAt.value < MIN_SYNC_INTERVAL_MS)
      return

    status.value = 'syncing'
    lastError.value = ''

    try {
      storedRepoName.value = await client.value.ensureRepo()
      const repo = storedRepoName.value

      // ── 1. 同步 snapshot.json（按 scope 决定同步哪些 key） ──
      const localSnap = collectSnapshot(scope)
      const localHash = hashSnapshot(localSnap)

      const remoteMeta = await client.value.readFile(repo, PATH_META)
      const remoteSnapFile = await client.value.readFile(repo, PATH_SNAPSHOT)

      if (remoteSnapFile && remoteMeta) {
        const meta: SyncMeta = JSON.parse(remoteMeta.content)
        const remoteHash = meta.snapshotHash || ''

        if (remoteHash !== localHash) {
          const localUpdatedAt = findMaxUpdateTime()
          if (meta.lastSyncAt > localUpdatedAt && remoteHash !== localHash) {
            const remoteSnap = JSON.parse(remoteSnapFile.content)
            applySnapshot(remoteSnap, scope)
            snapshotHash.value = remoteHash
          }
          else {
            await pushSnapshot(repo, localSnap, localHash, remoteSnapFile.sha, remoteMeta.sha)
          }
        }
        else {
          snapshotHash.value = localHash
        }
      }
      else {
        await pushSnapshot(repo, localSnap, localHash)
      }

      // ── 2. 同步编辑器文章（仅 editor/all scope） ──
      if (scope === 'all' || scope === 'editor')
        await syncPosts(repo)

      // ── 3. 完成 ──
      lastSyncAt.value = Date.now()
      await postStore.persistImmediately()
      status.value = 'idle'
    }
    catch (e) {
      status.value = 'error'
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function pushSnapshot(
    repo: string,
    snap: Record<string, unknown>,
    hash: string,
    snapSha?: string,
    metaSha?: string,
  ) {
    const c = client.value!
    await c.writeFile(repo, PATH_SNAPSHOT, JSON.stringify(snap, null, 2), 'update snapshot', snapSha)
    const meta: SyncMeta = { lastSyncAt: Date.now(), snapshotHash: hash }
    await c.writeFile(repo, PATH_META, JSON.stringify(meta, null, 2), 'update sync meta', metaSha)
    snapshotHash.value = hash
  }

  async function syncPosts(repo: string) {
    const c = client.value!
    const remoteFiles = await c.listFiles(repo, PATH_POSTS)

    // 拉取远端文章（本地没有或远端更新的）
    for (const f of remoteFiles) {
      if (!f.name.endsWith('.md'))
        continue
      const docId = f.name.replace(/\.md$/, '')
      const existing = postStore.getPostById(docId)

      if (!existing) {
        const fileData = await c.readFile(repo, f.path)
        if (!fileData)
          continue
        const title = extractTitle(fileData.content) || docId.slice(0, 8)
        postStore.posts.push({
          id: docId,
          title,
          content: fileData.content,
          history: [{ datetime: formatLocalDateTime(), content: fileData.content }],
          createDatetime: new Date(),
          updateDatetime: new Date(),
        })
      }
    }

    // 推送本地文章
    const remoteIds = new Set(remoteFiles.map(f => f.name.replace(/\.md$/, '')))
    for (const post of postStore.posts) {
      if (remoteIds.has(post.id))
        continue // 已存在，暂不处理冲突（简单策略：本地编辑不覆盖远端）
      const fileName = `${PATH_POSTS}/${post.id}.md`
      await c.writeFile(repo, fileName, post.content, `create: ${post.title}`)
    }
  }

  function findMaxUpdateTime(): number {
    let max = 0
    for (const p of postStore.posts) {
      const t = new Date(p.updateDatetime).getTime()
      if (t > max)
        max = t
    }
    return max
  }

  function extractTitle(content: string): string {
    for (const line of content.split('\n')) {
      if (line.startsWith('# '))
        return line.slice(2).trim().slice(0, 80)
    }
    return ''
  }

  // ── 自动同步 ──────────────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingScope: 'all' | 'editor' | 'reading' | 'ideaBoard' = 'all'
  const AUTO_SYNC_DEBOUNCE_MS = 5 * 60 * 1000
  let watcherStarted = false

  function scheduleAutoSync(scope: 'all' | 'editor' | 'reading' | 'ideaBoard' = 'all') {
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
    // 编辑器文章变化
    watch(() => postStore.posts, () => scheduleAutoSync('editor'), { deep: true })
    // 阅读 / 想法库数据变化
    window.addEventListener('md:data-changed', (e) => {
      const detail = (e as CustomEvent).detail
      scheduleAutoSync(detail?.scope || 'all')
    })
    window.addEventListener('storage', (e) => {
      if (!e.key)
        return
      if (e.key === 'reading_sources' || e.key === 'reading_articles')
        scheduleAutoSync('reading')
      else if (e.key === 'idea-board-notes')
        scheduleAutoSync('ideaBoard')
      else if (SNAPSHOT_KEYS.includes(e.key))
        scheduleAutoSync('all')
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
    scheduleAutoSync,
  }
})
