<script setup lang="ts">
import { LayoutGrid, Lightbulb, Plus, Search, Sparkles, Trash2 } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SyncButton from '@/components/shared/SyncButton.vue'
import ViewNav from '@/components/shared/ViewNav.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import AIDraftDialog from './AIDraftDialog.vue'
import ExcalidrawWrapper from './ExcalidrawWrapper.vue'
import MermaidAIDialog from './MermaidAIDialog.vue'

const STORAGE_KEY = 'idea-board-scenes'

interface Scene {
  id: string
  title: string
  desc: string
  color: number
  group: string
  x: number
  y: number
  w: number
  h: number
  elements: any[]
  createdAt: number
  updatedAt: number
}

const COLORS = [
  { bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-400', ring: 'ring-amber-400', label: '黄' },
  { bg: 'bg-sky-50 dark:bg-sky-950', border: 'border-sky-200 dark:border-sky-800', dot: 'bg-sky-400', ring: 'ring-sky-400', label: '蓝' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-400', ring: 'ring-emerald-400', label: '绿' },
  { bg: 'bg-pink-50 dark:bg-pink-950', border: 'border-pink-200 dark:border-pink-800', dot: 'bg-pink-400', ring: 'ring-pink-400', label: '粉' },
  { bg: 'bg-violet-50 dark:bg-violet-950', border: 'border-violet-200 dark:border-violet-800', dot: 'bg-violet-400', ring: 'ring-violet-400', label: '紫' },
  { bg: 'bg-orange-50 dark:bg-orange-950', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-400', ring: 'ring-orange-400', label: '橙' },
]

const DEFAULTS = { title: '新想法', desc: '', color: 0, group: '', x: 20, y: 20, w: 200, h: 120, elements: [] }

function normalizeScene(raw: Record<string, unknown>): Scene {
  return { ...DEFAULTS, ...raw, createdAt: raw.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now() }
}

function loadScenes(): Scene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw)
      return JSON.parse(raw).map(normalizeScene)
  }
  catch {
    // ignore
  }
  return []
}

function saveScenes(scenes: Scene[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes))
  window.dispatchEvent(new CustomEvent('md:data-changed', { detail: { scope: 'ideaBoard' } }))
}

const scenes = ref<Scene[]>(loadScenes())
const activeSceneId = ref<string | null>(scenes.value[0]?.id ?? null)
const activeScene = computed(() => scenes.value.find(s => s.id === activeSceneId.value))

const boardRef = ref<HTMLDivElement | null>(null)
const excalidrawRef = ref<InstanceType<typeof ExcalidrawWrapper> | null>(null)
const editingId = ref<string | null>(null)
const editingField = ref<'title' | 'desc' | null>(null)
const activeGroup = ref<string | null>(null)
const searchQuery = ref('')

// AI 初稿对话框
const showAIDialog = ref(false)
const aiScreenshotFile = ref<File | null>(null)
const aiError = ref('')

// Mermaid AI 对话框
const showMermaidDialog = ref(false)

/** 右键菜单触发：截图 → 打开 AI 对话框 */
async function openAIDraft() {
  aiError.value = ''
  if (!excalidrawRef.value) {
    aiError.value = '画布未就绪'
    setTimeout(() => { aiError.value = '' }, 3000)
    return
  }
  try {
    const file = await excalidrawRef.value.exportToFile()
    if (!file) {
      aiError.value = '画布为空，请先添加内容'
      setTimeout(() => { aiError.value = '' }, 3000)
      return
    }
    aiScreenshotFile.value = file
    showAIDialog.value = true
  }
  catch (e) {
    aiError.value = e instanceof Error ? e.message : '截图失败'
    setTimeout(() => { aiError.value = '' }, 3000)
  }
}

/** 打开 Mermaid AI 对话框 */
function openMermaidDialog() {
  showMermaidDialog.value = true
}

