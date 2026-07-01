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
  // 获取选中文本，填充到想法输入框
  const selection = window.getSelection()
  const text = selection?.toString().trim()
  if (text) {
    ideaText.value = ideaText.value
      ? `${ideaText.value}\n${text}`
      : text
  }
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
    <div class="border-b px-6 py-3">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold leading-snug">
            {{ article.title }}
          </h2>
          <p class="mt-1 text-[10px] text-muted-foreground">
            {{ article.sourceTitle }}
            <template v-if="article.author">
              · {{ article.author }}
            </template>
            · {{ formatDate(article.publishedAt) }}
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="readingStore.toggleStar(article.id)">
            <Star
              class="h-4 w-4"
              :class="article.starred ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'"
            />
          </Button>
          <a v-if="article.link" :href="article.link" target="_blank">
            <Button variant="ghost" size="icon" class="h-7 w-7">
              <ExternalLink class="h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>
    </div>

    <!-- 文章内容 + 记录想法 -->
    <div class="flex flex-1 overflow-hidden">
      <!-- 文章正文 -->
      <div
        class="flex-1 overflow-y-auto px-6 py-4 prose prose-sm dark:prose-invert max-w-none"
        @mouseup="handleSelect"
        v-html="article.content || article.summary"
      />

      <!-- 记录想法侧栏 -->
      <div class="w-64 border-l flex flex-col">
        <div class="px-3 py-2 border-b flex items-center gap-1.5">
          <Lightbulb class="h-3.5 w-3.5 text-amber-500" />
          <span class="text-xs font-medium">记录想法</span>
        </div>
        <div class="flex flex-1 flex-col p-3">
          <p class="text-[10px] text-muted-foreground mb-2">
            选中文章中的文字自动填入，或直接输入
          </p>
          <Textarea
            v-model="ideaText"
            placeholder="记录你的想法..."
            class="flex-1 resize-none text-xs"
          />
          <div class="mt-2 flex items-center justify-between">
            <span v-if="ideaSaved" class="text-[10px] text-green-500">
              ✓ 已保存到想法库
            </span>
            <span v-else class="text-[10px] text-muted-foreground">
              将同步到便签墙
            </span>
            <Button
              size="sm"
              class="h-7 gap-1 text-xs"
              :disabled="!ideaText.trim()"
              @click="saveIdea"
            >
              <Lightbulb class="h-3 w-3" />
              记录
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
