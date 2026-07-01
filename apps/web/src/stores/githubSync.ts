import { watch } from 'vue'
import { formatLocalDateTime } from '@/i18n/translate'
import { GitHubSyncClient } from '@/services/github/client'
import type { Post } from '@/types/post'
import { isCacheKey } from '@/storage/keys'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { useIdeaBoardStore } from '@/stores/ideaBoard'
import { usePostStore } from '@/stores/post'
import { useReadingStore } from '@/stores/reading'

const GITHUB_TOKEN_KEY = addPrefix('github_token')
const LAST_SYNC_KEY = addPrefix('github_last_sync')
const REPO_NAME_KEY = addPrefix('github_repo_name')

export type SyncScope = 'all' | 'editor' | 'reading' | 'ideaBoard'

// ── 远端路径 ──
const PATH_EDITOR_POSTS = 'editor/posts'
const PATH_EDITOR_METADATA = 'editor/metadata.json'
const PATH_EDITOR_SETTINGS = 'editor/settings.json'
const PATH_READING = 'reading/data.json'
const PATH_IDEA_BOARD = 'idea-board/notes.json'
const PATH_IDEA_BOARD_SCENES = 'idea-board/scenes.json'
const PATH_CONFIG = 'config.json'

// ── localStorage keys ──
const LS_READING_SOURCES = 'reading_sources'
const LS_READING_ARTICLES = 'reading_articles'
const LS_IDEA_BOARD = 'idea-board-notes'
const LS_IDEA_BOARD_SCENES = 'idea-board-scenes'

// 不同步的 key（运行态、Token、缓存等）
const SKIP_KEYS = new Set([
  GITHUB_TOKEN_KEY,
  LAST_SYNC_KEY,
  REPO_NAME_KEY,
  addPrefix('github_synced_files'),
  addPrefix('github_snapshot_hash'),
  addPrefix('current_post_id'),
  addPrefix('sort_mode'),
  // 运行时状态
  'ai-panel-pos',
  'ai-panel-size',
])

export type GitHubSyncStatus = 'idle' | 'syncing' | 'error'

// ── 元数据类型 ──

/** 将中文标题转为安全的 GitHub 文件名：拼音化 + 只保留字母数字和连字符 */
function sanitizeFilename(title: string): string {
  // 中文直接保留（GitHub 支持 Unicode 文件名），只替换真正不合法的字符
  return title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"\\|?*\x00-\x1f]/g, '')
    .replace(/\/\s+/g, '-')
    .replace(/[/\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled'
}

/** 文章在 GitHub 上的路径：{title拼音}-{短ID}.md */
function postFilename(title: string, id: string): string {
  const base = sanitizeFilename(title)
  const shortId = id.slice(0, 8)
  return `${base}-${shortId}.md`
}

interface PostMeta {
  title: string
  updateDatetime: number
  sha: string
  /** 远端文件名（用于兼容旧版 ID 命名） */
  filename: string
}

interface EditorMetadata {
  posts: Record<string, PostMeta>
  tombstones: Record<string, { updateDatetime: number }>
}

// ── localStorage helpers ──

function lsGet(key: string): string | null {
  return localStorage.getItem(key)
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) }
  catch { /* quota */ }
}

/** 从存储引擎收集所有可同步的配置（含 AI 密钥、图床配置等） */
async function collectAllSettings(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  const allKeys = await store.keys()
  for (const key of allKeys) {
    if (SKIP_KEYS.has(key))
      continue
    if (isCacheKey(key))
      continue
    const raw = store.getSync(key)
    if (raw !== null) {
      try { out[key] = JSON.parse(raw) }
      catch { out[key] = raw }
    }
  }
  return out
}

/** 将远端配置写入本地存储引擎 */
async function applyAllSettings(data: Record<string, unknown>): Promise<void> {
  for (const [k, v] of Object.entries(data)) {
    if (SKIP_KEYS.has(k))
      continue
    try { await store.set(k, typeof v === 'string' ? v : JSON.stringify(v)) }
    catch { /* ignore */ }
  }
}

function collectReadingData(): { sources: unknown[], articles: unknown[] } {
  return {
    sources: JSON.parse(lsGet(LS_READING_SOURCES) || '[]'),
    articles: JSON.parse(lsGet(LS_READING_ARTICLES) || '[]'),
  }
}

function applyReadingData(data: { sources: unknown[], articles: unknown[] }): void {
  lsSet(LS_READING_SOURCES, JSON.stringify(data.sources))
  lsSet(LS_READING_ARTICLES, JSON.stringify(data.articles))
}

function collectIdeaBoardData(): unknown[] {
  return JSON.parse(lsGet(LS_IDEA_BOARD) || '[]')
}

