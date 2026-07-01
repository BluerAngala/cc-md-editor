<script setup lang="ts">
import { Cloud } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSyncFooterMeta } from '@/composables/useSyncStatusMeta'
import { isSyncUiEnabled } from '@/services/sync/client'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
const authStore = useAuthStore()
const { isLoggedIn } = storeToRefs(authStore)
const { syncFooterIconClass, syncTooltip } = useSyncFooterMeta()
const showSyncUi = isSyncUiEnabled()

function openSyncDialog() {
  uiStore.toggleShowSyncDialog(true)
}
</script>

<template>
  <TooltipProvider v-if="showSyncUi" :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          :aria-label="syncTooltip"
          class="flex cursor-pointer items-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground"
          @click="openSyncDialog"
        >
          <img
            v-if="isLoggedIn && authStore.user?.avatar"
            :src="authStore.user.avatar"
            :alt="authStore.user.login"
            class="size-5 rounded-full ring-1 ring-border"
          >
          <Cloud
            v-else
            class="size-5"
            :class="syncFooterIconClass"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" :side-offset="6" class="text-xs text-muted-foreground">
        <p>{{ isLoggedIn ? syncTooltip : '云同步' }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
