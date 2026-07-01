import type { Post } from '@/types/post'
import { watch } from 'vue'
import { formatLocalDateTime } from '@/i18n/translate'
import { GitHubSyncClient } from '@/services/github/client'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { usePostStore } from '@/stores/post'

const GITHUB_TOKEN_KEY = addPrefix('github_token')
const LAST_SYNC_KEY = addPrefix('github_last_sync')
const SYNCED_FILES_KEY = addPrefix('github_synced_files')
const REPO_NAME_KEY = addPrefix('github_repo_name')

// localStorage keys for reading & idea board
const READING_SOURCES_KEY = 'reading_sources'
const READING_ARTICLES_KEY = 'reading_articles'
const IDEA_BOARD_KEY = 'idea-board-notes'

// 远端路径
const PATH_POSTS = 'editor/posts'
const PATH_SETTINGS = 'editor/settings.json'
const PATH_READING_SOURCES = 'reading/sources.json'
const PATH_READING_ARTICLES = 'reading/articles.json'
const PATH_IDEA_NOTES = 'idea-board/notes.json'

const SKIP_SETTINGS_KEYS = new Set([
  GITHUB_TOKEN_KEY,
  LAST_SYNC_KEY,
  SYNCED_FILES_KEY,
  addPrefix('current_post_id'),
  addPrefix('sort_mode'),
  READING_SOURCES_KEY,
  READING_ARTICLES_KEY,
  IDEA_BOARD_KEY,
])

/** 收集编辑器 localStorage 设置（排除同步元数据、设备状态、阅读/想法库） */
function collectEditorSettings(): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || SKIP_SETTINGS_KEYS.has(key))
      continue
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null)
        settings[key] = JSON.parse(raw)
    }
    catch {
      settings[key] = localStorage.getItem(key)
    }
  }
  return settings
}

/** 应用远端编辑器设置到本地 */
function applyEditorSettings(settings: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(settings)) {
    if (SKIP_SETTINGS_KEYS.has(key))
      continue
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    catch { /* quota error, ignore */ }
  }
}

export type GitHubSyncStatus = 'idle' | 'syncing' | 'error'

interface SyncedFileMap {
  [docId: string]: { path: string, sha: string }
}

function readSyncedFiles(): SyncedFileMap {
  try {
    const raw = localStorage.getItem(SYNCED_FILES_KEY)
    return raw ? JSON.parse(raw) : {}
  }
  catch {
    return {}
  }
}

function writeSyncedFiles(map: SyncedFileMap): void {
  localStorage.setItem(SYNCED_FILES_KEY, JSON.stringify(map))
}

/** 从 markdown 内容提取标题（第一个 # 标题） */
function extractTitle(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('# '))
      return line.slice(2).trim().slice(0, 80)
  }
  return ''
}

/** 同步单个 JSON 文件（LWW：远端更新则写本地，本地更新则推远端） */
async function syncJsonFile(
  client: GitHubSyncClient,
  repo: string,
  path: string,
  localData: string,
  syncedFiles: SyncedFileMap,
): Promise<string> {
  const meta = syncedFiles[path]
  const remote = await client.readFile(repo, path)

  if (remote) {
    if (!meta || meta.sha !== remote.sha) {
      // 远端有更新 → 写本地
      localStorage.setItem(
        path === PATH_READING_SOURCES
          ? READING_SOURCES_KEY
          : path === PATH_READING_ARTICLES
            ? READING_ARTICLES_KEY
            : IDEA_BOARD_KEY,
        remote.content,
      )
      syncedFiles[path] = { path, sha: remote.sha }
      return remote.content
    }
  }

  // 本地有数据 → 推远端
  if (localData && localData !== '[]') {
    const sha = meta?.sha
    await client.writeFile(repo, path, localData, sha ? `update ${path}` : `create ${path}`, sha)
    syncedFiles[path] = { path, sha: '' } // sha 会在下次 listFiles 时更新
  }

  return localData
}

