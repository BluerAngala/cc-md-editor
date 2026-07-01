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

/** 收集所有 localStorage 设置（含密钥，私有仓库不限制） */
function collectAllSettings(): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key)
      continue
    // 跳过 GitHub 同步自身的状态
    if (key === GITHUB_TOKEN_KEY || key === LAST_SYNC_KEY || key === SYNCED_FILES_KEY)
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

/** 将远端设置写入本地 localStorage */
function applySettings(settings: Record<string, unknown>): void {
  const SKIP_KEYS = new Set([
    GITHUB_TOKEN_KEY,
    LAST_SYNC_KEY,
    SYNCED_FILES_KEY,
    addPrefix('current_post_id'),
    addPrefix('sort_mode'),
  ])
  for (const [key, value] of Object.entries(settings)) {
    if (SKIP_KEYS.has(key))
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
      storedRepoName.value = `${username}/${REPO_NAME}`
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

      // 2. 拉取远端文件列表
      const remoteFiles = await client.value.listFiles(repo, 'posts')

      // 3. 拉取远端变更（本地没有或远端更新的）
      for (const remoteFile of remoteFiles) {
        if (!remoteFile.name.endsWith('.md'))
          continue
        const docId = remoteFile.name.replace(/\.md$/, '')
        const localMeta = syncedFiles[docId]

        // 远端文件有更新
        if (!localMeta || localMeta.sha !== remoteFile.sha) {
          const fileData = await client.value.readFile(repo, remoteFile.path)
          if (!fileData)
            continue

          const existing = postStore.getPostById(docId)
          if (existing) {
            // 本地有这篇文章，检查是否本地也有修改
            const localUpdated = new Date(existing.updateDatetime).getTime()
            if (localUpdated <= lastSyncAt.value || !localMeta) {
              postStore.updatePostContent(docId, fileData.content)
            }
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

          syncedFiles[docId] = { path: remoteFile.path, sha: fileData.sha }
        }
      }

      // 4. 推送本地变更
      for (const post of postStore.posts) {
        const localMeta = syncedFiles[post.id]
        const fileName = `posts/${post.id}.md`

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

      // 5. 删除远端已删除的本地文件
      const currentIds = new Set(postStore.posts.map(p => p.id))
      for (const [docId, meta] of Object.entries(syncedFiles)) {
        if (!currentIds.has(docId)) {
          try {
            await client.value.deleteFile(repo, meta.path, `delete: ${docId}`, meta.sha)
          }
          catch {
            // 文件可能已删除，忽略
          }
          delete syncedFiles[docId]
        }
      }

      // 6. 同步设置（全量，含密钥）
      const settingsFile = await client.value.readFile(repo, 'settings.json')
      if (settingsFile) {
        try {
          const remoteSettings = JSON.parse(settingsFile.content)
          applySettings(remoteSettings)
        }
        catch { /* ignore parse errors */ }
      }

      const localSettings = collectAllSettings()
      const settingsSha = settingsFile?.sha
      await client.value.writeFile(
        repo,
        'settings.json',
        JSON.stringify(localSettings, null, 2),
        settingsSha ? 'update settings' : 'create settings',
        settingsSha,
      )

      // 7. 保存同步状态
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
