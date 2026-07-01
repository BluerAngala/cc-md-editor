<script setup lang="ts">
import type { Article } from '@/stores/reading'
import { ExternalLink, Lightbulb, Star } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useIdeaBoardStore } from '@/stores/ideaBoard'
import { useReadingStore } from '@/stores/reading'

const props = defineProps<{
  article: Article
}>()

const readingStore = useReadingStore()
const ideaStore = useIdeaBoardStore()

const ideaText = ref('')
const ideaSaved = ref(false)
const contentRef = ref<HTMLDivElement | null>(null)

function saveIdea() {
  if (!ideaText.value.trim())
    return
  const prefix = `[${props.article.title.slice(0, 30)}] `
  ideaStore.addNote(prefix + ideaText.value.trim(), 'yellow', '阅读笔记')
  ideaText.value = ''
  ideaSaved.value = true
  setTimeout(() => { ideaSaved.value = false }, 2000)
}

function handleSelect() {
  // 延迟一帧，确保 selection 已更新
  requestAnimationFrame(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (text && text.length > 1) {
      ideaText.value = ideaText.value
        ? `${ideaText.value}\n「${text}」`
        : `「${text}」`
    }
  })
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- 文章头部 -->
    <div class="border-b px-8 py-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-bold leading-tight">
            {{ article.title }}
          </h1>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ article.sourceTitle }}
            <template v-if="article.author">
              · {{ article.author }}
            </template>
            · {{ formatDate(article.publishedAt) }}
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="readingStore.toggleStar(article.id)">
            <Star
              class="h-4.5 w-4.5"
              :class="article.starred ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'"
            />
          </Button>
          <a v-if="article.link" :href="article.link" target="_blank">
            <Button variant="ghost" size="icon" class="h-8 w-8">
              <ExternalLink class="h-4.5 w-4.5" />
            </Button>
          </a>
        </div>
      </div>
    </div>

    <!-- 文章内容 + 记录想法 -->
    <div class="flex flex-1 overflow-hidden">
      <!-- 文章正文 -->
      <div
        ref="contentRef"
        class="article-content flex-1 overflow-y-auto px-8 py-6 select-text cursor-text"
        @mouseup="handleSelect"
        v-html="article.content || article.summary"
      />

      <!-- 记录想法侧栏 -->
      <div class="w-72 border-l flex flex-col bg-muted/30">
        <div class="px-4 py-3 border-b flex items-center gap-2">
          <Lightbulb class="h-4 w-4 text-amber-500" />
          <span class="text-sm font-medium">记录想法</span>
        </div>
        <div class="flex flex-1 flex-col p-4">
          <p class="text-xs text-muted-foreground mb-3">
            选中文章文字自动填入，或直接输入
          </p>
          <Textarea
            v-model="ideaText"
            placeholder="记录你的想法..."
            class="flex-1 resize-none text-sm"
          />
          <div class="mt-3 flex items-center justify-between">
            <span v-if="ideaSaved" class="text-xs text-green-500">
              ✓ 已保存到想法库
            </span>
            <span v-else class="text-xs text-muted-foreground">
              将同步到便签墙
            </span>
            <Button
              size="sm"
              class="h-8 gap-1.5 text-sm"
              :disabled="!ideaText.trim()"
              @click="saveIdea"
            >
              <Lightbulb class="h-3.5 w-3.5" />
              记录
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.article-content :deep(h1) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}
.article-content :deep(h2) {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}
.article-content :deep(h3) {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}
.article-content :deep(p) {
  font-size: 0.9rem;
  line-height: 1.8;
  margin-bottom: 0.75rem;
  color: hsl(var(--foreground) / 0.85);
}
.article-content :deep(li) {
  font-size: 0.9rem;
  line-height: 1.7;
  margin-bottom: 0.25rem;
}
.article-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.article-content :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 1rem 0;
}
.article-content ::selection {
  background: hsl(var(--primary) / 0.2);
}
</style>
