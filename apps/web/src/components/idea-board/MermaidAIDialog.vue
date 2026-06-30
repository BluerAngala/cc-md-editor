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
  insertJson: [json: string]
}>()

const aiConfig = useAIConfigStore()
const { loading, fetchSSE, abort } = useAIFetch()

const prompt = ref('')
const mermaidCode = ref('')
const error = ref('')
const step = ref<'idle' | 'optimizing' | 'generating' | 'done'>('idle')
const renderMode = ref<'mermaid' | 'json'>('mermaid')

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

// ── 法律专用模板 ─────────────────────────────────────────
const LEGAL_TEMPLATES = [
  { label: '诉讼流程图', prompt: '画一个民事诉讼一审流程图，从立案、送达、举证、开庭、判决到执行' },
  { label: '法律关系图', prompt: '分析以下主体之间的法律关系：' },
  { label: '案件时间轴', prompt: '用时间轴展示以下案件事件：' },
  { label: '合同审查流程', prompt: '画一个合同审查流程图，包含主体审查、条款审查、违约责任、争议解决等节点' },
  { label: '利害关系人', prompt: '画一个公司股权纠纷中各方当事人关系图，包含原告、被告、第三人' },
  { label: '仲裁流程图', prompt: '画一个商事仲裁流程图，从申请仲裁到裁决执行' },
]

function applyTemplate(tmpl: typeof LEGAL_TEMPLATES[number]) {
  prompt.value = tmpl.prompt
}

const OPTIMIZE_SYSTEM_PROMPT = `你是一个图表规划师。将用户的想法整理为结构化的图表大纲。

输出格式：
1. 图表类型：flowchart / sequenceDiagram / ...
2. 核心节点：列出关键节点，每个节点用 2-6 个字概括
3. 连接关系：用 "A --> B" 或 "A -->|条件| B" 描述
4. 总节点数控制在 6-10 个

不要输出 Mermaid 代码，只输出结构化大纲。`

const MERMAID_SYSTEM_PROMPT = `将以下结构化大纲转换为 Mermaid 流程图代码。只输出代码。
- 节点 ID 用英文(A,B,C)，中文放方括号: A["登录"]
- 判断用菱形: C{"是否成功"}
- 边标签: A -->|是| B
- 用 flowchart TD
- 严格按大纲的节点和连接，不要增删`

const JSON_SYSTEM_PROMPT = `将用户描述转换为 Excalidraw 元素 JSON 数组。只输出 JSON 数组，不要解释。

支持的 type：
1. 矩形/便签：{ "type": "rectangle", "id": "a", "x": 100, "y": 100, "width": 180, "height": 60, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "内容" } }
2. 菱形：{ "type": "diamond", "id": "c", "x": 100, "y": 200, "width": 160, "height": 80, "strokeColor": "#1e1e1e", "backgroundColor": "#ffec99", "fillStyle": "solid", "label": { "text": "判断" } }
3. 箭头：{ "type": "arrow", "id": "e1", "x": 190, "y": 160, "width": 0, "height": 40, "points": [[0,0],[0,40]], "startBinding": { "elementId": "a", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "b", "focus": 0, "gap": 1 } }

规则：
- 垂直布局间距 y+100，水平间距 x+220
- 背景色用浅色：#a5d8ff(蓝) #b2f2bb(绿) #ffec99(黄) #ffc9c9(红) #d0bfff(紫)
- roundness: { "type": 3 } 圆角
- 箭头 points 是相对偏移，宽高为 0`

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

  const systemPrompt = renderMode.value === 'json' ? JSON_SYSTEM_PROMPT : MERMAID_SYSTEM_PROMPT

  try {
    await callAI(systemPrompt, prompt.value.trim(), (delta) => {
      mermaidCode.value += delta
    })
    mermaidCode.value = mermaidCode.value
      .replace(/^```(?:json|mermaid)?\s*/i, '')
      .replace(/\n?```\s*$/, '')
      .trim()
    step.value = 'done'
    addToHistory(prompt.value.trim(), mermaidCode.value)
    // 生成完成后立即渲染最终结果
    await nextTick()
    if (renderMode.value === 'mermaid')
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
  if (renderMode.value === 'json')
    emit('insertJson', mermaidCode.value.trim())
  else
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
          <!-- 模式切换 -->
          <div class="flex rounded-md border overflow-hidden">
            <button
              class="px-2 py-0.5 text-[10px] transition-colors"
              :class="renderMode === 'mermaid' ? 'bg-purple-500 text-white' : 'text-muted-foreground hover:bg-muted'"
              @click="renderMode = 'mermaid'"
            >
              Mermaid
            </button>
            <button
              class="px-2 py-0.5 text-[10px] transition-colors"
              :class="renderMode === 'json' ? 'bg-purple-500 text-white' : 'text-muted-foreground hover:bg-muted'"
              @click="renderMode = 'json'"
            >
              JSON
            </button>
          </div>
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
          <!-- 法律模板标签 -->
          <div class="flex flex-wrap gap-1.5 border-b px-4 py-2">
            <button
              v-for="tmpl in LEGAL_TEMPLATES"
              :key="tmpl.label"
              class="rounded-full border px-2.5 py-0.5 text-[10px] transition-colors hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 dark:hover:bg-purple-950 dark:hover:border-purple-700 dark:hover:text-purple-300"
              @click="applyTemplate(tmpl)"
            >
              {{ tmpl.label }}
            </button>
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
                <!-- Mermaid 模式：SVG 预览 -->
                <template v-if="renderMode === 'mermaid'">
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
                </template>
                <!-- JSON 模式：直接显示 JSON -->
                <template v-else>
                  <p class="mb-2 text-xs text-muted-foreground">
                    AI 生成的 Excalidraw 元素 JSON（点击"插入画布"渲染）
                  </p>
                  <pre class="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-relaxed max-h-[60vh] overflow-auto">{{ mermaidCode }}</pre>
                </template>
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