/** 将 AI 生成的 Mermaid 代码插入画布 */
async function handleMermaidInsert(mermaidCode: string) {
  if (!excalidrawRef.value)
    return
  const ok = await excalidrawRef.value.addMermaidElements(mermaidCode)
  if (ok)
    showMermaidDialog.value = false
}

/** 将 AI 生成的 JSON 元素插入画布 */
async function handleJsonInsert(json: string) {
  if (!excalidrawRef.value)
    return
  const ok = await excalidrawRef.value.addJsonElements(json)
  if (ok)
    showMermaidDialog.value = false
}

function highlightText(text: string, query: string): string {
  if (!query.trim())
    return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>')
}

// 拖拽状态
const dragState = ref<{ id: string, startX: number, startY: number, noteX: number, noteY: number } | null>(null)
// 缩放状态
const resizeState = ref<{ id: string, startX: number, startY: number, startW: number, startH: number } | null>(null)

const groups = computed(() => {
  const g = new Set(scenes.value.map(s => s.group).filter(Boolean))
  return Array.from(g).sort()
})

const filteredScenes = computed(() => {
  let result = scenes.value
  if (activeGroup.value)
    result = result.filter(s => s.group === activeGroup.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(s => s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q))
  }
  return result
})

function createScene() {
  const now = Date.now()
  const offsetX = (scenes.value.length % 5) * 20
  const offsetY = (scenes.value.length % 5) * 20
  const scene: Scene = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    title: `想法 ${scenes.value.length + 1}`,
    desc: '',
    color: scenes.value.length % COLORS.length,
    group: '',
    x: 20 + offsetX,
    y: 20 + offsetY,
    w: 200,
    h: 120,
    elements: [],
    createdAt: now,
    updatedAt: now,
  }
  scenes.value.push(scene)
  activeSceneId.value = scene.id
  saveScenes(scenes.value)
}

function deleteScene(id: string) {
  scenes.value = scenes.value.filter(s => s.id !== id)
  if (activeSceneId.value === id)
    activeSceneId.value = scenes.value[0]?.id ?? null
  saveScenes(scenes.value)
}

function setSceneColor(scene: Scene, colorIdx: number) {
  scene.color = colorIdx
  saveScenes(scenes.value)
}

function startEdit(scene: Scene, field: 'title' | 'desc') {
  editingId.value = scene.id
  editingField.value = field
}

function finishEdit() {
  if (editingId.value) {
    const scene = scenes.value.find(s => s.id === editingId.value)
    if (scene)
      saveScenes(scenes.value)
  }
  editingId.value = null
  editingField.value = null
}

function organizeNotes() {
  if (!boardRef.value)
    return
  const containerW = boardRef.value.clientWidth
  const gap = 16
  const cols = 2
  const noteW = Math.floor((containerW - gap * (cols + 1)) / cols)
  const noteH = 120
  const sorted = [...filteredScenes.value].sort((a, b) => b.updatedAt - a.updatedAt)
  sorted.forEach((scene, i) => {
    scene.w = noteW
    scene.h = noteH
    scene.x = gap + (i % cols) * (noteW + gap)
    scene.y = gap + Math.floor(i / cols) * (noteH + gap)
  })
  saveScenes(scenes.value)
}

