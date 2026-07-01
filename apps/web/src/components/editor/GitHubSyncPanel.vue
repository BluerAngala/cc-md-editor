<script setup lang="ts">
import { Check, Cloud, CloudOff, ExternalLink, Loader2, RefreshCcw, Settings, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GitHubSyncClient } from '@/services/github/client'
import { useGitHubSyncStore } from '@/stores/githubSync'

const syncStore = useGitHubSyncStore()

const showPanel = ref(false)
const testing = ref(false)
const testResult = ref('')

// Device Flow 状态
const deviceFlow = ref<{
  userCode: string
  verifyUri: string
  status: 'pending' | 'done' | 'error'
  error: string
} | null>(null)

// PAT 输入
const inputToken = ref(syncStore.token)
const showPatInput = ref(false)

const lastSyncText = computed(() => {
  if (!syncStore.lastSyncAt)
    return ''
  const d = new Date(syncStore.lastSyncAt)
  const now = new Date()
  const diff = now.getTime() - syncStore.lastSyncAt
  if (diff < 60000)
    return '刚刚'
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
})

async function startOAuth() {
  try {
    deviceFlow.value = { userCode: '', verifyUri: '', status: 'pending', error: '' }
    const resp = await GitHubSyncClient.startDeviceFlow()
    deviceFlow.value.userCode = resp.user_code
    deviceFlow.value.verifyUri = resp.verification_uri

    window.open(resp.verification_uri, '_blank')

    const token = await GitHubSyncClient.pollForToken(resp.device_code, resp.interval)
    syncStore.setToken(token)
    deviceFlow.value.status = 'done'

    // 首次授权后自动同步
    await syncStore.sync()
  }
  catch (e) {
    if (deviceFlow.value) {
      deviceFlow.value.status = 'error'
      deviceFlow.value.error = e instanceof Error ? e.message : '授权失败'
    }
  }
}

function savePat() {
  syncStore.setToken(inputToken.value.trim())
  showPatInput.value = false
  showPanel.value = false
}

async function testConnection() {
  const tokenToTest = inputToken.value.trim() || syncStore.token
  if (!tokenToTest)
    return
  testing.value = true
  testResult.value = ''
  try {
    const client = new GitHubSyncClient(() => tokenToTest)
    const username = await client.getUsername()
    testResult.value = `✅ ${username}`
  }
  catch (e) {
    testResult.value = `❌ ${e instanceof Error ? e.message : '连接失败'}`
  }
  finally {
    testing.value = false
  }
}

async function handleSync() {
  if (!syncStore.isConfigured) {
    showPanel.value = true
    return
  }
  await syncStore.sync()
}
</script>

<template>
  <!-- 同步按钮 -->
  <Button
    variant="ghost"
    size="sm"
    class="h-8 gap-1.5 text-xs"
    :disabled="syncStore.status === 'syncing'"
    @click="handleSync"
  >
    <Loader2 v-if="syncStore.status === 'syncing'" class="h-3.5 w-3.5 animate-spin" />
    <Cloud v-else-if="syncStore.isConfigured" class="h-3.5 w-3.5" />
    <CloudOff v-else class="h-3.5 w-3.5" />
    {{ syncStore.status === 'syncing' ? '同步中...' : '同步' }}
  </Button>
  <Button variant="ghost" size="icon" class="h-8 w-8" @click="showPanel = !showPanel">
    <Settings class="h-3.5 w-3.5" />
  </Button>

  <!-- 弹出面板 -->
  <div v-if="showPanel" class="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-background shadow-lg">
    <!-- 头部 -->
    <div class="flex items-center justify-between border-b px-4 py-2.5">
      <span class="text-sm font-medium">GitHub 同步</span>
      <Button variant="ghost" size="icon" class="h-6 w-6" @click="showPanel = false">
        <X class="h-3.5 w-3.5" />
      </Button>
    </div>

    <div class="p-4 space-y-3">
      <!-- 已连接状态 -->
      <template v-if="syncStore.isConfigured && !deviceFlow">
        <div class="flex items-center gap-2 text-sm">
          <Check class="h-4 w-4 text-green-500" />
          <span>已连接 GitHub</span>
        </div>
        <p v-if="lastSyncText" class="text-xs text-muted-foreground">
          上次同步：{{ lastSyncText }}
        </p>
        <p v-if="syncStore.lastError" class="text-xs text-red-500">
          {{ syncStore.lastError }}
        </p>
        <div class="flex gap-2">
          <Button size="sm" class="h-7 gap-1 text-xs" :disabled="syncStore.status === 'syncing'" @click="syncStore.sync()">
            <RefreshCcw class="h-3 w-3" :class="{ 'animate-spin': syncStore.status === 'syncing' }" />
            立即同步
          </Button>
          <Button variant="outline" size="sm" class="h-7 text-xs" @click="syncStore.clearToken(); showPanel = false">
            断开连接
          </Button>
        </div>
      </template>

      <!-- Device Flow 等待授权 -->
      <template v-else-if="deviceFlow?.status === 'pending'">
        <p class="text-sm">
          请在弹出的页面中完成授权：
        </p>
        <div class="rounded-md bg-muted p-3 text-center">
          <p class="text-2xl font-bold tracking-widest select-all">
            {{ deviceFlow.userCode }}
          </p>
        </div>
        <a
          :href="deviceFlow.verifyUri"
          target="_blank"
          class="flex items-center justify-center gap-1 text-xs text-primary underline"
        >
          {{ deviceFlow.verifyUri }}
          <ExternalLink class="h-3 w-3" />
        </a>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          等待授权完成...
        </div>
      </template>

      <!-- Device Flow 错误 -->
      <template v-else-if="deviceFlow?.status === 'error'">
        <p class="text-xs text-red-500">
          {{ deviceFlow.error }}
        </p>
        <Button variant="outline" size="sm" class="h-7 text-xs" @click="deviceFlow = null">
          重试
        </Button>
      </template>

      <!-- 未配置：引导页 -->
      <template v-else-if="!showPatInput">
        <div class="text-center space-y-3 py-2">
          <Cloud class="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p class="text-sm text-muted-foreground">
            同步文档和设置到你的 GitHub 私有仓库<br>
            <span class="text-[10px]">数据存在你自己的账号，完全隔离</span>
          </p>
          <Button size="sm" class="w-full h-8 gap-1.5" @click="startOAuth">
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
            GitHub 一键授权
          </Button>
          <p class="text-[10px] text-muted-foreground">
            或 <button class="text-primary underline" @click="showPatInput = true">
              用 Token 配置
            </button>
          </p>
        </div>
      </template>

      <!-- PAT 输入 -->
      <template v-else>
        <button class="text-xs text-muted-foreground" @click="showPatInput = false">
          ← 返回
        </button>
        <p class="text-xs text-muted-foreground">
          GitHub Personal Access Token（需要 repo 权限）
          <a href="https://github.com/settings/tokens/new?scopes=repo&description=CC-MD-Editor" target="_blank" class="text-primary underline ml-1">
            创建 Token
          </a>
        </p>
        <Input v-model="inputToken" type="password" placeholder="ghp_xxxx" class="h-8 text-xs font-mono" />
        <div class="flex gap-2">
          <Button size="sm" class="h-7 text-xs" @click="savePat">
            保存
          </Button>
          <Button variant="outline" size="sm" class="h-7 text-xs" :disabled="testing" @click="testConnection">
            {{ testing ? '...' : '测试' }}
          </Button>
          <span v-if="testResult" class="self-center text-xs" :class="testResult.startsWith('✅') ? 'text-green-500' : 'text-red-500'">
            {{ testResult }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
