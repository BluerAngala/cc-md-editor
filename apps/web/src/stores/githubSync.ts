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

/** 收集快照 */
function collectSnapshot(): Record<string, unknown> {
  const snap: Record<string, unknown> = {}
  for (const key of SNAPSHOT_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      try { snap[key] = JSON.parse(raw) }
      catch { snap[key] = raw }
    }
  }
  return snap
}

/** 应用快照到本地 */
function applySnapshot(snap: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(snap)) {
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

  async function sync(): Promise<void> {
    if (!client.value || status.value === 'syncing')
      return
    if (lastSyncAt.value > 0 && Date.now() - lastSyncAt.value < MIN_SYNC_INTERVAL_MS)
      return

    status.value = 'syncing'
    lastError.value = ''

    try {
      storedRepoName.value = await client.value.ensureRepo()
      const repo = storedRepoName.value

      // ── 1. 同步 snapshot.json（全量覆盖，谁新用谁） ──
      const localSnap = collectSnapshot()
      const localHash = hashSnapshot(localSnap)

      const remoteMeta = await client.value.readFile(repo, PATH_META)
      const remoteSnapFile = await client.value.readFile(repo, PATH_SNAPSHOT)

      if (remoteSnapFile && remoteMeta) {
        const meta: SyncMeta = JSON.parse(remoteMeta.content)
        const remoteHash = meta.snapshotHash || ''

        if (remoteHash !== localHash) {
          // 有差异，比较时间决定方向
          const localUpdatedAt = findMaxUpdateTime()
          if (meta.lastSyncAt > localUpdatedAt && remoteHash !== localHash) {
            // 远端更新 → 用远端覆盖本地
            const remoteSnap = JSON.parse(remoteSnapFile.content)
            applySnapshot(remoteSnap)
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
      else {
        // 首次同步 → 推送本地数据
        await pushSnapshot(repo, localSnap, localHash)
      }

      // ── 2. 同步编辑器文章（逐文件，按修改时间） ──
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
  const AUTO_SYNC_DEBOUNCE_MS = 5 * 60 * 1000
  let watcherStarted = false

  function scheduleAutoSync() {
    if (!isConfigured.value)
      return
    if (debounceTimer)
      clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void sync()
    }, AUTO_SYNC_DEBOUNCE_MS)
  }

  function startAutoSyncWatcher() {
    if (watcherStarted)
      return
    watcherStarted = true
    watch(() => postStore.posts, () => scheduleAutoSync(), { deep: true })
    window.addEventListener('md:data-changed', () => scheduleAutoSync())
    window.addEventListener('storage', (e) => {
      if (e.key && SNAPSHOT_KEYS.includes(e.key))
        scheduleAutoSync()
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