// ---- 拖拽 ----
function onDragStart(e: MouseEvent, scene: Scene) {
  if ((e.target as HTMLElement).closest('input, textarea, button'))
    return
  e.preventDefault()
  activeSceneId.value = scene.id
  dragState.value = {
    id: scene.id,
    startX: e.clientX,
    startY: e.clientY,
    noteX: scene.x,
    noteY: scene.y,
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragState.value)
    return
  const scene = scenes.value.find(s => s.id === dragState.value!.id)
  if (!scene || !boardRef.value)
    return

  const board = boardRef.value
  const maxX = board.scrollWidth - scene.w
  const maxY = board.scrollHeight - scene.h

  scene.x = Math.max(0, Math.min(maxX, dragState.value.noteX + e.clientX - dragState.value.startX))
  scene.y = Math.max(0, Math.min(maxY, dragState.value.noteY + e.clientY - dragState.value.startY))

  // 接近边缘时自动滚动
  const rect = board.getBoundingClientRect()
  const edge = 40
  const scrollSpeed = 12
  if (e.clientX - rect.left < edge)
    board.scrollLeft -= scrollSpeed
  else if (rect.right - e.clientX < edge)
    board.scrollLeft += scrollSpeed
  if (e.clientY - rect.top < edge)
    board.scrollTop -= scrollSpeed
  else if (rect.bottom - e.clientY < edge)
    board.scrollTop += scrollSpeed
}

function onDragEnd() {
  if (dragState.value) {
    const scene = scenes.value.find(s => s.id === dragState.value!.id)
    if (scene)
      saveScenes(scenes.value)
  }
  dragState.value = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

// ---- 缩放 ----
function onResizeStart(e: MouseEvent, scene: Scene) {
  e.preventDefault()
  e.stopPropagation()
  activeSceneId.value = scene.id
  resizeState.value = {
    id: scene.id,
    startX: e.clientX,
    startY: e.clientY,
    startW: scene.w,
    startH: scene.h,
  }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizeState.value)
    return
  const scene = scenes.value.find(s => s.id === resizeState.value!.id)
  if (!scene)
    return
  scene.w = Math.max(120, resizeState.value.startW + e.clientX - resizeState.value.startX)
  scene.h = Math.max(80, resizeState.value.startH + e.clientY - resizeState.value.startY)
}

function onResizeEnd() {
  if (resizeState.value) {
    const scene = scenes.value.find(s => s.id === resizeState.value!.id)
    if (scene)
      saveScenes(scenes.value)
  }
  resizeState.value = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

function handleSceneChange(elements: readonly unknown[], _appState: Record<string, unknown>, _files: Record<string, unknown>) {
  if (!activeScene.value)
    return
  activeScene.value.elements = [...elements]
  activeScene.value.updatedAt = Date.now()
  saveScenes(scenes.value)
}

if (scenes.value.length === 0)
  createScene()

// 兼容旧版数据
const OLD_KEY = 'idea-board-scenes'
const OLD_SINGLE = 'idea-board-scene'
for (const key of [OLD_KEY, OLD_SINGLE]) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const data = JSON.parse(raw)
      const items = Array.isArray(data) ? data : (data.elements?.length ? [data] : [])
      for (const item of items) {
        if (!scenes.value.some(s => s.id === item.id)) {
          scenes.value.push({
            id: item.id || Date.now().toString(36),
            title: item.title || item.name || '旧数据',
            desc: item.desc || '',
            color: item.color ?? 0,
            group: item.group || '',
            x: item.x ?? 20,
            y: item.y ?? 20,
            w: item.w ?? 200,
            h: item.h ?? 120,
            elements: item.elements || [],
            createdAt: item.createdAt || Date.now(),
            updatedAt: item.updatedAt || Date.now(),
          })
        }
      }
      saveScenes(scenes.value)
      localStorage.removeItem(key)
    }
  }
  catch {
    // ignore
  }
}

// 同步完成后从 localStorage 重载场景数据
onMounted(() => {
  const handler = () => {
    scenes.value = loadScenes()
    if (!activeSceneId.value && scenes.value.length > 0)
      activeSceneId.value = scenes.value[0].id
  }
  window.addEventListener('md:scenes-synced', handler)
  onUnmounted(() => window.removeEventListener('md:scenes-synced', handler))
})
</script>