function applyIdeaBoardData(data: unknown[]): void {
  lsSet(LS_IDEA_BOARD, JSON.stringify(data))
}

function collectIdeaBoardScenes(): unknown[] {
  return JSON.parse(lsGet(LS_IDEA_BOARD_SCENES) || '[]')
}

function applyIdeaBoardScenes(data: unknown[]): void {
  lsSet(LS_IDEA_BOARD_SCENES, JSON.stringify(data))
}

function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    if (line.startsWith('# '))
      return line.slice(2).trim().slice(0, 80)
  }
  return ''
}

// ── merge helpers ──

/** 阅读数据：按 ID 去重，本地版本优先（保留已读/收藏状态） */
function mergeReadingData(
  local: { sources: unknown[], articles: unknown[] },
  remote: { sources: unknown[], articles: unknown[] },
): { sources: unknown[], articles: unknown[] } {
  const localSrc = new Map(local.sources.map(s => [(s as Record<string, unknown>).id, s]))
  for (const rs of remote.sources) {
    const id = (rs as Record<string, unknown>).id as string
    if (!localSrc.has(id))
      local.sources.push(rs)
  }
  const localArt = new Map(local.articles.map(a => [(a as Record<string, unknown>).id, a]))
  for (const ra of remote.articles) {
    const id = (ra as Record<string, unknown>).id as string
    if (!localArt.has(id))
      local.articles.push(ra)
  }
  return local
}