export const useGitHubSyncStore = defineStore('githubSync', () => {
  const postStore = usePostStore()

  const token = store.reactive(GITHUB_TOKEN_KEY, '')
  const lastSyncAt = store.reactive(LAST_SYNC_KEY, 0)
  const status = ref<GitHubSyncStatus>('idle')
  const lastError = ref('')
  const storedRepoName = store.reactive(REPO_NAME_KEY, '')

  // token 变化时主动获取用户名
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

  function setToken(t: string) {
    token.value = t
  }

  function clearToken() {
    token.value = ''
    lastSyncAt.value = 0
    storedRepoName.value = ''
    writeSyncedFiles({})
  }

  const MIN_SYNC_INTERVAL_MS = 10_000

  async function sync(): Promise<void> {
    if (!client.value || status.value === 'syncing')
      return

    // 冷却期保护
    if (lastSyncAt.value > 0 && Date.now() - lastSyncAt.value < MIN_SYNC_INTERVAL_MS)
      return

    status.value = 'syncing'
    lastError.value = ''

    try {
      // 1. 确保仓库存在
      storedRepoName.value = await client.value.ensureRepo()
      const repo = storedRepoName.value
      const syncedFiles = readSyncedFiles()

      // ── 迁移旧结构 ──────────────────────────────────────
      // 旧结构: posts/<id>.md + settings.json (根目录)
      // 新结构: editor/posts/<id>.md + editor/settings.json + reading/ + idea-board/
      const oldPosts = await client.value.listFiles(repo, 'posts')
      if (oldPosts.length > 0) {
        for (const f of oldPosts) {
          if (!f.name.endsWith('.md'))
            continue
          const fileData = await client.value.readFile(repo, f.path)
          if (!fileData)
            continue
          const newPath = `${PATH_POSTS}/${f.name}`
          await client.value.writeFile(repo, newPath, fileData.content, `migrate: ${f.name}`)
          await client.value.deleteFile(repo, f.path, `migrate: remove old ${f.name}`, f.sha)
        }
      }
      const oldSettings = await client.value.readFile(repo, 'settings.json')
      if (oldSettings) {
        await client.value.writeFile(repo, PATH_SETTINGS, oldSettings.content, 'migrate: settings.json')
        await client.value.deleteFile(repo, 'settings.json', 'migrate: remove old settings.json', oldSettings.sha)
      }

      // ── 2. 编辑器文章 ──────────────────────────────────
      const remotePosts = await client.value.listFiles(repo, PATH_POSTS)

      // 拉取远端文章
      for (const remoteFile of remotePosts) {
        if (!remoteFile.name.endsWith('.md'))
          continue
        const docId = remoteFile.name.replace(/\.md$/, '')
        const localMeta = syncedFiles[docId]

        if (!localMeta || localMeta.sha !== remoteFile.sha) {
          const fileData = await client.value.readFile(repo, remoteFile.path)
          if (!fileData)
            continue

          const existing = postStore.getPostById(docId)
          if (existing) {
            const localUpdated = new Date(existing.updateDatetime).getTime()
            if (localUpdated <= lastSyncAt.value || !localMeta)
              postStore.updatePostContent(docId, fileData.content)
          }
          else {
            const title = extractTitle(fileData.content) || docId.slice(0, 8)
            const newPost: Post = {
              id: docId,
              title,
              content: fileData.content,
              history: [
                { datetime: formatLocalDateTime(), content: fileData.content },
              ],
              createDatetime: new Date(),
              updateDatetime: new Date(),
            }
            postStore.posts.push(newPost)
          }

          syncedFiles[docId] = { path: remoteFile.path, sha: remoteFile.sha }
        }
      }

      // 推送本地文章
      for (const post of postStore.posts) {
        const localMeta = syncedFiles[post.id]
        const fileName = `${PATH_POSTS}/${post.id}.md`

        if (localMeta && localMeta.sha) {
          const localUpdated = new Date(post.updateDatetime).getTime()
          if (localUpdated <= lastSyncAt.value)
            continue
          await client.value.writeFile(repo, fileName, post.content, `update: ${post.title}`, localMeta.sha)
          syncedFiles[post.id] = { path: fileName, sha: localMeta.sha }
        }
        else {
          await client.value.writeFile(repo, fileName, post.content, `create: ${post.title}`)
          syncedFiles[post.id] = { path: fileName, sha: '' }
        }
      }

      // 删除远端已删除的本地文章
      const currentIds = new Set(postStore.posts.map(p => p.id))
      for (const [docId, meta] of Object.entries(syncedFiles)) {
        if (meta.path.startsWith(PATH_POSTS) && !currentIds.has(docId)) {
          try {
            await client.value.deleteFile(repo, meta.path, `delete: ${docId}`, meta.sha)
          }
          catch { /* already deleted */ }
          delete syncedFiles[docId]
        }
      }

      // ── 3. 编辑器设置 ──────────────────────────────────
      const remoteSettings = await client.value.readFile(repo, PATH_SETTINGS)
      if (remoteSettings) {
        applyEditorSettings(JSON.parse(remoteSettings.content))
        syncedFiles[PATH_SETTINGS] = { path: PATH_SETTINGS, sha: remoteSettings.sha }
      }
      const localSettings = collectEditorSettings()
      const settingsSha = syncedFiles[PATH_SETTINGS]?.sha
      await client.value.writeFile(
        repo,
        PATH_SETTINGS,
        JSON.stringify(localSettings, null, 2),
        settingsSha ? 'update settings' : 'create settings',
        settingsSha,
      )

      // ── 4. 阅读数据 ──────────────────────────────────
      const reading = collectReadingData()
      await syncJsonFile(client.value, repo, PATH_READING_SOURCES, reading.sources, syncedFiles)
      await syncJsonFile(client.value, repo, PATH_READING_ARTICLES, reading.articles, syncedFiles)

      // ── 5. 想法库数据 ────────────────────────────────
      const ideaNotes = collectIdeaBoardData()
      await syncJsonFile(client.value, repo, PATH_IDEA_NOTES, ideaNotes, syncedFiles)

      // ── 6. 保存同步状态 ──────────────────────────────
      writeSyncedFiles(syncedFiles)
      lastSyncAt.value = Date.now()
      await postStore.persistImmediately()
      status.value = 'idle'
    }
    catch (e) {
      status.value = 'error'
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }

  function collectReadingData() {
    return {
      sources: localStorage.getItem(READING_SOURCES_KEY) || '[]',
      articles: localStorage.getItem(READING_ARTICLES_KEY) || '[]',
    }
  }

  function collectIdeaBoardData(): string {
    return localStorage.getItem(IDEA_BOARD_KEY) || '[]'
  }

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
  }
})
