<script setup lang="ts">
import type { Article } from '@/stores/reading'
import { BookOpen, ExternalLink, Languages, Loader2, Sparkles, Star } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { buildAIHeaders, resolveEndpointUrl } from '@/composables/useAIFetch'
import { useAIConfigStore } from '@/stores/aiConfig'
import { useReadingStore } from '@/stores/reading'
import ArticleAnnotator from './ArticleAnnotator.vue'

const props = defineProps<{
  article: Article
}>()

const readingStore = useReadingStore()
const aiConfig = useAIConfigStore()

function formatDate(ts: number) {
  const diff = Date.now() - ts
  if (diff < 3600000)
    return '刚刚'
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000)
    return `${Math.floor(diff / 86400000)}天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 文章内容是否较短（可能是摘要），需要全文提取 */
const needsFullText = computed(() => {
  const content = props.article.content || props.article.summary || ''
  return content.replace(/<[^>]*>/g, '').trim().length < 800 && !!props.article.link
})

/** 双语对照：将 HTML 拆分成段落块 */
const fullTextContent = ref('')
const bilingualBlocks = computed(() => {
  const content = fullTextContent.value || props.article.content || props.article.summary || ''
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html')
  const container = doc.body.firstElementChild
  if (!container)
    return []
  return Array.from(container.children).map(el => ({
    html: el.outerHTML,
    text: el.textContent?.trim() || '',
  }))
})

// ── AI 摘要 + 翻译 ──────────────────────────────────────
const aiPanelTab = ref<'summary' | null>(null)
const aiLoading = ref(false)
const aiResult = ref('')
const aiError = ref('')
const translateTarget = ref<'zh' | 'en' | 'ja'>('en')
const fullTextLoading = ref(false)
const translating = ref(false)
const translatedParagraphs = ref<Record<number, string>>({})
const translationActive = ref(false)

async function callAIStream(
  systemPrompt: string,
  userContent: string,
  onDelta: (text: string) => void,
): Promise<string> {
  const endpoint = aiConfig.textEndpoint || aiConfig.endpoint
  const apiKey = aiConfig.textApiKey || aiConfig.apiKey
  const model = aiConfig.textModel || aiConfig.model
  const type = aiConfig.textType || aiConfig.type
  const url = resolveEndpointUrl(endpoint, 'chat')
  const headers = buildAIHeaders(apiKey, type)
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    stream: true,
  }
  const res = await window.fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  if (!res.ok)
    throw new Error(`AI 请求失败: ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader)
    throw new Error('无法读取流')
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim() || line.trim() === 'data: [DONE]')
        continue
      try {
        const delta = JSON.parse(line.replace(/^data: /, '')).choices?.[0]?.delta?.content
        if (delta) { full += delta; onDelta(delta) }
      }
      catch { /* skip */ }
    }
  }
  return full
}

async function handleSummarize() {
  aiPanelTab.value = 'summary'
  aiLoading.value = true
  aiError.value = ''
  aiResult.value = ''
  try {
    const content = fullTextContent.value || props.article.content || props.article.summary
    const text = content.replace(/<[^>]*>/g, '').slice(0, 4000)
    await callAIStream(
      '你是一个专业的文章摘要助手。请用简洁的中文总结文章的核心要点，使用 bullet points 格式。不超过 5 条。',
      `标题：${props.article.title}\n\n正文：${text}`,
      (delta) => { aiResult.value += delta },
    )
  }
  catch (e) { aiError.value = e instanceof Error ? e.message : '摘要失败' }
  finally { aiLoading.value = false }
}

