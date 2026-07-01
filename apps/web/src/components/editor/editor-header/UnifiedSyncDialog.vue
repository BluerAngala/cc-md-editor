<script setup lang="ts">
import type { Component } from 'vue'
import { AlertCircle, Cloud, CloudCheck, CloudOff, ExternalLink, Loader2, LogIn, RefreshCw, Upload } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import CloudFeatureState from '@/components/editor/editor-header/cloud/CloudFeatureState.vue'
import PanelCard from '@/components/shared/panel-dialog/PanelCard.vue'
import PanelDialog from '@/components/shared/panel-dialog/PanelDialog.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSyncStatusMeta } from '@/composables/useSyncStatusMeta'
import { GitHubSyncClient } from '@/services/github/client'
import { isSyncConfigured } from '@/services/sync/client'
import { store as reactiveStore } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { useAuthStore } from '@/stores/auth'
import { useGitHubSyncStore } from '@/stores/githubSync'
import { useLocaleStore } from '@/stores/locale'
import { useSyncStore } from '@/stores/sync'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const syncStore = useSyncStore()
const githubStore = useGitHubSyncStore()
const uiStore = useUIStore()
const localeStore = useLocaleStore()

const { isLoggedIn } = storeToRefs(authStore)
const { status: officialStatus, lastError: officialError, lastSyncAt: officialLastSync, isSyncing: officialIsSyncing, syncState: officialSyncState } = storeToRefs(syncStore)
const { locale } = storeToRefs(localeStore)
const { syncStatusMeta: officialStatusMeta } = useSyncStatusMeta({ errorHint: `generic` })

const SYNC_METHOD_KEY = addPrefix('sync_method')
const syncMethod = reactiveStore.reactive<'official' | 'github'>(SYNC_METHOD_KEY, 'github')

// GitHub token input
const inputToken = ref(githubStore.token)
const testing = ref(false)
const testResult = ref('')

const dialogOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit(`update:open`, val),
})

// ── Status display (unified for both methods) ──

interface StatusDisplay {
  icon: Component
  iconClass: string
  dotClass: string
  label: string
  hint: string
  lastSyncText: string
}

const statusDisplay = computed<StatusDisplay>(() => {
  if (syncMethod.value === 'github') {
    const s = githubStore.status
    const lastSync = githubStore.lastSyncAt
    const lastSyncText = lastSync ? formatRelativeTime(lastSync) : ''

    if (s === 'syncing') {
      return {
        icon: Loader2,
        iconClass: 'text-primary animate-spin',
        dotClass: 'bg-primary animate-pulse',
        label: t('store.sync.syncing'),
        hint: t('store.sync.syncingHint'),
        lastSyncText,
      }
    }
    if (s === 'error') {
      return {
        icon: AlertCircle,
        iconClass: 'text-destructive',
        dotClass: 'bg-destructive',
        label: t('store.sync.failed'),
        hint: githubStore.lastError || t('store.sync.failedHintDetail'),
        lastSyncText,
      }
    }
    if (githubStore.isConfigured && lastSync) {
      return {
        icon: CloudCheck,
        iconClass: 'text-green-600 dark:text-green-400',
        dotClass: 'bg-green-500',
        label: t('store.sync.synced'),
        hint: t('store.sync.syncedHint'),
        lastSyncText,
      }
    }
    return {
      icon: CloudOff,
      iconClass: 'text-amber-600 dark:text-amber-400',
      dotClass: 'bg-amber-500',
      label: t('store.sync.pending'),
      hint: t('store.sync.pendingHint'),
      lastSyncText,
    }
  }

  // Official sync
  const lastSync = officialLastSync.value
  const lastSyncText = lastSync
    ? new Date(lastSync).toLocaleString(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : t('sync.neverSynced')

  const meta = officialStatusMeta.value
  return {
    icon: meta.icon,
    iconClass: meta.iconClass,
    dotClass: meta.dotClass,
    label: meta.label,
    hint: meta.hint,
    lastSyncText,
  }
})

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000)
    return '刚刚'
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
}

// ── Actions ──

const isSyncing = computed(() =>
  syncMethod.value === 'github'
    ? githubStore.status === 'syncing'
    : officialIsSyncing.value,
)

function selectMethod(method: 'official' | 'github') {
  syncMethod.value = method
}

function openAccountDialog() {
  dialogOpen.value = false
  uiStore.toggleShowAccountDialog(true)
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
    const scope = uiStore.currentView === 'reading'
      ? 'reading'
      : uiStore.currentView === 'ideaBoard'
        ? 'ideaBoard'
        : uiStore.currentView === 'editor'
          ? 'editor'
          : 'all'
    await githubStore.sync(scope)
  }
  else {
    await syncStore.sync()
    if (officialStatus.value === `error`)
      toast.error(t(`sync.syncFailed`, { message: officialError.value }))
    else
      toast.success(t(`sync.syncSuccess`))
  }
}

