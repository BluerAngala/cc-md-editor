<script setup lang="ts">
import type { CollectorSelectors } from '@/stores/reading'
import { Bot, Eye, Loader2, Plus, Settings2, Timer, Trash2, X } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCollectorAI } from '@/composables/useCollectorAI'
import { useReadingStore } from '@/stores/reading'

const emit = defineEmits<{
  close: []
}>()

const store = useReadingStore()
const { analyzePage } = useCollectorAI()

// ── 添加表单 ──────────────────────────────────────────
const newUrl = ref('')
const newTitle = ref('')
const newCategory = ref('')
const newDescription = ref('')
const analyzing = ref(false)
const analyzeError = ref('')
const analyzedSelectors = ref<CollectorSelectors | null>(null)
const previewArticles = ref<Array<{ title: string, link: string }>>([])
const showAdvanced = ref(false)

// ── 预置模板 ──────────────────────────────────────────
const TEMPLATES = [
  { label: '新闻列表', desc: '提取页面中的新闻/文章列表', description: '提取页面中所有新闻文章的标题和链接' },
  { label: '博客文章', desc: '提取博客的文章列表', description: '提取博客首页所有文章的标题、摘要和链接' },
  { label: '论坛帖子', desc: '提取论坛的帖子列表', description: '提取论坛帖子列表的标题、作者和链接' },
]

const REFRESH_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 30, label: '30分钟' },
  { value: 60, label: '1小时' },
  { value: 120, label: '2小时' },
  { value: 360, label: '6小时' },
  { value: 1440, label: '24小时' },
]

// ── AI 分析 ──────────────────────────────────────────
async function handleAnalyze() {
  if (!newUrl.value.trim())
    return
  analyzing.value = true
  analyzeError.value = ''
  analyzedSelectors.value = null
  previewArticles.value = []

  try {
    const html = await store.fetchPageHTML(newUrl.value.trim())
    const selectors = await analyzePage(
      newUrl.value.trim(),
      html,
      newDescription.value.trim() || '提取页面中的文章列表',
    )
    analyzedSelectors.value = selectors

    // 自动预览
    const articles = await store.previewCollector(newUrl.value.trim(), selectors)
    previewArticles.value = articles.slice(0, 5).map(a => ({ title: a.title, link: a.link }))
  }
  catch (e) {
    analyzeError.value = e instanceof Error ? e.message : '分析失败'
  }
  finally {
    analyzing.value = false
  }
}

function applyTemplate(tmpl: typeof TEMPLATES[number]) {
  newDescription.value = tmpl.description
}

// ── 保存采集器 ──────────────────────────────────────
function handleSave() {
  if (!newUrl.value.trim() || !analyzedSelectors.value)
    return
  store.addCollector(
    newUrl.value.trim(),
    newTitle.value.trim() || new URL(newUrl.value).hostname,
    newCategory.value.trim() || '未分类',
    analyzedSelectors.value,
    newDescription.value.trim(),
  )
  // 重置表单
  newUrl.value = ''
  newTitle.value = ''
  newCategory.value = ''
  newDescription.value = ''
  analyzedSelectors.value = null
  previewArticles.value = []
}

