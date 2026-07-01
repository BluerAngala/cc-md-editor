<script setup lang="ts">
import { ChevronDown, FileText, Home, Lightbulb, Newspaper } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSyncFooterMeta } from '@/composables/useSyncStatusMeta'
import { isSyncUiEnabled } from '@/services/sync/client'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
const authStore = useAuthStore()
const { isLoggedIn } = storeToRefs(authStore)
const { syncFooterIcon, syncFooterIconClass, syncTooltip } = useSyncFooterMeta()
const showSyncUi = isSyncUiEnabled()
const open = ref(false)

const views = [
  { id: 'landing' as const, label: '首页', icon: Home, color: '' },
  { id: 'reading' as const, label: '资讯阅读', icon: Newspaper, color: 'text-blue-500' },
  { id: 'ideaBoard' as const, label: '想法库', icon: Lightbulb, color: 'text-amber-500' },
  { id: 'editor' as const, label: '编辑器', icon: FileText, color: '' },
]

const currentView = views.find(v => v.id === uiStore.currentView) || views[0]

function switchView(id: typeof views[number]['id']) {
  uiStore.setCurrentView(id)
  open.value = false
}

function openSyncDialog() {
  uiStore.toggleShowSyncDialog(true)
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm" class="gap-1.5">
        <component :is="currentView.icon" class="h-4 w-4" :class="currentView.color" />
        {{ currentView.label }}
        <ChevronDown class="h-3 w-3 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[140px] p-1">
      <button
        v-for="v in views"
        :key="v.id"
        class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        :class="{ 'bg-muted font-medium': uiStore.currentView === v.id }"
        @click="switchView(v.id)"
      >
        <component :is="v.icon" class="h-4 w-4" :class="v.color" />
        {{ v.label }}
      </button>
    </PopoverContent>
  </Popover>

  <TooltipProvider :delay-duration="300">
    <Tooltip v-if="showSyncUi">
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
            class="size-4 rounded-full"
          >
          <component
            :is="syncFooterIcon"
            v-else
            class="size-4"
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
