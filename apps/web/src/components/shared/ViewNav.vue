<script setup lang="ts">
import { FileText, Home, Lightbulb, Newspaper } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()

const views = [
  { id: 'landing' as const, label: '首页', icon: Home, color: '' },
  { id: 'reading' as const, label: '资讯阅读', icon: Newspaper, color: 'text-blue-500' },
  { id: 'ideaBoard' as const, label: '想法库', icon: Lightbulb, color: 'text-amber-500' },
  { id: 'editor' as const, label: '编辑器', icon: FileText, color: '' },
]
</script>

<template>
  <div class="flex items-center gap-1">
    <Button
      v-for="v in views"
      :key="v.id"
      variant="outline"
      size="sm"
      :class="{ 'bg-muted font-medium': uiStore.currentView === v.id }"
      @click="uiStore.setCurrentView(v.id)"
    >
      <component :is="v.icon" class="mr-1 h-4 w-4" :class="v.color" />
      {{ v.label }}
    </Button>
  </div>
</template>
