<script setup lang="ts">
import { Clock, RotateCcw, Settings, Sparkles, Trash2, Wand2, X } from '@lucide/vue'
import mermaid from 'mermaid'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AIConfig from '@/components/ai/chat-box/AIConfig.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
const flowDirection = ref<'TD' | 'LR'>('TD')

// ── 图表类型 ─────────────────────────────────────────────
interface DiagramType {
  id: string
  label: string
  icon: string
  hasDirection?: boolean
}

const DIAGRAM_TYPES: DiagramType[] = [
  { id: 'flowchart', label: '流程图', icon: '◇', hasDirection: true },
  { id: 'sequence', label: '时序图', icon: '⏵' },
  { id: 'class', label: '类图', icon: '☐' },
  { id: 'state', label: '状态图', icon: '◎', hasDirection: true },
  { id: 'er', label: 'ER 图', icon: '⊞' },
  { id: 'gantt', label: '甘特图', icon: '▦' },
  { id: 'pie', label: '饼图', icon: '◕' },
]
const selectedDiagram = ref<string>('flowchart')

// ── JSON 预览解析 ─────────────────────────────────────────
interface JsonPreviewNode {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  label: string
  backgroundColor: string
}
interface JsonPreviewEdge {
  id: string
  fromId: string
  toId: string
  label: string
}

