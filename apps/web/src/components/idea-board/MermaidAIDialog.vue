<script setup lang="ts">
import { Clock, RotateCcw, Settings, Sparkles, Trash2, Wand2, X } from '@lucide/vue'
import mermaid from 'mermaid'
import { nextTick, onMounted, ref, watch } from 'vue'
import AIConfig from '@/components/ai/chat-box/AIConfig.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { buildAIHeaders, resolveEndpointUrl, useAIFetch } from '@/composables/useAIFetch'
import useAIConfigStore from '@/stores/aiConfig'

const emit = defineEmits<{
  close: []
  insert: [mermaidCode: string]
}>()

const aiConfig = useAIConfigStore()
const { loading, fetchSSE, abort } = useAIFetch()

const prompt = ref('')
const mermaidCode = ref('')
const error = ref('')
const step = ref<'idle' | 'optimizing' | 'generating' | 'done'>('idle')

// ── 历史记录 ─────────────────────────────────────────────
interface HistoryItem {
  id: string
  prompt: string
  mermaidCode: string
  createdAt: number
}

const HISTORY_KEY = 'mermaid-idea-history'
const history = ref<HistoryItem[]>([])
const showHistory = ref(false)

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw)
      history.value = JSON.parse(raw)
  }
  catch { /* ignore */ }
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
}

function addToHistory(promptText: string, code: string) {
  const item: HistoryItem = {
    id: Date.now().toString(),
    prompt: promptText,
    mermaidCode: code,
    createdAt: Date.now(),
  }
  history.value.unshift(item)
  // 最多保留 50 条
  if (history.value.length > 50)
    history.value = history.value.slice(0, 50)
  saveHistory(history.value)
}

function deleteHistory(id: string) {
  history.value = history.value.filter(h => h.id !== id)
  saveHistory(history.value)
}

function insertHistoryPrompt(item: HistoryItem) {
  prompt.value = item.prompt
  showHistory.value = false
}

function insertHistoryCode(item: HistoryItem) {
  emit('insert', item.mermaidCode)
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

onMounted(() => loadHistory())

// Mermaid 预览
const previewRef = ref<HTMLDivElement | null>(null)
const previewError = ref('')
let renderId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
})

async function renderPreview(code: string) {
  if (!code.trim() || !previewRef.value) {
    if (previewRef.value)
      previewRef.value.innerHTML = ''
    previewError.value = ''
    return
  }
  const currentId = ++renderId
  try {
    const id = `mermaid-preview-${currentId}`
    const { svg } = await mermaid.render(id, code.trim())
    if (currentId !== renderId)
      return
    if (previewRef.value) {
      previewRef.value.innerHTML = svg
      previewError.value = ''
    }
  }
  catch {
    // 只有最终渲染失败才显示错误，流式过程中的失败静默忽略
    if (currentId === renderId && step.value !== 'generating')
      previewError.value = '语法错误或图表不完整'
  }
}

watch(mermaidCode, (code) => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
  if (!code.trim()) {
    previewError.value = ''
    if (previewRef.value)
      previewRef.value.innerHTML = ''
    return
  }
  // 生成完成后才渲染，避免流式过程中的无效渲染
  if (step.value === 'done') {
    nextTick(() => renderPreview(code))
  }
  else {
    // 流式过程中 debounce 500ms，减少无效渲染
    debounceTimer = setTimeout(renderPreview, 500, code)
  }
})

const PLACEHOLDER = `例如：
- 画一个用户登录注册流程图
- 画一个电商订单状态流转图
- 画一个系统架构图，包含前端、后端、数据库`

const OPTIMIZE_SYSTEM_PROMPT = `整理用户粗糙的想法为清晰的图表描述。去掉口语和重复，补充逻辑关系。只输出整理后的描述，不要输出代码。`