async function resetRemote() {
  await githubStore.resetRemote()
  if (githubStore.status === 'error')
    toast.error(githubStore.lastError)
  else
    toast.success('远端已重置，本地数据已推送')
}
</script>

<template>
  <PanelDialog
    v-model:open="dialogOpen"
    title="同步设置"
    description="管理你的文档同步方案"
    :icon="Cloud"
  >
    <div class="space-y-4 px-4 py-4 sm:px-6">
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

      <!-- 官方同步：未登录提示 -->
      <CloudFeatureState
        v-if="syncMethod === 'official' && !isSyncConfigured()"
        :icon="CloudOff"
        :title="t('sync.notConfiguredTitle')"
        :description="t('sync.notConfiguredDescription')"
        compact
      />
      <CloudFeatureState
        v-else-if="syncMethod === 'official' && !isLoggedIn"
        :icon="Cloud"
        :title="t('sync.loginTitle')"
        :action-label="t('common.login')"
        :action-icon="LogIn"
        @action="openAccountDialog"
      />

      <!-- GitHub 直连：未配置时显示 Token 输入 -->
      <template v-else-if="syncMethod === 'github' && !githubStore.isConfigured">
        <div class="border-t pt-3">
          <p class="text-xs text-muted-foreground mb-2">
            输入 GitHub Token，同步到你的私有仓库
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
            placeholder="ghp_xxxx"
            class="h-8 text-xs font-mono"
            @keydown.enter="saveGithubToken"
          />
          <div class="flex gap-2 mt-2">
            <Button
              size="sm"
              class="h-7 text-xs"
              :disabled="!inputToken.trim()"
              @click="saveGithubToken"
            >
              连接
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="h-7 text-xs"
              :disabled="testing || !inputToken.trim()"
              @click="testConnection"
            >
              {{ testing ? '...' : '测试' }}
            </Button>
            <span
              v-if="testResult"
              class="self-center text-xs"
              :class="testResult.startsWith('✅') ? 'text-green-500' : 'text-red-500'"
            >
              {{ testResult }}
            </span>
          </div>
        </div>
      </template>

      <!-- 已配置时：统一状态卡片 -->
      <template v-else>
        <PanelCard>
          <template #leading>
            <div
              class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border/60"
            >
              <component
                :is="statusDisplay.icon"
                class="size-4"
                :class="statusDisplay.iconClass"
              />
            </div>
          </template>

          <div class="space-y-1">
            <span class="inline-flex items-center gap-1.5 text-sm font-medium">
              <span class="size-2 rounded-full" :class="statusDisplay.dotClass" />
              {{ statusDisplay.label }}
            </span>
            <p class="text-xs leading-relaxed text-muted-foreground">
              {{ statusDisplay.hint }}
            </p>
            <p v-if="statusDisplay.lastSyncText" class="text-xs tabular-nums text-muted-foreground/80">
              {{ statusDisplay.lastSyncText }}
            </p>
          </div>
        </PanelCard>

        <!-- 错误详情 -->
        <Alert
          v-if="syncMethod === 'official' && officialSyncState === 'error' && officialError"
          variant="destructive"
          class="py-3"
        >
          <AlertCircle class="size-4" />
          <AlertDescription class="text-xs leading-relaxed">
            {{ officialError }}
          </AlertDescription>
        </Alert>
        <Alert
          v-if="syncMethod === 'github' && githubStore.status === 'error' && githubStore.lastError"
          variant="destructive"
          class="py-3"
        >
          <AlertCircle class="size-4" />
          <AlertDescription class="text-xs leading-relaxed">
            {{ githubStore.lastError }}
          </AlertDescription>
        </Alert>

        <!-- 操作按钮 -->
        <div class="flex flex-wrap gap-2">
          <Button
            class="h-9 flex-1 gap-2"
            :disabled="isSyncing"
            @click="handleSync"
          >
            <Loader2 v-if="isSyncing" class="size-4 animate-spin" />
            <RefreshCw v-else class="size-4" />
            {{ isSyncing ? t('sync.syncing') : t('sync.syncNow') }}
          </Button>

          <template v-if="syncMethod === 'github'">
            <a
              v-if="githubStore.repoFullName"
              :href="`https://github.com/${githubStore.repoFullName}`"
              target="_blank"
            >
              <Button variant="outline" class="h-9 gap-2">
                <ExternalLink class="size-4" />
                查看仓库
              </Button>
            </a>
            <Button
              variant="outline"
              class="h-9"
              @click="githubStore.clearToken()"
            >
              断开
            </Button>
          </template>
        </div>

        <Button
          v-if="syncMethod === 'github'"
          variant="outline"
          class="h-8 w-full gap-2 text-xs text-destructive hover:text-destructive"
          :disabled="isSyncing"
          @click="resetRemote"
        >
          <Upload class="size-3.5" />
          重置远端（清空远端，用本地数据重建）
        </Button>
      </template>
    </div>
  </PanelDialog>
</template>