<template>
  <div class="flex h-screen flex-col select-none">
    <!-- Header -->
    <header class="flex items-center gap-3 border-b px-4 py-2">
      <ViewNav />

      <!-- 有分组时才显示过滤 -->
      <div v-if="groups.length" class="ml-4 flex items-center gap-1">
        <button
          class="rounded-full px-2 py-0.5 text-xs transition-colors"
          :class="activeGroup === null ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-muted hover:bg-muted/80'"
          @click="activeGroup = null"
        >
          全部
        </button>
        <button
          v-for="g in groups"
          :key="g"
          class="rounded-full px-2 py-0.5 text-xs transition-colors"
          :class="activeGroup === g ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-muted hover:bg-muted/80'"
          @click="activeGroup = g"
        >
          {{ g }}
        </button>
      </div>

      <div class="flex-1" />

      <SyncButton />
    </header>

    <!-- 主体 -->
    <ResizablePanelGroup direction="horizontal" auto-save-id="idea-board-layout" class="flex-1">
      <!-- 左侧便签墙 -->
      <ResizablePanel :default-size="35" :min-size="20" :max-size="50">
        <div class="flex h-full flex-col">
          <!-- 顶部按钮栏 -->
          <div class="flex items-center justify-between border-b px-3 py-2">
            <span class="text-sm font-medium">📌 便签墙</span>
            <div class="flex items-center gap-2">
              <div class="relative w-36">
                <Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  v-model="searchQuery"
                  placeholder="搜索..."
                  class="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
              </div>
              <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" @click="organizeNotes">
                <LayoutGrid class="h-3.5 w-3.5" />
                整理
              </Button>
              <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" @click="createScene">
                <Plus class="h-3.5 w-3.5" />
                新建
              </Button>
            </div>
          </div>

          <!-- 便签画布 -->
          <div ref="boardRef" class="relative flex-1 overflow-auto">
            <!-- 便签 -->
            <div
              v-for="scene in filteredScenes"
              :key="scene.id"
              class="absolute flex flex-col rounded-lg border-2 shadow-md transition-shadow"
              :class="[
                COLORS[scene.color]?.bg ?? COLORS[0].bg,
                COLORS[scene.color]?.border ?? COLORS[0].border,
                scene.id === activeSceneId ? `ring-2 shadow-xl z-10 ${COLORS[scene.color]?.ring ?? COLORS[0].ring}` : 'z-0',
              ]"
              :style="{
                left: `${scene.x}px`,
                top: `${scene.y}px`,
                width: `${scene.w}px`,
                height: `${scene.h}px`,
              }"
              @mousedown="activeSceneId = scene.id"
            >
              <!-- 拖拽条 -->
              <div
                class="flex cursor-grab items-center gap-1.5 border-b px-3 py-1.5 active:cursor-grabbing"
                :class="COLORS[scene.color]?.border ?? COLORS[0].border"
                @mousedown.left="onDragStart($event, scene)"
              >
                <!-- 颜色选择 -->
                <div class="flex gap-0.5">
                  <button
                    v-for="(c, i) in COLORS"
                    :key="i"
                    class="h-3 w-3 rounded-full border border-gray-300 dark:border-gray-600 transition-transform hover:scale-125"
                    :class="c.dot"
                    @click.stop="setSceneColor(scene, i)"
                  />
                </div>

                <div class="flex-1" />

                <!-- 删除 -->
                <button class="text-gray-400 hover:text-red-400 dark:text-gray-500 dark:hover:text-red-400" @click.stop="deleteScene(scene.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>

              <!-- 内容区 -->
              <div class="flex flex-1 flex-col overflow-hidden px-3 py-2" @dblclick="startEdit(scene, 'title')">
                <!-- 标题 -->
                <Input
                  v-if="editingId === scene.id && editingField === 'title'"
                  v-model="scene.title"
                  class="h-6 border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0"
                  @blur="finishEdit"
                  @keydown.enter="finishEdit"
                  @keydown.escape="editingId = null"
                />
                <div v-else class="truncate text-sm font-semibold text-gray-800 dark:text-gray-200" v-html="highlightText(scene.title, searchQuery)" />

                <!-- 描述 -->
                <div class="mt-1 min-h-0 flex-1" @dblclick.stop="startEdit(scene, 'desc')">
                  <textarea
                    v-if="editingId === scene.id && editingField === 'desc'"
                    v-model="scene.desc"
                    class="h-full w-full resize-none bg-transparent p-0 text-xs text-gray-600 dark:text-gray-400 outline-none"
                    @blur="finishEdit"
                    @keydown.escape="editingId = null"
                  />
                  <p v-else class="line-clamp-3 text-xs text-gray-500 dark:text-gray-400" v-html="scene.desc ? highlightText(scene.desc, searchQuery) : '<span class=\'text-gray-300 dark:text-gray-600\'>双击添加描述...</span>'" />
                </div>

                <!-- 创建时间 -->
                <div class="mt-auto pt-1 text-xs text-gray-400 dark:text-gray-500">
                  {{ new Date(scene.createdAt).toLocaleString() }}
                </div>
              </div>

              <!-- 缩放手柄 -->
              <div
                class="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
                @mousedown.left="onResizeStart($event, scene)"
              >
                <svg class="h-4 w-4 text-gray-300 dark:text-gray-600" viewBox="0 0 16 16">
                  <path d="M14 16L16 14M10 16L16 10M6 16L16 6" stroke="currentColor" stroke-width="1.5" fill="none" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </ResizablePanel>

      <!-- 可拖拽分割线 -->
      <ResizableHandle class="w-1.5 bg-gray-200 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-500 transition-colors" />

      <!-- 右侧画布 -->
      <ResizablePanel :default-size="65" :min-size="40">
        <div class="relative h-full">
          <ExcalidrawWrapper
            v-if="activeScene"
            ref="excalidrawRef"
            :key="activeScene.id"
            :initial-data="{ elements: activeScene.elements }"
            @change="handleSceneChange"
          />
          <div v-else class="flex h-full items-center justify-center text-muted-foreground">
            <div class="text-center">
              <Lightbulb class="mx-auto mb-4 h-12 w-12 opacity-30" />
              <p class="text-lg">
                点击左侧便签打开画布
              </p>
            </div>
          </div>

          <!-- AI 错误提示 -->
          <div
            v-if="aiError"
            class="absolute bottom-24 right-4 z-20 rounded-md bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-600 shadow-md dark:bg-red-950 dark:border-red-800 dark:text-red-400"
          >
            {{ aiError }}
          </div>

          <!-- 浮动按钮 -->
          <TooltipProvider v-if="activeScene" :delay-duration="600">
            <div class="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 border-purple-300 bg-background/80 text-purple-700 shadow-md backdrop-blur hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950"
                    @click="openMermaidDialog"
                  >
                    <Sparkles class="h-3.5 w-3.5" />
                    生成想法
                  </Button>
                </TooltipTrigger>
                <TooltipContent>打开 Mermaid 画布，将流程图转换为思维导图</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 border-amber-300 bg-background/80 text-amber-700 shadow-md backdrop-blur hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                    @click="openAIDraft"
                  >
                    <Sparkles class="h-3.5 w-3.5" />
                    生成草稿
                  </Button>
                </TooltipTrigger>
                <TooltipContent>截图画布内容，发给 AI 生成文章草稿</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- AI 初稿对话框 -->
    <AIDraftDialog
      v-if="showAIDialog && activeScene && aiScreenshotFile"
      :screenshot-file="aiScreenshotFile"
      :idea-title="activeScene.title"
      :idea-desc="activeScene.desc"
      @close="showAIDialog = false"
      @inserted="showAIDialog = false"
    />

    <!-- Mermaid AI 对话框 -->
    <MermaidAIDialog
      v-if="showMermaidDialog"
      @close="showMermaidDialog = false"
      @insert="handleMermaidInsert"
      @insert-json="handleJsonInsert"
    />
  </div>
</template>