const jsonPreview = computed(() => {
  if (renderMode.value !== 'json' || !mermaidCode.value.trim() || step.value !== 'done')
    return null
  try {
    const arr = JSON.parse(mermaidCode.value)
    if (!Array.isArray(arr))
      return null
    const nodes: JsonPreviewNode[] = []
    const edges: JsonPreviewEdge[] = []
    for (const el of arr) {
      if (el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') {
        nodes.push({
          id: el.id,
          type: el.type,
          x: el.x || 0,
          y: el.y || 0,
          width: el.width || 160,
          height: el.height || 50,
          label: el.label?.text || '',
          backgroundColor: el.backgroundColor || '#a5d8ff',
        })
      }
      else if (el.type === 'arrow' || el.type === 'line') {
        const fromId = el.startBinding?.elementId || ''
        const toId = el.endBinding?.elementId || ''
        edges.push({
          id: el.id,
          fromId,
          toId,
          label: el.label?.text || '',
        })
      }
    }
    if (!nodes.length)
      return null
    // 计算边界
    const minX = Math.min(...nodes.map(n => n.x)) - 20
    const minY = Math.min(...nodes.map(n => n.y)) - 20
    const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 20
    const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 20
    return { nodes, edges, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  }
  catch {
    return null
  }
})

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
1. 图表类型：flowchart / sequenceDiagram / classDiagram / stateDiagram / erDiagram / gantt / pie
2. 核心元素：列出关键节点/参与者/类/状态，每个用 2-6 个字概括
3. 连接关系：用 "A --> B" 或 "A -->|条件| B" 描述
4. 总元素数控制在 6-10 个

不要输出 Mermaid 代码，只输出结构化大纲。`

// ── 按图表类型生成 Mermaid system prompt ──────────────────
function buildMermaidPrompt(diagramId: string, direction: string): string {
  const base = '将用户描述转换为 Mermaid 图表代码。只输出代码，不要解释。'
  const typePrompts: Record<string, string> = {
    flowchart: `图表类型: flowchart ${direction}
- 节点 ID 用英文(A,B,C)，中文标签放方括号: A["立案"]
- 判断节点用菱形: C{"是否成功"}
- 边标签: A -->|是| B
- 合理使用子图(subgraph)分组`,

    sequence: `图表类型: sequenceDiagram
- 参与者用中文: participant 原告 as 原告
- 消息用中文: 原告->>法院: 提交起诉状
- 支持 note、alt、loop 等控制块
- 合理使用 autonumber`,

    class: `图表类型: classDiagram
- 类名用中文: class 原告 {\n  +姓名 string\n  +起诉()\n}
- 关系: 原告 --> 被告 : 起诉
- 支持继承、实现、聚合、组合关系`,

    state: `图表类型: stateDiagram-v2 ${direction}
- 状态用中文: [*] --> 立案
- 转换条件: 立案 --> 送达 : 审查通过
- 支持并发状态和历史状态`,

    er: `图表类型: erDiagram
- 实体用英文大写: CASE {
  string 案号
  date 立案日期\n}
- 关系: CASE ||--o{ PARTY : 涉及
- 支持一对一、一对多、多对多`,

    gantt: `图表类型: gantt
- 标题用中文: title 案件进度
- 用 section 分阶段: section 立案阶段
- 任务: 提交起诉状 :a1, 2024-01-01, 7d
- 支持 done、active、crit 标记`,

    pie: `图表类型: pie
- 标题用中文: title 案件类型分布
- 数据: "民事" : 60\n"刑事" : 25
- 数值为合理比例`,
  }
  return `${base}
${typePrompts[diagramId] || typePrompts.flowchart}`
}

const JSON_SYSTEM_PROMPT_BASE = `将用户描述转换为 Excalidraw 元素 JSON 数组。只输出 JSON 数组，不要解释。

支持的 type：
1. 矩形/便签：{ "type": "rectangle", "id": "a", "x": 100, "y": 100, "width": 180, "height": 60, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "内容" } }
2. 菱形：{ "type": "diamond", "id": "c", "x": 100, "y": 200, "width": 160, "height": 80, "strokeColor": "#1e1e1e", "backgroundColor": "#ffec99", "fillStyle": "solid", "label": { "text": "判断" } }
3. 箭头：{ "type": "arrow", "id": "e1", "x": 190, "y": 160, "width": 0, "height": 40, "points": [[0,0],[0,40]], "startBinding": { "elementId": "a", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "b", "focus": 0, "gap": 1 } }

规则：
- 背景色用浅色：#a5d8ff(蓝) #b2f2bb(绿) #ffec99(黄) #ffc9c9(红) #d0bfff(紫)
- roundness: { "type": 3 } 圆角
- 箭头 points 是相对偏移，宽高为 0`

function buildJsonPrompt(direction: string): string {
  const layout = direction === 'LR'
    ? '水平布局，节点间距 x+220，箭头 points 用 [[0,0],[220,0]]'
    : '垂直布局，节点间距 y+100，箭头 points 用 [[0,0],[0,100]]'
  return `${JSON_SYSTEM_PROMPT_BASE}
- ${layout}`
}

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

  const systemPrompt = renderMode.value === 'json' ? buildJsonPrompt(flowDirection.value) : buildMermaidPrompt(selectedDiagram.value, flowDirection.value)

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
        <div class="flex items-center gap-3">
          <!-- 图表类型下拉 -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-muted-foreground">类型</span>
            <Select v-model="selectedDiagram">
              <SelectTrigger class="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="dt in DIAGRAM_TYPES" :key="dt.id" :value="dt.id" class="text-xs">
                  {{ dt.icon }} {{ dt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 方向（仅流程图/状态图） -->
          <template v-if="DIAGRAM_TYPES.find(d => d.id === selectedDiagram)?.hasDirection">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-muted-foreground">方向</span>
              <div class="flex rounded-md border overflow-hidden">
                <button
                  class="px-2 py-0.5 text-[10px] transition-colors"
                  :class="flowDirection === 'TD' ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:bg-muted'"
                  @click="flowDirection = 'TD'"
                >
                  ↓ 竖向
                </button>
                <button
                  class="px-2 py-0.5 text-[10px] transition-colors"
                  :class="flowDirection === 'LR' ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:bg-muted'"
                  @click="flowDirection = 'LR'"
                >
                  → 横向
                </button>
              </div>
            </div>
          </template>

          <div class="h-4 w-px bg-border" />

          <!-- 渲染模式 -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-muted-foreground">渲染</span>
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
                JSON <span class="opacity-50">测试</span>
              </button>
            </div>
          </div>

          <div class="flex-1" />

          <!-- 设置 -->
          <div class="flex items-center gap-1">
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
                <!-- JSON 模式：可视化预览 + 源码 -->
                <template v-else>
                  <div v-if="jsonPreview" class="mb-3 overflow-auto rounded-md bg-white p-4 dark:bg-gray-900">
                    <svg
                      :viewBox="`${jsonPreview.minX} ${jsonPreview.minY} ${jsonPreview.width} ${jsonPreview.height}`"
                      width="100%"
                      :style="{ maxHeight: '50vh' }"
                      class="mx-auto"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <!-- 箭头连线 -->
                      <line
                        v-for="edge in jsonPreview.edges"
                        :key="edge.id"
                        :x1="jsonPreview.nodes.find(n => n.id === edge.fromId)?.x ?? 0 + (jsonPreview.nodes.find(n => n.id === edge.fromId)?.width ?? 0) / 2"
                        :y1="(jsonPreview.nodes.find(n => n.id === edge.fromId)?.y ?? 0) + (jsonPreview.nodes.find(n => n.id === edge.fromId)?.height ?? 0)"
                        :x2="jsonPreview.nodes.find(n => n.id === edge.toId)?.x ?? 0 + (jsonPreview.nodes.find(n => n.id === edge.toId)?.width ?? 0) / 2"
                        :y2="jsonPreview.nodes.find(n => n.id === edge.toId)?.y ?? 0"
                        stroke="#868e96"
                        stroke-width="1.5"
                        marker-end="url(#arrow)"
                      />
                      <!-- 箭头标记 -->
                      <defs>
                        <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <polygon points="0 0, 8 3, 0 6" fill="#868e96" />
                        </marker>
                      </defs>
                      <!-- 节点 -->
                      <g v-for="node in jsonPreview.nodes" :key="node.id">
                        <rect
                          v-if="node.type === 'rectangle'"
                          :x="node.x"
                          :y="node.y"
                          :width="node.width"
                          :height="node.height"
                          :fill="node.backgroundColor"
                          stroke="#1e1e1e"
                          stroke-width="1"
                          rx="6"
                        />
                        <polygon
                          v-else-if="node.type === 'diamond'"
                          :points="`${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`"
                          :fill="node.backgroundColor"
                          stroke="#1e1e1e"
                          stroke-width="1"
                        />
                        <text
                          :x="node.x + node.width / 2"
                          :y="node.y + node.height / 2"
                          text-anchor="middle"
                          dominant-baseline="central"
                          fill="#1e1e1e"
                          font-size="13"
                        >
                          {{ node.label }}
                        </text>
                      </g>
                    </svg>
                  </div>
                  <details open class="mt-1">
                    <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      查看 JSON 源码
                    </summary>
                    <pre class="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-relaxed max-h-[30vh] overflow-auto">{{ mermaidCode }}</pre>
                  </details>
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