async function handleTranslate() {
  if (translating.value) {
    translating.value = false
    translationActive.value = false
    translatedParagraphs.value = {}
    return
  }
  translating.value = true
  translationActive.value = true
  translatedParagraphs.value = {}
  const blocks = bilingualBlocks.value
  const langName = translateTarget.value === 'zh' ? '中文' : translateTarget.value === 'en' ? 'English' : '日本語'
  try {
    for (let i = 0; i < blocks.length && translating.value; i++) {
      const text = blocks[i].text
      if (!text || text.length < 5)
        continue
      translatedParagraphs.value[i] = ''
      await callAIStream(
        `翻译成${langName}，只输出翻译结果，不要解释。`,
        text,
        (delta) => { translatedParagraphs.value[i] = (translatedParagraphs.value[i] || '') + delta },
      )
    }
  }
  catch (e) { console.warn('翻译失败:', e) }
  finally { translating.value = false }
}

async function handleFetchFullText() {
  if (!props.article.link || fullTextLoading.value)
    return
  fullTextLoading.value = true
  try { fullTextContent.value = await readingStore.fetchFullText(props.article.link) }
  catch (e) { console.warn('全文提取失败:', e) }
  finally { fullTextLoading.value = false }
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
          <!-- AI 功能按钮 -->
          <div class="flex items-center gap-0.5 mr-2">
            <Button variant="outline" size="sm" class="h-7 gap-1 text-xs" :disabled="aiLoading" @click="handleSummarize">
              <Sparkles class="h-3 w-3" />
              摘要
            </Button>

            <!-- 翻译按钮 + 语言选择 -->
            <div class="flex items-center">
              <Button
                variant="outline"
                size="sm"
                class="h-7 gap-1 text-xs rounded-r-none border-r-0"
                :class="translationActive ? 'bg-primary/10 border-primary/30' : ''"
                :disabled="translating"
                @click="handleTranslate"
              >
                <Languages class="h-3 w-3" />
                {{ translating ? '翻译中...' : translationActive ? '取消翻译' : '翻译' }}
              </Button>
              <select
                v-model="translateTarget"
                class="h-7 rounded-l-none border bg-background px-1.5 text-[10px]"
                :disabled="translating"
              >
                <option value="en">
                  EN
                </option>
                <option value="zh">
                  中文
                </option>
                <option value="ja">
                  日本語
                </option>
              </select>
            </div>

            <Button v-if="needsFullText" variant="outline" size="sm" class="h-7 gap-1 text-xs" :disabled="fullTextLoading" @click="handleFetchFullText">
              <BookOpen class="h-3 w-3" />
              {{ fullTextLoading ? '提取中...' : '全文' }}
            </Button>
          </div>

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

    <!-- AI 面板（摘要 / 对话） -->
    <!-- AI 摘要面板 -->
    <div v-if="aiPanelTab === 'summary'" class="border-b">
      <div class="px-8 py-2.5">
        <div class="flex items-center gap-2 mb-1.5">
          <Sparkles class="h-3.5 w-3.5 text-primary" />
          <span class="text-xs font-medium">AI 摘要</span>
          <button class="ml-auto text-[10px] text-muted-foreground hover:text-foreground" @click="aiPanelTab = null">
            关闭
          </button>
        </div>
        <div v-if="aiLoading" class="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          AI 分析中...
        </div>
        <div v-else-if="aiError" class="text-xs text-destructive">
          {{ aiError }}
        </div>
        <div v-else-if="aiResult" class="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {{ aiResult }}
        </div>
      </div>
    </div>

    <!-- 文章内容（批注模式 / 翻译模式） -->
    <div v-if="translationActive" class="flex flex-1 overflow-hidden">
      <!-- 翻译模式：双语对照 -->
      <div class="article-content flex-1 overflow-y-auto px-8 py-6">
        <div
          v-for="(block, i) in bilingualBlocks"
          :key="i"
        >
          <div v-html="block.html" />
          <div
            v-if="translatedParagraphs[i] !== undefined"
            class="my-1 rounded bg-primary/5 px-3 py-1.5 text-xs text-primary/80 italic border-l-2 border-primary/20"
          >
            {{ translatedParagraphs[i] || '...' }}
          </div>
        </div>
      </div>
    </div>

    <!-- 普通模式：批注系统 -->
    <ArticleAnnotator
      v-else
      :article="article"
      :content="fullTextContent || article.content || article.summary"
    />
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