const MERMAID_SYSTEM_PROMPT = `将用户描述转换为 Mermaid 流程图代码。只输出代码，不要解释。
- 节点 ID 用英文(A,B,C)，中文放方括号: A["登录"]
- 判断用菱形: C{"是否成功"}
- 边标签: A -->|是| B
- 用 flowchart TD
- 保持简洁：最多 8 个节点，避免复杂分支
- 每个节点文字不超过 6 个字
- 线性流程优先，减少交叉连线`

async function callAI(systemPrompt: string, userContent: string, onDelta: (s: string) => void): Promise<void> {
  const url = resolveEndpointUrl(aiConfig.textEndpoint || aiConfig.endpoint, 'chat')
  const headers = buildAIHeaders(aiConfig.textApiKey || aiConfig.apiKey, aiConfig.textType || aiConfig.type)

  const payload: Record<string, unknown> = {
    model: aiConfig.textModel,
    temperature: 0.3,
    max_tokens: 2000,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  }

  await fetchSSE(url, headers, payload, { onDelta, onDone() {} })
}

async function optimize() {
  if (!prompt.value.trim())
    return

  if (!aiConfig.textModel) {
    error.value = '请先在设置中配置 AI 文本模型'
    return
  }

  error.value = ''
  mermaidCode.value = ''
  step.value = 'optimizing'
  let result = ''

  try {
    await callAI(OPTIMIZE_SYSTEM_PROMPT, prompt.value.trim(), (delta) => {
      result += delta
    })
    prompt.value = result.trim()
    step.value = 'idle'
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '优化失败'
    step.value = 'idle'
  }
}

async function generate() {
  if (!prompt.value.trim())
    return

  if (!aiConfig.textModel) {
    error.value = '请先在设置中配置 AI 文本模型'
    return
  }

  error.value = ''
  mermaidCode.value = ''
  step.value = 'generating'

  try {
    await callAI(MERMAID_SYSTEM_PROMPT, prompt.value.trim(), (delta) => {
      mermaidCode.value += delta
    })
    mermaidCode.value = mermaidCode.value
      .replace(/^```mermaid\s*/i, '')
      .replace(/\n?```\s*$/, '')
      .trim()
    step.value = 'done'
    addToHistory(prompt.value.trim(), mermaidCode.value)
    // 生成完成后立即渲染最终结果
    await nextTick()
    await renderPreview(mermaidCode.value)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '生成失败'
    step.value = 'idle'
  }
}