/** 想法便签：按 ID 去重，以较新的 updatedAt 为准 */
function mergeIdeaBoardData(local: unknown[], remote: unknown[]): unknown[] {
  const map = new Map<string, unknown>()
  for (const n of local) {
    const note = n as Record<string, unknown>
    map.set(note.id as string, note)
  }
  for (const rn of remote) {
    const r = rn as Record<string, unknown>
    const id = r.id as string
    const local = map.get(id) as Record<string, unknown> | undefined
    if (!local || (r.updatedAt as number || 0) > (local.updatedAt as number || 0))
      map.set(id, rn)
  }
  return Array.from(map.values())
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

  // ── 编辑器文章同步（metadata.json 做增量 + last-write-wins + 删除同步） ──

  async function syncEditorPosts(repo: string, c: GitHubSyncClient): Promise<void> {
    const remoteMetaFile = await c.readFile(repo, PATH_EDITOR_METADATA)
    const remoteMeta: EditorMetadata = remoteMetaFile
      ? JSON.parse(remoteMetaFile.content)
      : { posts: {}, tombstones: {} }
    const remoteMetaSha = remoteMetaFile?.sha

    const localPosts = new Map(postStore.posts.map(p => [p.id, p]))
    const postsAdded: Post[] = []
    const postsChanged: Post[] = []

    // ── Phase 1: 分类 ──
    const toDownload: string[] = []     // 远端较新，需下载
    const toUpload: Post[] = []         // 本地较新，需上传
    for (const [id, rMeta] of Object.entries(remoteMeta.posts)) {
      const local = localPosts.get(id)
      if (!local) {
        if (remoteMeta.tombstones[id]) {
          // 两边都删了，跳过
        }
        else {
          toDownload.push(id)  // 远端有本地没有 → 下载
        }
      }
      else {
        const localTime = new Date(local.updateDatetime).getTime()
        const remoteTime = rMeta.updateDatetime
        const toleranceMs = 2000
        if (remoteTime > localTime + toleranceMs) {
          toDownload.push(id)       // 远端更新 → 下载
        }
        else if (localTime > remoteTime + toleranceMs) {
          toUpload.push(local)      // 本地更新 → 上传
        }
      }
    }

    // 本地新文章（远端没有的）
    for (const post of postStore.posts) {
      if (!remoteMeta.posts[post.id])
        toUpload.push(post)
    }

    // 本地墓碑 → 远端删除
    const localTombstones = remoteMeta.tombstones // 从远端墓碑开始，同步时累积
    for (const post of postStore.posts) {
      // 正常存在的文章不应在墓碑中
      delete localTombstones[post.id]
    }

    // ── Phase 2: 执行 ──
    const updatedMetas: Record<string, PostMeta> = {}

    // 2a: 下载远端较新文章
    for (const id of toDownload) {
      const rMeta = remoteMeta.posts[id]
      // 用 metadata 中的 filename，兼容旧版 ID 命名的文件
      const remotePath = rMeta.filename
        ? `${PATH_EDITOR_POSTS}/${rMeta.filename}`
        : `${PATH_EDITOR_POSTS}/${id}.md`
      const file = await c.readFile(repo, remotePath)
      if (!file) continue

      const existing = postStore.getPostById(id)
      if (existing) {
        if (file.content !== existing.content) {
          existing.history = [
            ...(existing.history || []),
            { datetime: formatLocalDateTime(), content: existing.content },
          ]
          existing.content = file.content
          existing.title = rMeta.title
          existing.updateDatetime = new Date(rMeta.updateDatetime)
          postsChanged.push(existing)
        }
      }
      else {
        const title = rMeta.title || extractTitle(file.content) || id.slice(0, 8)
        postsAdded.push({
          id, title, content: file.content,
          history: [{ datetime: formatLocalDateTime(), content: file.content }],
          createDatetime: new Date(rMeta.updateDatetime),
          updateDatetime: new Date(rMeta.updateDatetime),
        } as Post)
      }
      const metaFilename = rMeta.filename || postFilename(rMeta.title || title, id)
      updatedMetas[id] = { ...rMeta, sha: file.sha, filename: metaFilename }
    }

    // 2b: 上传本地较新文章
    for (const post of toUpload) {
      const rMeta = remoteMeta.posts[post.id]
      const newFilename = postFilename(post.title, post.id)

      // 旧版文件（UUID 命名如 185432d3....md）→ 迁移到标题命名
      const oldFilename = rMeta ? (rMeta.filename || `${post.id}.md`) : null

      if (oldFilename && oldFilename !== newFilename) {
        // 文件名变化（标题变更 或 从 UUID 迁移到标题名）：删旧建新
        try { await c.deleteFile(repo, `${PATH_EDITOR_POSTS}/${oldFilename}`, `rename: ${post.title}`, rMeta!.sha) }
        catch { /* already gone */ }
        const result = await c.writeFile(repo, `${PATH_EDITOR_POSTS}/${newFilename}`, post.content, `update: ${post.title}`)
        updatedMetas[post.id] = {
          title: post.title, updateDatetime: new Date(post.updateDatetime).getTime(),
          sha: result.sha, filename: newFilename,
        }
      }
      else if (oldFilename) {
        // 文件名没变，正常更新
        const result = await c.writeFile(repo, `${PATH_EDITOR_POSTS}/${oldFilename}`, post.content,
          `update: ${post.title}`, rMeta!.sha,
        )
        updatedMetas[post.id] = {
          title: post.title, updateDatetime: new Date(post.updateDatetime).getTime(),
          sha: result.sha, filename: oldFilename,
        }
      }
      else {
        // 全新文章
        const result = await c.writeFile(repo, `${PATH_EDITOR_POSTS}/${newFilename}`, post.content, `create: ${post.title}`)
        updatedMetas[post.id] = {
          title: post.title, updateDatetime: new Date(post.updateDatetime).getTime(),
          sha: result.sha, filename: newFilename,
        }
      }
    }

    // 2c: 删除远端中已被本地删除的文件
    for (const [id, tomb] of Object.entries(localTombstones)) {
      const rMeta = remoteMeta.posts[id]
      if (rMeta) {
        const delPath = rMeta.filename
          ? `${PATH_EDITOR_POSTS}/${rMeta.filename}`
          : `${PATH_EDITOR_POSTS}/${id}.md`
        try { await c.deleteFile(repo, delPath, `delete: ${id}`, rMeta.sha) }
        catch { /* already gone */ }
      }
      updatedMetas[id] = { title: '', updateDatetime: tomb.updateDatetime, sha: '', filename: '' }
    }

    // 批量添加新文章
    if (postsAdded.length) {
      postStore.posts.push(...postsAdded)
      if (!postStore.currentPostId)
        postStore.currentPostId = postsAdded[0].id
    }

    // ── Phase 3: 写回 metadata ──
    const newMeta: EditorMetadata = {
      posts: { ...remoteMeta.posts, ...updatedMetas },
      tombstones: localTombstones,
    }
    // 清理墓碑中已不存在于 posts 的记录
    for (const post of postStore.posts)
      delete newMeta.tombstones[post.id]

    await c.writeFile(repo, PATH_EDITOR_METADATA, JSON.stringify(newMeta, null, 2),
      'sync editor metadata', remoteMetaSha)
  }

  // ── 主同步入口 ──

  async function sync(scope: SyncScope = 'all'): Promise<void> {
    if (!client.value || status.value === 'syncing')
      return
    if (lastSyncAt.value > 0 && Date.now() - lastSyncAt.value < MIN_SYNC_INTERVAL_MS)
      return

    status.value = 'syncing'
    lastError.value = ''

    // 整体同步超时 60 秒，防止无限卡死
    let syncTimedOut = false
    const timeoutId = setTimeout(() => {
      syncTimedOut = true
      status.value = 'error'
      lastError.value = '同步超时，请检查网络后重试'
    }, 60_000)

    try {
      const repo = await client.value.ensureRepo()
      const c = client.value

      if (syncTimedOut) return

      // ── 编辑器 ──
      if (scope === 'all' || scope === 'editor') {
        // settings
        // 同步所有配置（含 AI 密钥、图床、主题、偏好等）
        const remoteSettings = await c.readFile(repo, PATH_EDITOR_SETTINGS)
        if (remoteSettings)
          await applyAllSettings(JSON.parse(remoteSettings.content))
        await c.writeFile(
          repo, PATH_EDITOR_SETTINGS,
          JSON.stringify(await collectAllSettings(), null, 2),
          'sync editor settings', remoteSettings?.sha,
        )

        // posts
        await syncEditorPosts(repo, c)
      }

      // ── 阅读 ──
      if (scope === 'all' || scope === 'reading') {
        const localData = collectReadingData()
        const remote = await c.readFile(repo, PATH_READING)
        if (remote) {
          const remoteData = JSON.parse(remote.content) as { sources: unknown[], articles: unknown[] }
          const merged = mergeReadingData(localData, remoteData)
          applyReadingData(merged)
          await c.writeFile(repo, PATH_READING, JSON.stringify(merged, null, 2), 'sync reading data', remote.sha)
        }
        else {
          await c.writeFile(repo, PATH_READING, JSON.stringify(localData, null, 2), 'init reading data')
        }
        useReadingStore().reloadFromStorage()
      }

      // ── 想法库（便签 + 场景/excalidraw + 阅读批注） ──
      if (scope === 'all' || scope === 'ideaBoard') {
        // notes
        const localNotes = collectIdeaBoardData()
        const remoteNotes = await c.readFile(repo, PATH_IDEA_BOARD)
        if (remoteNotes) {
          const remoteData = JSON.parse(remoteNotes.content) as unknown[]
          const merged = mergeIdeaBoardData(localNotes, remoteData)
          applyIdeaBoardData(merged)
          await c.writeFile(repo, PATH_IDEA_BOARD, JSON.stringify(merged, null, 2), 'sync idea board notes', remoteNotes.sha)
        }
        else {
          await c.writeFile(repo, PATH_IDEA_BOARD, JSON.stringify(localNotes, null, 2), 'init idea board notes')
        }
        useIdeaBoardStore().reloadFromStorage()

        // scenes（含 excalidraw 画布 + 阅读批注）
        const localScenes = collectIdeaBoardScenes()
        const remoteScenes = await c.readFile(repo, PATH_IDEA_BOARD_SCENES)
        if (remoteScenes) {
          const remoteData = JSON.parse(remoteScenes.content) as unknown[]
          const merged = mergeIdeaBoardData(localScenes, remoteData)
          applyIdeaBoardScenes(merged)
          await c.writeFile(repo, PATH_IDEA_BOARD_SCENES, JSON.stringify(merged, null, 2), 'sync idea board scenes', remoteScenes.sha)
        }
        else {
          await c.writeFile(repo, PATH_IDEA_BOARD_SCENES, JSON.stringify(localScenes, null, 2), 'init idea board scenes')
        }
        // 通知 IdeaBoard.vue / ArticleReader 重载场景（如果有组件在监听）
        window.dispatchEvent(new CustomEvent('md:scenes-synced'))
      }

      // ── config ──
      if (scope === 'all') {
        const remoteConfig = await c.readFile(repo, PATH_CONFIG)
        await c.writeFile(
          repo, PATH_CONFIG,
          JSON.stringify({ lastSyncAt: Date.now(), version: 2 }, null, 2),
          'update config', remoteConfig?.sha,
        )
      }

      lastSyncAt.value = Date.now()
      await postStore.persistImmediately()
      if (!syncTimedOut)
        status.value = 'idle'
    }
    catch (e) {
      if (!syncTimedOut) {
        status.value = 'error'
        lastError.value = e instanceof Error ? e.message : String(e)
      }
    }
    finally {
      clearTimeout(timeoutId)
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
    lastError.value = ''
    try {
      // 先清空远端
      const repo = storedRepoName.value
      try {
        const root = await client.value.listFiles(repo, '')
        for (const f of root) {
          if (f.type === 'dir')
            await deleteDir(repo, f.path)
          else await client.value.deleteFile(repo, f.path, `reset: ${f.name}`, f.sha)
        }
      }
      catch { /* empty repo */ }
      // 重置冷却期，让 sync 可以立即执行
      lastSyncAt.value = 0
      // 然后全量推送（sync 内部会设置 status）
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
  const AUTO_SYNC_DEBOUNCE_MS = 10_000
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

  function setupBeforeUnloadSync() {
    window.addEventListener('beforeunload', () => {
      if (!isConfigured.value || status.value === 'syncing')
        return
      void sync('all')
    })
  }

  watch(isConfigured, (ok) => {
    if (ok) {
      startAutoSyncWatcher()
      setupBeforeUnloadSync()
    }
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
