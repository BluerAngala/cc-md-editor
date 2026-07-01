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

export type SyncScope = 'all' | 'editor' | 'reading' | 'ideaBoard'

export interface ScopeSyncState {
  lastSyncAt: number
  syncedHash: string
}

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
  const lastSyncScope = ref<SyncScope>('all')
  const storedRepoName = store.reactive(REPO_NAME_KEY, '')

  // 每个 scope 的同步状态
  const scopeStates = ref<Record<SyncScope, ScopeSyncState>>({
    all: { lastSyncAt: 0, syncedHash: '' },
    editor: { lastSyncAt: 0, syncedHash: '' },
    reading: { lastSyncAt: 0, syncedHash: '' },
    ideaBoard: { lastSyncAt: 0, syncedHash: '' },
  })

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

  async function sync(scope: SyncScope = 'all', forcePush = false): Promise<void> {
    if (!client.value || status.value === 'syncing')
      return
    if (!forcePush && lastSyncAt.value > 0 && Date.now() - lastSyncAt.value < MIN_SYNC_INTERVAL_MS)
      return

    status.value = 'syncing'
    lastError.value = ''

    try {
      storedRepoName.value = await client.value.ensureRepo()
      const repo = storedRepoName.value

      // ── 1. 同步 snapshot.json ──
      const localSnap = collectSnapshot(scope)
      const localHash = hashSnapshot(localSnap)

      const remoteMeta = await client.value.readFile(repo, PATH_META)
      const remoteSnapFile = await client.value.readFile(repo, PATH_SNAPSHOT)

      if (forcePush || !remoteSnapFile || !remoteMeta) {
        // 强制推送或首次同步 → 推送本地数据
        await pushSnapshot(repo, localSnap, localHash, remoteSnapFile?.sha, remoteMeta?.sha)
      }
      else {
        const meta: SyncMeta = JSON.parse(remoteMeta.content)
        const remoteHash = meta.snapshotHash || ''

        if (remoteHash !== localHash) {
          const localUpdatedAt = findMaxUpdateTime()
          if (meta.lastSyncAt > localUpdatedAt) {
            // 远端更新 → 用远端覆盖本地
            const remoteSnap = JSON.parse(remoteSnapFile.content)
            applySnapshot(remoteSnap, scope)
            snapshotHash.value = remoteHash
          }
          else {
            // 本地更新 → 推送到远端
            await pushSnapshot(repo, localSnap, localHash, remoteSnapFile.sha, remoteMeta.sha)
          }
        }
        else {
          snapshotHash.value = localHash
        }
      }

      // ── 2. 同步编辑器文章 ──
      if (scope === 'all' || scope === 'editor')
        await syncPosts(repo, forcePush)

      // ── 3. 完成 ──
      lastSyncAt.value = Date.now()
      lastSyncScope.value = scope
      scopeStates.value[scope] = { lastSyncAt: Date.now(), syncedHash: localHash }
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

  async function syncPosts(repo: string, forcePush = false) {
    const c = client.value!
    const remoteFiles = await c.listFiles(repo, PATH_POSTS)

    // 拉取远端文章（本地没有的）
    if (!forcePush) {
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
    }

    // 推送本地文章（forcePush 时覆盖远端所有文件）
    const remoteIds = new Set(remoteFiles.map(f => f.name.replace(/\.md$/, '')))
    for (const post of postStore.posts) {
      if (!forcePush && remoteIds.has(post.id))
        continue
      const fileName = `${PATH_POSTS}/${post.id}.md`
      const existingRemote = remoteFiles.find(f => f.name === `${post.id}.md`)
      await c.writeFile(repo, fileName, post.content, `${forcePush ? 'force push' : 'create'}: ${post.title}`, existingRemote?.sha)
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

  // 当前 scope 的同步状态
  function getScopeState(scope: SyncScope): ScopeSyncState {
    return scopeStates.value[scope]
  }

  function isScopeSynced(scope: SyncScope): boolean {
    const state = scopeStates.value[scope]
    return state.lastSyncAt > 0 && Date.now() - state.lastSyncAt < 60_000
  }

  watch(isConfigured, (ok) => {
    if (ok)
      startAutoSyncWatcher()
  }, { immediate: true })

  function forcePushLocal(scope: SyncScope = 'all') {
    return sync(scope, true)
  }

  /** 清空远端仓库所有文件并用本地数据重建（根治乱码） */
  async function resetRemote(): Promise<void> {
    if (!client.value)
      return

    status.value = 'syncing'
    lastError.value = ''

    try {
      const repo = storedRepoName.value
      const c = client.value

      // 1. 删除仓库中所有现有文件
      const rootFiles = await c.listFiles(repo, '')
      for (const f of rootFiles) {
        if (f.type === 'dir') {
          // 删除目录下所有文件
          const dirFiles = await c.listFiles(repo, f.path)
          for (const df of dirFiles)
            await c.deleteFile(repo, df.path, `reset: delete ${df.name}`, df.sha)
        }
        else {
          await c.deleteFile(repo, f.path, `reset: delete ${f.name}`, f.sha)
        }
      }

      // 2. 推送所有本地数据
      const localSnap = collectSnapshot('all')
      const localHash = hashSnapshot(localSnap)
      await pushSnapshot(repo, localSnap, localHash)

      // 3. 推送所有文章
      for (const post of postStore.posts) {
        const fileName = `${PATH_POSTS}/${post.id}.md`
        await c.writeFile(repo, fileName, post.content, `init: ${post.title}`)
      }

      lastSyncAt.value = Date.now()
      snapshotHash.value = localHash
      await postStore.persistImmediately()
      status.value = 'idle'
    }
    catch (e) {
      status.value = 'error'
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }

  return {
    token,
    lastSyncAt,
    status,
    lastError,
    lastSyncScope,
    scopeStates,
    repoFullName: storedRepoName,
    isConfigured,
    setToken,
    clearToken,
    sync,
    forcePushLocal,
    resetRemote,
    scheduleAutoSync,
    getScopeState,
    isScopeSynced,
  }
})
