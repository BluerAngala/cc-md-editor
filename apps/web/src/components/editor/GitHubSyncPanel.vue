<script setup lang="ts">
import { Check, Cloud, CloudOff, Loader2, RefreshCcw, Settings, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GitHubSyncClient } from '@/services/github/client'
import { useGitHubSyncStore } from '@/stores/githubSync'

const syncStore = useGitHubSyncStore()

const showPanel = ref(false)
const testing = ref(false)
const testResult = ref('')
const inputToken = ref(syncStore.token)

const lastSyncText = computed(() => {
  if (!syncStore.lastSyncAt)
    return ''
  const diff = Date.now() - syncStore.lastSyncAt
  if (diff < 60000)
    return '刚刚'
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
})

function save() {
  syncStore.setToken(inputToken.value.trim())
  showPanel.value = false
  // 首次配置后自动同步
  syncStore.sync()
}

async function testConnection() {
  if (!inputToken.value.trim())
    return
  testing.value = true
  testResult.value = ''
  try {
    const client = new GitHubSyncClient(() => inputToken.value.trim())
    const username = await client.getUsername()
    testResult.value = `✅ ${username}`
  }
  catch (e) {
    testResult.value = `❌ ${e instanceof Error ? e.message : '失败'}`
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

  <div v-if="showPanel" class="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-background shadow-lg">
    <div class="flex items-center justify-between border-b px-4 py-2.5">
      <span class="text-sm font-medium">GitHub 同步</span>
      <Button variant="ghost" size="icon" class="h-6 w-6" @click="showPanel = false">
        <X class="h-3.5 w-3.5" />
      </Button>
    </div>

    <div class="p-4 space-y-3">
      <!-- 已连接 -->
      <template v-if="syncStore.isConfigured">
        <div class="flex items-center gap-2 text-sm">
          <Check class="h-4 w-4 text-green-500" />
          <span>已连接</span>
          <span v-if="lastSyncText" class="text-xs text-muted-foreground ml-auto">{{ lastSyncText }}</span>
        </div>
        <p v-if="syncStore.lastError" class="text-xs text-red-500">
          {{ syncStore.lastError }}
        </p>
        <div class="flex gap-2">
          <Button size="sm" class="h-7 gap-1 text-xs" :disabled="syncStore.status === 'syncing'" @click="syncStore.sync()">
            <RefreshCcw class="h-3 w-3" :class="{ 'animate-spin': syncStore.status === 'syncing' }" />
            立即同步
          </Button>
          <Button variant="outline" size="sm" class="h-7 text-xs" @click="syncStore.clearToken(); showPanel = false">
            断开
          </Button>
        </div>
      </template>

      <!-- 未配置：Token 输入 -->
      <template v-else>
        <p class="text-xs text-muted-foreground">
          输入 GitHub Token，文档同步到你的私有仓库
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=CC-MD-Editor"
            target="_blank"
            class="text-primary underline ml-1"
          >
            创建 Token →
          </a>
        </p>
        <Input
          v-model="inputToken"
          type="password"
          placeholder="ghp_xxxx 或 github_pat_xxxx"
          class="h-8 text-xs font-mono"
          @keydown.enter="save"
        />
        <div class="flex gap-2">
          <Button size="sm" class="h-7 text-xs" :disabled="!inputToken.trim()" @click="save">
            连接
          </Button>
          <Button variant="outline" size="sm" class="h-7 text-xs" :disabled="testing || !inputToken.trim()" @click="testConnection">
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
