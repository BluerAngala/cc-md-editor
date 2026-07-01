<script setup lang="ts">
import type { Article } from '@/stores/reading'
import { ExternalLink, History, Lightbulb, Pencil, Quote, Star, Trash2 } from '@lucide/vue'
import { onMounted, ref } from 'vue'
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
const editingId = ref<string | null>(null)
const showHistory = ref(false)

const SCENE_STORAGE_KEY = 'idea-board-scenes'

// ── 历史记录 ─────────────────────────────────────────────
interface HistoryItem {
  id: string
  title: string
  desc: string
  createdAt: number
}

const history = ref<HistoryItem[]>([])

function loadHistory() {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY)
    if (!raw)
      return
    const scenes = JSON.parse(raw)
    history.value = scenes
      .filter((s: any) => s.group === '阅读笔记')
      .map((s: any) => ({ id: s.id, title: s.title, desc: s.desc, createdAt: s.createdAt }))
      .sort((a: HistoryItem, b: HistoryItem) => b.createdAt - a.createdAt)
      .slice(0, 50)
  }
  catch { /* ignore */ }
}

function deleteHistory(id: string) {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY)
    if (!raw)
      return
    const scenes = JSON.parse(raw).filter((s: any) => s.id !== id)
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scenes))
    loadHistory()
  }
  catch { /* ignore */ }
}

function startEdit(item: HistoryItem) {
  editingId.value = item.id
  // 解析 desc 中的摘录和想法
  const lines = item.desc.split('\n')
  let quote = ''
  let idea = ''
  for (const line of lines) {
    if (line.startsWith('📖 '))
      quote = line.slice(2).trim()
    else if (line.startsWith('💡 '))
      idea = line.slice(2).trim()
    else
      idea += (idea ? '\n' : '') + line
  }
  quoteText.value = quote
  ideaText.value = idea
}

function saveEdit() {
  if (!editingId.value || !ideaText.value.trim())
    return
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY)
    if (!raw)
      return
    const scenes = JSON.parse(raw)
    const scene = scenes.find((s: any) => s.id === editingId.value)
    if (scene) {
      let desc = ''
      if (quoteText.value.trim())
        desc += `📖 ${quoteText.value.trim()}`
      if (ideaText.value.trim())
        desc += `${desc ? '\n' : ''}💡 ${ideaText.value.trim()}`
      scene.desc = desc
      scene.updatedAt = Date.now()
      localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scenes))
      loadHistory()
    }
  }
  catch { /* ignore */ }
  editingId.value = null
  quoteText.value = ''
  ideaText.value = ''
}

function cancelEdit() {
  editingId.value = null
  quoteText.value = ''
  ideaText.value = ''
}

// ── 保存新想法 ───────────────────────────────────────────
function saveIdea() {
  if (!ideaText.value.trim())
    return

  let desc = ''
  if (quoteText.value.trim())
    desc += `📖 ${quoteText.value.trim()}`
  if (ideaText.value.trim())
    desc += `${desc ? '\n' : ''}💡 ${ideaText.value.trim()}`

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
  loadHistory()
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
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - ts
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    if (hours < 1)
      return '刚刚'
    return `${hours}小时前`
  }
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days}天前`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(() => loadHistory())
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

        <!-- 摘录 + 想法输入 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
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
              class="min-h-[70px] max-h-[150px] resize-none text-xs bg-background border-dashed"
            />
          </div>

          <!-- 想法区 -->
          <div>
            <div class="flex items-center gap-1.5 mb-1.5">
              <Lightbulb class="h-3.5 w-3.5 text-amber-500" />
              <span class="text-xs font-medium">{{ editingId ? '编辑想法' : '我的想法' }}</span>
            </div>
            <Textarea
              v-model="ideaText"
              placeholder="写下你的想法、观点、联想..."
              class="min-h-[100px] resize-none text-sm bg-background"
            />
          </div>

          <!-- 按钮 -->
          <div class="flex items-center justify-between">
            <span v-if="ideaSaved" class="text-xs text-green-500">
              ✓ 已保存到想法库
            </span>
            <span v-else class="text-xs text-muted-foreground">
              {{ editingId ? '编辑中' : '摘录 + 想法 → 便签墙' }}
            </span>
            <div class="flex gap-1.5">
              <Button
                v-if="editingId"
                variant="ghost"
                size="sm"
                class="h-8 text-xs"
                @click="cancelEdit"
              >
                取消
              </Button>
              <Button
                v-if="editingId"
                size="sm"
                class="h-8 gap-1 text-sm"
                :disabled="!ideaText.trim()"
                @click="saveEdit"
              >
                保存
              </Button>
              <Button
                v-else
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

        <!-- 历史记录（固定在底部） -->
        <div class="border-t shrink-0">
          <button
            class="w-full px-4 py-2.5 flex items-center gap-1.5 hover:bg-muted/50 transition-colors"
            @click="showHistory = !showHistory"
          >
            <History class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-xs font-medium text-muted-foreground">历史记录</span>
            <span class="text-[10px] text-muted-foreground/60">({{ history.length }})</span>
            <span class="ml-auto text-[10px] text-muted-foreground">{{ showHistory ? '收起' : '展开' }}</span>
          </button>
          <div v-if="showHistory" class="max-h-[40vh] overflow-y-auto">
            <div v-if="!history.length" class="px-4 pb-4 text-xs text-muted-foreground/50">
              暂无记录
            </div>
            <div
              v-for="item in history"
              :key="item.id"
              class="group px-4 py-2.5 border-t hover:bg-muted/50 transition-colors"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-xs font-medium truncate flex-1">
                  {{ item.title }}
                </p>
                <span class="text-[10px] text-muted-foreground shrink-0">
                  {{ formatDate(item.createdAt) }}
                </span>
              </div>
              <p class="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap line-clamp-3">
                {{ item.desc }}
              </p>
              <div class="mt-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                  @click="startEdit(item)"
                >
                  <Pencil class="h-2.5 w-2.5" />
                  编辑
                </button>
                <button
                  class="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
                  @click="deleteHistory(item.id)"
                >
                  <Trash2 class="h-2.5 w-2.5" />
                  删除
                </button>
              </div>
            </div>
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
