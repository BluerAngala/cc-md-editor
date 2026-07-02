<script setup lang="ts">
import { FileText, Globe, Lightbulb, Moon, Newspaper, Settings, Sun } from '@lucide/vue'
import { onMounted } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
const localeStore = useLocaleStore()

onMounted(() => {
  import('@/components/editor/CodemirrorEditor.vue')
  import('@/components/idea-board/IdeaBoard.vue')
  import('@/components/reading/ReadingView.vue')
})
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-background">
    <!-- 右上角工具栏 -->
    <div class="absolute right-6 top-6 flex items-center gap-2">
      <!-- 语言切换 -->
      <button
        class="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        @click="localeStore.setLocale(localeStore.locale === 'zh-CN' ? 'en-US' : 'zh-CN')"
      >
        <Globe class="h-3.5 w-3.5" />
        {{ localeStore.locale === 'zh-CN' ? '中文' : 'EN' }}
      </button>

      <!-- 主题切换 -->
      <button
        class="flex h-9 w-9 items-center justify-center rounded-lg border bg-card shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        @click="uiStore.toggleDark()"
      >
        <Sun v-if="uiStore.isDark" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </button>

      <!-- 设置 -->
      <button
        class="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        @click="uiStore.toggleShowPreferencesDialog()"
      >
        <Settings class="h-4 w-4" />
        设置
      </button>
    </div>

    <div class="flex flex-col items-center gap-8">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight">
          CC 写作工具箱
        </h1>
        <p class="mt-2 text-muted-foreground">
          选择你要进入的工作区
        </p>
      </div>

      <div class="flex gap-6">
        <!-- 资讯阅读 -->
        <button
          class="group flex w-56 flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-md"
          @click="uiStore.setCurrentView('reading')"
        >
          <Newspaper class="h-10 w-10 text-blue-500 transition-transform group-hover:scale-110" />
          <div class="text-center">
            <h2 class="text-lg font-semibold">
              资讯阅读
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
              RSS 订阅、记录想法
            </p>
          </div>
        </button>

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