function handleInsert() {
  if (!mermaidCode.value.trim())
    return
  emit('insert', mermaidCode.value.trim())
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="flex h-[75vh] w-[900px] max-w-[95vw] flex-col rounded-xl border bg-background shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-2">
          <Wand2 class="h-4 w-4 text-purple-500" />
          <h2 class="text-base font-semibold">
            生成想法
          </h2>
        </div>
        <div class="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs">
                <Settings class="h-3.5 w-3.5" />
                AI 配置
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-[420px] max-h-[70vh] overflow-y-auto" align="end">
              <AIConfig />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs" :class="{ 'text-purple-500': showHistory }" @click="showHistory = !showHistory">
            <Clock class="h-3.5 w-3.5" />
            历史记录
          </Button>
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('close')">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- 两栏主体 -->
      <div class="flex flex-1 overflow-hidden">
        <!-- 左栏：输入 -->
        <div class="flex w-1/2 flex-col border-r">
          <div class="flex h-10 items-center border-b px-4 text-xs font-medium text-muted-foreground">
            描述你的想法
          </div>
          <div class="flex flex-1 flex-col p-4">
            <Textarea
              v-model="prompt"
              :placeholder="PLACEHOLDER"
              class="flex-1 resize-none text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
              @keydown.ctrl.enter="generate"
              @keydown.meta.enter="generate"
            />
            <div class="mt-3 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">
                Ctrl+Enter 生成
              </span>
              <div class="flex gap-2">
                <Button
                  v-if="loading"
                  variant="outline"
                  size="sm"
                  @click="abort"
                >
                  停止
                </Button>
                <template v-else>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    :disabled="!prompt.trim() || !aiConfig.textModel"
                    @click="optimize"
                  >
                    <Wand2 class="h-3.5 w-3.5" />
                    优化想法
                  </Button>
                  <Button
                    size="sm"
                    class="gap-1.5"
                    :disabled="!prompt.trim() || !aiConfig.textModel"
                    @click="generate"
                  >
                    <Sparkles class="h-3.5 w-3.5" />
                    生成
                  </Button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 右栏：结果 / 历史 -->
        <div class="flex w-1/2 flex-col">
          <template v-if="showHistory">
            <div class="flex h-10 items-center justify-between border-b px-4">
              <span class="text-xs font-medium text-muted-foreground">
                历史记录 ({{ history.length }})
              </span>
              <Button variant="ghost" size="sm" class="h-6 text-xs" @click="showHistory = false">
                返回预览
              </Button>
            </div>
            <div class="flex-1 overflow-y-auto">
              <div v-if="!history.length" class="flex h-full items-center justify-center text-xs text-muted-foreground/50">
                暂无历史记录
              </div>
              <div
                v-for="item in history"
                :key="item.id"
                class="group border-b px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="flex-1 truncate text-xs font-medium">
                    {{ item.prompt.slice(0, 60) }}{{ item.prompt.length > 60 ? '...' : '' }}
                  </p>
                  <span class="shrink-0 text-[10px] text-muted-foreground">
                    {{ formatTime(item.createdAt) }}
                  </span>
                </div>
                <p class="mt-1 truncate text-[10px] text-muted-foreground/70 font-mono">
                  {{ item.mermaidCode.slice(0, 80) }}...
                </p>
                <div class="mt-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" size="sm" class="h-6 gap-1 text-xs" @click="insertHistoryPrompt(item)">
                    <RotateCcw class="h-3 w-3" />
                    恢复提示词
                  </Button>
                  <Button variant="outline" size="sm" class="h-6 gap-1 text-xs" @click="insertHistoryCode(item)">
                    <Sparkles class="h-3 w-3" />
                    插入画布
                  </Button>
                  <Button variant="ghost" size="sm" class="h-6 text-xs text-destructive hover:text-destructive" @click="deleteHistory(item.id)">
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="flex h-10 items-center justify-between border-b px-4">
              <span class="text-xs font-medium text-muted-foreground">
                预览
              </span>
              <Button
                v-if="mermaidCode"
                variant="outline"
                size="sm"
                class="gap-1.5"
                @click="handleInsert"
              >
                插入画布
              </Button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
              <div v-if="error" class="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-600 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
                {{ error }}
              </div>
              <div v-else-if="mermaidCode">
                <div
                  v-if="previewError"
                  class="mb-2 rounded-md bg-yellow-50 border border-yellow-200 p-2 text-xs text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-400"
                >
                  {{ previewError }}
                </div>
                <div ref="previewRef" class="flex justify-center overflow-auto rounded-md bg-white p-4 dark:bg-gray-900" />
                <details open class="mt-3">
                  <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    查看 Mermaid 源码
                  </summary>
                  <pre class="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-relaxed">{{ mermaidCode }}</pre>
                </details>
              </div>
              <div v-else-if="step === 'generating'" class="flex items-center gap-2 text-xs text-muted-foreground">
                <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                AI 正在生成图表...
              </div>
              <div v-else-if="step === 'optimizing'" class="flex items-center gap-2 text-xs text-muted-foreground">
                <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                AI 正在优化你的想法...
              </div>
              <div v-else class="flex h-full items-center justify-center text-xs text-muted-foreground/50">
                在左侧描述你的想法，AI 会生成对应的 Mermaid 流程图
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.mermaid-svg) svg {
  max-width: 100%;
  height: auto;
}
</style>
