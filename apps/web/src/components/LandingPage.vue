<script setup lang="ts">
import { FileText, Lightbulb } from '@lucide/vue'
import { onMounted } from 'vue'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()

onMounted(() => {
  // 首页挂载后立即后台预加载编辑器和想法库
  import('@/components/editor/CodemirrorEditor.vue')
  import('@/components/idea-board/IdeaBoard.vue')
})
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-background">
    <div class="flex flex-col items-center gap-8">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">
          CC Markdown Editor
        </h1>
        <p class="mt-2 text-muted-foreground">
          选择你要进入的工作区
        </p>
      </div>

      <div class="flex gap-6">
        <!-- 想法库 -->
        <button
          class="group flex w-56 flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-amber-500 hover:shadow-md"
          @click="uiStore.setCurrentView('ideaBoard')"
        >
          <Lightbulb class="h-10 w-10 text-amber-500 transition-transform group-hover:scale-110" />
          <div class="text-center">
            <h2 class="text-lg font-semibold">
              想法库
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
              白板画布、自由创作
            </p>
          </div>
        </button>

        <!-- MD 编辑器 -->
        <button
          class="group flex w-56 flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary hover:shadow-md"
          @click="uiStore.setCurrentView('editor')"
        >
          <FileText class="h-10 w-10 text-primary transition-transform group-hover:scale-110" />
          <div class="text-center">
            <h2 class="text-lg font-semibold">
              Markdown 编辑器
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
              写作、排版、预览
            </p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
