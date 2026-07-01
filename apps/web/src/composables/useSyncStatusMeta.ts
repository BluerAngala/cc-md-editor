import type { Component } from 'vue'
import { AlertCircle, Cloud, CloudCheck, CloudOff, Loader2 } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { t } from '@/i18n/translate'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { useAuthStore } from '@/stores/auth'
import { useGitHubSyncStore } from '@/stores/githubSync'
import { useSyncStore } from '@/stores/sync'

export type SyncUiState = `syncing` | `synced` | `error` | `pending`

export interface SyncStatusMeta {
  label: string
  hint: string
  dotClass: string
  icon: Component
  iconClass: string
  footerIconClass: string
}

function buildSyncStatusMeta(
  state: SyncUiState,
  lastError: string | null,
  errorHint: `detail` | `generic`,
): SyncStatusMeta {
  switch (state) {
    case `syncing`:
      return {
        label: t('store.sync.syncing'),
        hint: t('store.sync.syncingHint'),
        dotClass: `bg-primary animate-pulse`,
        icon: Loader2,
        iconClass: `text-primary animate-spin`,
        footerIconClass: `text-primary animate-spin`,
      }
    case `synced`:
      return {
        label: t('store.sync.synced'),
        hint: t('store.sync.syncedHint'),
        dotClass: `bg-green-500`,
        icon: CloudCheck,
        iconClass: `text-green-600 dark:text-green-400`,
        footerIconClass: `text-green-500`,
      }
    case `error`:
      return {
        label: t('store.sync.failed'),
        hint: errorHint === `generic`
          ? t('store.sync.failedHintDetail')
          : (lastError || t('store.sync.retryLater')),
        dotClass: `bg-destructive`,
        icon: AlertCircle,
        iconClass: `text-destructive`,
        footerIconClass: `text-destructive`,
      }
    default:
      return {
        label: t('store.sync.pending'),
        hint: t('store.sync.pendingHint'),
        dotClass: `bg-amber-500`,
        icon: CloudOff,
        iconClass: `text-amber-600 dark:text-amber-400`,
        footerIconClass: `text-amber-500`,
      }
  }
}

export function useSyncStatusMeta(options?: { errorHint?: `detail` | `generic` }) {
  const { locale } = useI18n()
  const syncStore = useSyncStore()
  const { syncState, lastError, isSyncing } = storeToRefs(syncStore)
  const errorHint = options?.errorHint ?? `detail`

  const syncStatusMeta = computed(() => {
    void locale.value
    return buildSyncStatusMeta(syncState.value, lastError.value, errorHint)
  })

  const syncTooltip = computed(() => {
    void locale.value
    switch (syncState.value) {
      case `syncing`:
        return t('store.sync.syncingTooltip')
      case `synced`:
        return t('store.sync.syncedTooltip')
      case `error`:
        return t('store.sync.failedTooltip')
      default:
        return t('store.sync.pendingTooltip')
    }
  })

  return {
    syncState,
    lastError,
    isSyncing,
    syncStatusMeta,
    syncTooltip,
  }
}

/** Footer 同步图标：根据当前同步方案反映对应状态 */
export function useSyncFooterMeta() {
  const authStore = useAuthStore()
  const githubStore = useGitHubSyncStore()
  const { isLoggedIn } = storeToRefs(authStore)
  const { syncStatusMeta, syncState, isSyncing, syncTooltip } = useSyncStatusMeta()

  const SYNC_METHOD_KEY = addPrefix('sync_method')
  const syncMethod = store.reactive<'official' | 'github'>(SYNC_METHOD_KEY, 'github')

  const isActivelySyncing = computed(() => {
    if (syncMethod.value === 'github')
      return githubStore.status === 'syncing'
    return isSyncing.value || syncState.value === `syncing`
  })

  const syncFooterIcon = computed<Component>(() => {
    if (syncMethod.value === 'github') {
      if (!githubStore.isConfigured)
        return CloudOff
      if (githubStore.status === 'syncing')
        return Loader2
      if (githubStore.status === 'error')
        return AlertCircle
      return CloudCheck
    }
    // Official
    if (!isLoggedIn.value)
      return Cloud
    if (isActivelySyncing.value)
      return Loader2
    return syncStatusMeta.value.icon
  })

  const syncFooterIconClass = computed(() => {
    if (syncMethod.value === 'github') {
      if (!githubStore.isConfigured)
        return `text-muted-foreground`
      if (githubStore.status === 'syncing')
        return `text-primary animate-spin`
      if (githubStore.status === 'error')
        return `text-destructive`
      return `text-green-500`
    }
    // Official
    if (!isLoggedIn.value)
      return ``
    if (isActivelySyncing.value)
      return `text-primary animate-spin`
    return syncStatusMeta.value.footerIconClass
  })

  const syncFooterTooltip = computed(() => {
    if (syncMethod.value === 'github') {
      if (!githubStore.isConfigured)
        return 'GitHub 同步未配置'
      if (githubStore.status === 'syncing')
        return 'GitHub 同步中…'
      if (githubStore.status === 'error')
        return 'GitHub 同步失败，点击查看详情'
      return 'GitHub 已同步'
    }
    return syncTooltip.value
  })

  return {
    syncFooterIcon,
    syncFooterIconClass,
    syncTooltip: syncFooterTooltip,
  }
}