// ── 手动编辑选择器 ──────────────────────────────────
function updateSelector(key: keyof CollectorSelectors, value: string) {
  if (analyzedSelectors.value) {
    analyzedSelectors.value = { ...analyzedSelectors.value, [key]: value }
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="flex h-[80vh] w-[700px] max-w-[95vw] flex-col rounded-xl border bg-background shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-2">
          <Settings2 class="h-4 w-4" />
          <span class="text-sm font-medium">采集管理</span>
        </div>
        <button class="text-muted-foreground hover:text-foreground" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- 添加采集源 -->
      <div class="border-b p-4 space-y-3">
        <div class="text-xs font-medium text-muted-foreground mb-2">
          添加采集源
        </div>

        <!-- URL + 标题 + 分类 -->
        <div class="flex gap-2">
          <Input v-model="newUrl" placeholder="网页地址 (https://...)" class="h-8 text-xs flex-1" />
          <Input v-model="newTitle" placeholder="标题（可选）" class="h-8 text-xs w-28" />
          <Input v-model="newCategory" placeholder="分类" class="h-8 text-xs w-20" />
        </div>

        <!-- 采集描述 -->
        <div class="flex gap-2">
          <div class="flex-1">
            <Textarea
              v-model="newDescription"
              placeholder="描述你想采集什么（AI 会根据描述自动生成采集规则）&#10;例：提取首页所有文章的标题、摘要和链接"
              class="min-h-[60px] text-xs resize-none"
              rows="2"
            />
          </div>
          <div class="flex flex-col gap-1">
            <Button
              size="sm"
              class="h-8 gap-1"
              :disabled="!newUrl.trim() || analyzing"
              @click="handleAnalyze"
            >
              <Loader2 v-if="analyzing" class="h-3.5 w-3.5 animate-spin" />
              <Bot v-else class="h-3.5 w-3.5" />
              {{ analyzing ? '分析中...' : 'AI 分析' }}
            </Button>
          </div>
        </div>

        <!-- 预置模板 -->
        <div class="flex gap-2">
          <span class="text-[10px] text-muted-foreground leading-6">快速模板：</span>
          <button
            v-for="tmpl in TEMPLATES"
            :key="tmpl.label"
            class="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 transition-colors"
            @click="applyTemplate(tmpl)"
          >
            {{ tmpl.label }}
          </button>
        </div>

        <!-- 分析结果 -->
        <div v-if="analyzeError" class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {{ analyzeError }}
        </div>

        <div v-if="analyzedSelectors" class="rounded-md border bg-muted/30 p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium">AI 生成的采集规则</span>
            <div class="flex gap-1">
              <Button variant="ghost" size="sm" class="h-6 text-xs" @click="showAdvanced = !showAdvanced">
                {{ showAdvanced ? '收起' : '编辑规则' }}
              </Button>
              <Button variant="ghost" size="sm" class="h-6 text-xs gap-1" @click="handleAnalyze">
                <Eye class="h-3 w-3" />
                重新预览
              </Button>
            </div>
          </div>

          <!-- 简化显示 -->
          <div v-if="!showAdvanced" class="text-[10px] text-muted-foreground space-y-0.5">
            <p>列表项：<code class="bg-muted px-1 rounded">{{ analyzedSelectors.item }}</code></p>
            <p>标题：<code class="bg-muted px-1 rounded">{{ analyzedSelectors.title }}</code></p>
            <p v-if="analyzedSelectors.link">
              链接：<code class="bg-muted px-1 rounded">{{ analyzedSelectors.link }}</code>
            </p>
          </div>

          <!-- 高级编辑 -->
          <div v-if="showAdvanced" class="space-y-1.5">
            <div v-for="key in (['item', 'title', 'link', 'content', 'summary', 'author', 'date'] as const)" :key="key" class="flex items-center gap-2">
              <span class="w-14 text-[10px] text-muted-foreground text-right">{{ key }}</span>
              <Input
                :model-value="analyzedSelectors[key]"
                class="h-6 text-[10px] flex-1 font-mono"
                @update:model-value="updateSelector(key, String($event))"
              />
            </div>
          </div>

          <!-- 预览结果 -->
          <div v-if="previewArticles.length" class="mt-2 space-y-1">
            <span class="text-[10px] text-muted-foreground">预览（前 {{ previewArticles.length }} 条）：</span>
            <div
              v-for="(a, i) in previewArticles"
              :key="i"
              class="rounded bg-background px-2 py-1 text-[10px]"
            >
              <span class="font-medium">{{ a.title || '(无标题)' }}</span>
              <span v-if="a.link" class="ml-2 text-muted-foreground truncate">{{ a.link }}</span>
            </div>
          </div>

          <!-- 保存按钮 -->
          <Button size="sm" class="h-7 gap-1 mt-2" @click="handleSave">
            <Plus class="h-3 w-3" />
            保存采集源
          </Button>
        </div>
      </div>

      <!-- 已有采集源列表 -->
      <div class="flex-1 overflow-y-auto">
        <div class="px-4 py-2 text-xs font-medium text-muted-foreground">
          已配置的采集源（{{ store.collectors.length }}）
        </div>
        <div
          v-for="src in store.collectors"
          :key="src.id"
          class="flex items-center gap-3 border-t px-4 py-2.5"
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">
              {{ src.title }}
            </div>
            <div class="text-[10px] text-muted-foreground truncate">
              {{ src.url }}
            </div>
            <div v-if="src.description" class="text-[10px] text-muted-foreground/60 truncate mt-0.5">
              {{ src.description }}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="flex items-center gap-1">
              <Timer class="h-3 w-3 text-muted-foreground" />
              <select
                :value="src.refreshInterval"
                class="rounded border bg-background px-1 py-0.5 text-[10px]"
                @change="store.updateCollectorInterval(src.id, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="opt in REFRESH_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {{ src.category }}
            </span>
            <button
              class="text-muted-foreground hover:text-destructive transition-colors"
              @click="store.removeCollector(src.id)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div
          v-if="!store.collectors.length"
          class="flex h-24 items-center justify-center text-xs text-muted-foreground/40"
        >
          暂无采集源，使用上方表单添加
        </div>
      </div>
    </div>
  </div>
</template>
