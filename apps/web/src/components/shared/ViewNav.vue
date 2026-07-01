<script setup lang="ts">
import { ChevronDown, FileText, Home, Lightbulb, Newspaper } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()

const views = [
  { id: 'landing' as const, label: '首页', icon: Home, color: '' },
  { id: 'reading' as const, label: '资讯阅读', icon: Newspaper, color: 'text-blue-500' },
  { id: 'ideaBoard' as const, label: '想法库', icon: Lightbulb, color: 'text-amber-500' },
  { id: 'editor' as const, label: '编辑器', icon: FileText, color: '' },
]

const currentView = views.find(v => v.id === uiStore.currentView) || views[0]
</script>

<template>
  <div class="relative group">
    <Button variant="outline" size="sm" class="gap-1.5">
      <component :is="currentView.icon" class="h-4 w-4" :class="currentView.color" />
      {{ currentView.label }}
      <ChevronDown class="h-3 w-3 text-muted-foreground" />
    </Button>
    <div class="absolute left-0 top-full z-50 mt-1 hidden min-w-[140px] rounded-lg border bg-background p-1 shadow-lg group-hover:block">
      <button
        v-for="v in views"
        :key="v.id"
        class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        :class="{ 'bg-muted font-medium': uiStore.currentView === v.id }"
        @click="uiStore.setCurrentView(v.id)"
      >
        <component :is="v.icon" class="h-4 w-4" :class="v.color" />
        {{ v.label }}
      </button>
    </div>
  </div>
</template>
