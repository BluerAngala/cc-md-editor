<script setup lang="ts">
import { Check, Cloud, CloudOff, Loader2, Settings } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGitHubSyncStore } from '@/stores/githubSync'

const syncStore = useGitHubSyncStore()

const inputToken = ref(syncStore.token)
const showConfig = ref(false)
const testing = ref(false)
const testResult = ref('')

async function save() {
  syncStore.setToken(inputToken.value.trim())
  showConfig.value = false
}

async function testConnection() {
  if (!inputToken.value.trim())
    return
  testing.value = true
  testResult.value = ''
  try {
    const { GitHubSyncClient } = await import('@/services/github/client')
    const client = new GitHubSyncClient(() => inputToken.value.trim())
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
    <!-- 同步按钮 -->
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

    <!-- 配置按钮 -->
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      @click="showConfig = !showConfig"
    >
      <Settings class="h-3.5 w-3.5" />
    </Button>
  </div>

  <!-- 配置面板 -->
  <div v-if="showConfig" class="mt-2 rounded-lg border p-3 space-y-2">
    <p class="text-xs text-muted-foreground">
      配置 GitHub Personal Access Token，文档将同步到你的专属私有仓库
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
    />
    <div class="flex items-center gap-2">
      <Button size="sm" class="h-7 text-xs" @click="save">
        <Check class="h-3 w-3 mr-1" />
        保存
      </Button>
      <Button variant="outline" size="sm" class="h-7 text-xs" :disabled="testing" @click="testConnection">
        {{ testing ? '测试中...' : '测试连接' }}
      </Button>
      <span class="text-xs" :class="testResult.startsWith('✅') ? 'text-green-500' : 'text-red-500'">
        {{ testResult }}
      </span>
    </div>
    <p v-if="syncStore.lastError" class="text-xs text-red-500">
      {{ syncStore.lastError }}
    </p>
  </div>
</template>
