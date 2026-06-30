<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ExcalidrawWrapper from './ExcalidrawWrapper.vue'

const emit = defineEmits<{
  goToEditor: []
  goToLanding: []
}>()

const STORAGE_KEY = 'idea-board-scene'

interface SceneData {
  elements: any[]
  appState?: Record<string, any>
}

const initialData = ref<{ elements: any[] }>({ elements: [] })
const isDirty = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data: SceneData = JSON.parse(raw)
      initialData.value = { elements: data.elements || [] }
    }
  }
  catch {
    // ignore
  }
})

function handleChange(elements: readonly any[], appState: any, _files: any) {
  isDirty.value = true

  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: SceneData = {
      elements: [...elements],
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    isDirty.value = false
  }, 1000)
}
</script>

<template>
  <div class="flex h-screen flex-col">
    <!-- Header -->
    <header class="flex items-center gap-3 border-b px-4 py-2">
      <span class="i-lucide-lightbulb text-lg text-amber-500" />
      <h1 class="text-base font-semibold">
        想法库
      </h1>

      <span v-if="isDirty" class="text-xs text-muted-foreground">保存中...</span>
      <span v-else class="text-xs text-muted-foreground">已保存</span>

      <div class="flex-1" />

      <TooltipProvider :delay-duration="300">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="outline" size="sm" @click="emit('goToLanding')">
              <span class="i-lucide-home mr-1 h-4 w-4" />
              首页
            </Button>
          </TooltipTrigger>
          <TooltipContent>返回首页</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="outline" size="sm" @click="emit('goToEditor')">
              <span class="i-lucide-file-text mr-1 h-4 w-4" />
              编辑器
            </Button>
          </TooltipTrigger>
          <TooltipContent>前往 Markdown 编辑器</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </header>

    <!-- Excalidraw canvas -->
    <div class="flex-1">
      <ExcalidrawWrapper
        :initial-data="initialData"
        @change="handleChange"
      />
    </div>
  </div>
</template>
