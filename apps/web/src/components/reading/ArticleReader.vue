<script setup lang="ts">
import type { Article } from '@/stores/reading'
import { ExternalLink, Lightbulb, Quote, Star } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useReadingStore } from '@/stores/reading'

const props = defineProps<{
  article: Article
}>()

const readingStore = useReadingStore()

const quoteText = ref('')
const ideaText = ref('')
const ideaSaved = ref(false)

const SCENE_STORAGE_KEY = 'idea-board-scenes'

function saveIdea() {
  if (!ideaText.value.trim())
    return

  // 构造描述：摘要 + 想法
  let desc = ''
  if (quoteText.value.trim())
    desc += `📖 ${quoteText.value.trim()}`
  if (ideaText.value.trim())
    desc += `${desc ? '\n' : ''}💡 ${ideaText.value.trim()}`

  // 直接写入 IdeaBoard 的场景存储
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY)
    const scenes: any[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    scenes.unshift({
      id: now.toString(36) + Math.random().toString(36).slice(2, 8),
      title: props.article.title.slice(0, 30),
      desc,
      color: 0,
      group: '阅读笔记',
      x: 20 + Math.random() * 100,
      y: 20 + Math.random() * 100,
      w: 220,
      h: 140,
      elements: [],
      createdAt: now,
      updatedAt: now,
    })
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scenes))
  }
  catch { /* ignore */ }

  quoteText.value = ''
  ideaText.value = ''
  ideaSaved.value = true
  setTimeout(() => { ideaSaved.value = false }, 2000)
}

function handleSelect() {
  requestAnimationFrame(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (text && text.length > 1) {
      quoteText.value = quoteText.value
        ? `${quoteText.value}\n${text}`
        : text
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
        class="article-content flex-1 overflow-y-auto px-8 py-6 select-text cursor-text"
        @mouseup="handleSelect"
        v-html="article.content || article.summary"
      />

      <!-- 记录想法侧栏 -->
      <div class="w-80 border-l flex flex-col bg-muted/20">
        <div class="px-4 py-3 border-b flex items-center gap-2">
          <Lightbulb class="h-4 w-4 text-amber-500" />
          <span class="text-sm font-medium">记录想法</span>
        </div>
        <div class="flex flex-1 flex-col p-4 gap-3 overflow-y-auto">
          <!-- 摘录区 -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-1.5">
                <Quote class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-xs font-medium text-muted-foreground">原文摘录</span>
              </div>
              <button
                v-if="quoteText"
                class="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                @click="quoteText = ''"
              >
                清空
              </button>
            </div>
            <Textarea
              v-model="quoteText"
              placeholder="选中文章文字自动填入..."
              class="min-h-[80px] max-h-[200px] resize-none text-xs bg-background border-dashed"
            />
          </div>

          <!-- 想法区 -->
          <div class="flex-1 flex flex-col">
            <div class="flex items-center gap-1.5 mb-1.5">
              <Lightbulb class="h-3.5 w-3.5 text-amber-500" />
              <span class="text-xs font-medium">我的想法</span>
            </div>
            <Textarea
              v-model="ideaText"
              placeholder="写下你的想法、观点、联想..."
              class="flex-1 min-h-[120px] resize-none text-sm bg-background"
            />
          </div>

          <!-- 保存按钮 -->
          <div class="flex items-center justify-between pt-1">
            <span v-if="ideaSaved" class="text-xs text-green-500">
              ✓ 已保存到想法库
            </span>
            <span v-else class="text-xs text-muted-foreground">
              摘录 + 想法 → 便签墙
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
