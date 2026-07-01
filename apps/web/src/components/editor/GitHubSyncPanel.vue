<script setup lang="ts">
import { Check, Cloud, CloudOff, ExternalLink, Loader2, RefreshCcw, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GitHubSyncClient } from '@/services/github/client'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { useAuthStore } from '@/stores/auth'
import { useGitHubSyncStore } from '@/stores/githubSync'

const SYNC_METHOD_KEY = addPrefix('sync_method')
const syncMethod = store.reactive<'official' | 'github'>(SYNC_METHOD_KEY, 'github')

const githubStore = useGitHubSyncStore()
const authStore = useAuthStore()

const showPanel = ref(false)
const testing = ref(false)
const testResult = ref('')
const inputToken = ref(githubStore.token)

const isOfficialConfigured = computed(() => authStore.isLoggedIn)
const isGithubConfigured = computed(() => githubStore.isConfigured)

const lastSyncText = computed(() => {
  if (!githubStore.lastSyncAt)
    return ''
  const diff = Date.now() - githubStore.lastSyncAt
  if (diff < 60000)
    return '刚刚'
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
})

function selectMethod(method: 'official' | 'github') {
  syncMethod.value = method
}

function saveGithubToken() {
  githubStore.setToken(inputToken.value.trim())
  githubStore.sync()
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
  if (syncMethod.value === 'github') {
    if (!githubStore.isConfigured) {
      showPanel.value = true
      return
    }
    await githubStore.sync()
  }
  // 官方同步由底部 footer 的按钮处理
}
</script>

<template>
  <Button
    variant="ghost"
    size="sm"
    class="h-8 gap-1.5 text-xs"
    :disabled="syncMethod === 'github' && githubStore.status === 'syncing'"
    @click="handleSync"
  >
    <Loader2 v-if="syncMethod === 'github' && githubStore.status === 'syncing'" class="h-3.5 w-3.5 animate-spin" />
    <Cloud v-else-if="syncMethod === 'official' && isOfficialConfigured" class="h-3.5 w-3.5" />
    <Cloud v-else-if="syncMethod === 'github' && isGithubConfigured" class="h-3.5 w-3.5" />
    <CloudOff v-else class="h-3.5 w-3.5" />
    {{ syncMethod === 'github' && githubStore.status === 'syncing' ? '同步中...' : '同步' }}
  </Button>
  <Button variant="ghost" size="icon" class="h-8 w-8" @click="showPanel = !showPanel">
    <Cloud class="h-4 w-4" />
  </Button>

  <div v-if="showPanel" class="absolute right-0 top-full z-50 mt-1 w-96 rounded-lg border bg-background shadow-lg">
    <div class="flex items-center justify-between border-b px-4 py-2.5">
      <span class="text-sm font-medium">同步设置</span>
      <Button variant="ghost" size="icon" class="h-6 w-6" @click="showPanel = false">
        <X class="h-3.5 w-3.5" />
      </Button>
    </div>

    <div class="p-4 space-y-4">
      <!-- 方案选择 -->
      <div>
        <p class="text-xs text-muted-foreground mb-2">
          选择同步方案
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            class="rounded-lg border p-3 text-left transition-colors"
            :class="syncMethod === 'github' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'"
            @click="selectMethod('github')"
          >
            <div class="flex items-center gap-2 mb-1">
              <Cloud class="h-4 w-4" />
              <span class="text-sm font-medium">GitHub 直连</span>
            </div>
            <p class="text-[10px] text-muted-foreground">
              存到你自己的 GitHub 私有仓库，完全可控
            </p>
          </button>
          <button
            class="rounded-lg border p-3 text-left transition-colors"
            :class="syncMethod === 'official' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'"
            @click="selectMethod('official')"
          >
            <div class="flex items-center gap-2 mb-1">
              <Cloud class="h-4 w-4" />
              <span class="text-sm font-medium">官方云同步</span>
            </div>
            <p class="text-[10px] text-muted-foreground">
              通过官方后端同步，需要 GitHub 登录
            </p>
          </button>
        </div>
      </div>

      <!-- GitHub 直连配置 -->
      <template v-if="syncMethod === 'github'">
        <div class="border-t pt-3">
          <template v-if="isGithubConfigured">
            <div class="flex items-center gap-2 text-sm mb-2">
              <Check class="h-4 w-4 text-green-500" />
              <span>已连接</span>
              <span v-if="lastSyncText" class="text-xs text-muted-foreground ml-auto">{{ lastSyncText }}</span>
            </div>
            <p v-if="githubStore.lastError" class="text-xs text-red-500 mb-2">
              {{ githubStore.lastError }}
            </p>
            <div class="flex gap-2">
              <Button size="sm" class="h-7 gap-1 text-xs" :disabled="githubStore.status === 'syncing'" @click="githubStore.sync()">
                <RefreshCcw class="h-3 w-3" :class="{ 'animate-spin': githubStore.status === 'syncing' }" />
                立即同步
              </Button>
              <a
                v-if="githubStore.repoFullName"
                :href="`https://github.com/${githubStore.repoFullName}`"
                target="_blank"
                class="inline-flex items-center"
              >
                <Button variant="outline" size="sm" class="h-7 gap-1 text-xs">
                  <ExternalLink class="h-3 w-3" />
                  查看仓库
                </Button>
              </a>
              <Button variant="outline" size="sm" class="h-7 text-xs" @click="githubStore.clearToken()">
                断开
              </Button>
            </div>
          </template>
          <template v-else>
            <p class="text-xs text-muted-foreground mb-2">
              输入 GitHub Token，同步到你的私有仓库
              <a href="https://github.com/settings/tokens/new?scopes=repo&description=CC-MD-Editor" target="_blank" class="text-primary underline ml-1">
                创建 Token →
              </a>
            </p>
            <Input
              v-model="inputToken"
              type="password"
              placeholder="ghp_xxxx"
              class="h-8 text-xs font-mono"
              @keydown.enter="saveGithubToken"
            />
            <div class="flex gap-2 mt-2">
              <Button size="sm" class="h-7 text-xs" :disabled="!inputToken.trim()" @click="saveGithubToken">
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
      </template>

      <!-- 官方同步状态 -->
      <template v-if="syncMethod === 'official'">
        <div class="border-t pt-3">
          <template v-if="isOfficialConfigured">
            <p class="text-xs text-green-500 mb-2">
              ✅ 已登录官方账号
            </p>
            <p class="text-[10px] text-muted-foreground">
              官方同步由底部状态栏自动管理，无需手动操作
            </p>
          </template>
          <template v-else>
            <p class="text-xs text-muted-foreground">
              需要通过官方后端 GitHub 登录，请使用底部状态栏的同步按钮
            </p>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
