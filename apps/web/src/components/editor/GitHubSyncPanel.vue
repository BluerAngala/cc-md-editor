<script setup lang="ts">
import { Check, Cloud, CloudOff, ExternalLink, Loader2, Settings } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GitHubSyncClient } from '@/services/github/client'
import { useGitHubSyncStore } from '@/stores/githubSync'

const syncStore = useGitHubSyncStore()

const showConfig = ref(false)
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

async function startOAuth() {
  try {
    deviceFlow.value = { userCode: '', verifyUri: '', status: 'pending', error: '' }
    const resp = await GitHubSyncClient.startDeviceFlow()
    deviceFlow.value.userCode = resp.user_code
    deviceFlow.value.verifyUri = resp.verification_uri

    // 打开授权页面
    window.open(resp.verification_uri, '_blank')

    // 轮询等待授权
    const token = await GitHubSyncClient.pollForToken(resp.device_code, resp.interval)
    syncStore.setToken(token)
    deviceFlow.value.status = 'done'
    showConfig.value = false

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
  showConfig.value = false
  showPatInput.value = false
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
    testResult.value = `✅ 连接成功：${username}`
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
    showConfig.value = true
    return
  }
  await syncStore.sync()
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <Button
      variant="ghost"
      size="sm"
      class="h-7 gap-1 text-xs"
      :disabled="syncStore.status === 'syncing'"
      @click="handleSync"
    >
      <Loader2 v-if="syncStore.status === 'syncing'" class="h-3.5 w-3.5 animate-spin" />
      <Cloud v-else-if="syncStore.isConfigured" class="h-3.5 w-3.5" />
      <CloudOff v-else class="h-3.5 w-3.5" />
      {{ syncStore.status === 'syncing' ? '同步中...' : 'GitHub 同步' }}
    </Button>
    <Button variant="ghost" size="icon" class="h-7 w-7" @click="showConfig = !showConfig">
      <Settings class="h-3.5 w-3.5" />
    </Button>
  </div>

  <!-- 配置面板 -->
  <div v-if="showConfig" class="mt-2 rounded-lg border p-3 space-y-3">
    <!-- 已配置状态 -->
    <div v-if="syncStore.isConfigured && !deviceFlow" class="flex items-center justify-between">
      <span class="text-xs text-green-500">✅ 已连接 GitHub</span>
      <div class="flex gap-1.5">
        <Button variant="outline" size="sm" class="h-6 text-xs" @click="syncStore.clearToken(); showConfig = false">
          断开连接
        </Button>
      </div>
    </div>

    <!-- 未配置：OAuth 授权 -->
    <template v-if="!syncStore.isConfigured && !deviceFlow && !showPatInput">
      <p class="text-xs text-muted-foreground">
        授权后文档自动同步到你的 GitHub 私有仓库
      </p>
      <Button size="sm" class="w-full h-8 gap-1.5" @click="startOAuth">
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
        GitHub 授权登录
      </Button>
      <p class="text-center text-[10px] text-muted-foreground">
        或
        <button class="text-primary underline" @click="showPatInput = true">
          使用 Personal Access Token
        </button>
      </p>
    </template>

    <!-- Device Flow 等待授权 -->
    <template v-if="deviceFlow?.status === 'pending'">
      <p class="text-xs text-muted-foreground">
        请在浏览器中完成授权：
      </p>
      <div class="rounded-md bg-muted p-3 text-center">
        <p class="text-lg font-bold tracking-widest">
          {{ deviceFlow.userCode }}
        </p>
        <a :href="deviceFlow.verifyUri" target="_blank" class="mt-1 inline-flex items-center gap-1 text-xs text-primary underline">
          {{ deviceFlow.verifyUri }}
          <ExternalLink class="h-3 w-3" />
        </a>
      </div>
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
        等待授权中...
      </div>
    </template>

    <!-- Device Flow 错误 -->
    <template v-if="deviceFlow?.status === 'error'">
      <p class="text-xs text-red-500">
        {{ deviceFlow.error }}
      </p>
      <Button variant="outline" size="sm" class="h-7 text-xs" @click="deviceFlow = null">
        重试
      </Button>
    </template>

    <!-- PAT 输入 -->
    <template v-if="showPatInput">
      <p class="text-xs text-muted-foreground">
        输入 GitHub Personal Access Token（
        <a href="https://github.com/settings/tokens/new?scopes=repo&description=CC-MD-Editor" target="_blank" class="text-primary underline">
          创建 Token →
        </a>
        ）
      </p>
      <Input v-model="inputToken" type="password" placeholder="ghp_xxxx 或 github_pat_xxxx" class="h-8 text-xs font-mono" />
      <div class="flex items-center gap-2">
        <Button size="sm" class="h-7 text-xs" @click="savePat">
          <Check class="h-3 w-3 mr-1" />保存
        </Button>
        <Button variant="outline" size="sm" class="h-7 text-xs" :disabled="testing" @click="testConnection">
          {{ testing ? '测试中...' : '测试连接' }}
        </Button>
        <button class="text-xs text-muted-foreground underline" @click="showPatInput = false">
          返回
        </button>
      </div>
    </template>

    <!-- 通用错误 -->
    <p v-if="syncStore.lastError && !deviceFlow" class="text-xs text-red-500">
      {{ syncStore.lastError }}
    </p>
    <p v-if="testResult" class="text-xs" :class="testResult.startsWith('✅') ? 'text-green-500' : 'text-red-500'">
      {{ testResult }}
    </p>
  </div>
</template>
