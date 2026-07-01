<script setup lang="ts">
import type { Article } from '@/stores/reading'
import { MessageSquarePlus, X } from '@lucide/vue'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

interface Annotation {
  id: string
  articleId: string
  text: string
  comment: string
  createdAt: number
}

const props = defineProps<{
  article: Article
  content: string
}>()

const STORAGE_KEY = 'reading_annotations'

const annotations = ref<Annotation[]>([])
const hoveredId = ref<string | null>(null)
const activeId = ref<string | null>(null)
const editingText = ref('')
const popup = ref<{ x: number, y: number, text: string } | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const lineCoords = ref<{ x1: number, y1: number, x2: number, y2: number } | null>(null)
let collapseTimer: ReturnType<typeof setTimeout> | null = null

// 失焦自动折叠（带延迟，允许鼠标在高亮和卡片间移动）
function scheduleCollapse() {
  if (collapseTimer)
    clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    const hovered = contentRef.value?.querySelector(':hover')
    if (!hovered?.closest('.ann-highlight') && !hovered?.closest('[data-card-id]')) {
      activeId.value = null
      hoveredId.value = null
      lineCoords.value = null
    }
  }, 300)
}

function cancelCollapse() {
  if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null }
}

onMounted(() => {
  loadAnnotations()
  document.addEventListener('mousedown', handleGlobalClick)
  window.addEventListener('scroll', updateLine, true)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleGlobalClick)
  window.removeEventListener('scroll', updateLine, true)
})

watch(() => props.article.id, () => {
  loadAnnotations()
  activeId.value = null
  hoveredId.value = null
})

function loadAnnotations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all: Annotation[] = raw ? JSON.parse(raw) : []
    annotations.value = all.filter(a => a.articleId === props.article.id)
  }
  catch { annotations.value = [] }
}

function save(updated: Annotation[]) {
  annotations.value = updated
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all: Annotation[] = raw ? JSON.parse(raw) : []
    const others = all.filter(a => a.articleId !== props.article.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...others, ...updated]))
  }
  catch { /* ignore */ }
}

function handleGlobalClick(e: MouseEvent) {
  if (popup.value && !(e.target as HTMLElement).closest('.annotate-popup'))
    popup.value = null
}

// ── 选中文字 ──────────────────────────────────────────
function handleMouseUp() {
  const sel = window.getSelection()
  const text = sel?.toString().trim()
  if (!text || text.length < 2)
    return
  const range = sel?.getRangeAt(0)
  if (!range || !contentRef.value?.contains(range.commonAncestorContainer))
    return

  const rect = range.getBoundingClientRect()
  popup.value = {
    x: rect.right + 8,
    y: rect.top,
    text,
  }
}

function createAnnotation() {
  if (!popup.value)
    return
  const ann: Annotation = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    articleId: props.article.id,
    text: popup.value.text,
    comment: '',
    createdAt: Date.now(),
  }
  save([...annotations.value, ann])
  popup.value = null
  activeId.value = ann.id
  editingText.value = ''
  nextTick(() => {
    highlightAnnotation(ann)
    focusInput(ann.id)
  })
}

function focusInput(id: string) {
  nextTick(() => {
    const el = contentRef.value?.querySelector(`[data-card-id="${id}"] textarea`) as HTMLTextAreaElement
    el?.focus()
  })
}

function handleCardClick(ann: Annotation) {
  if (activeId.value === ann.id) {
    activeId.value = null
  }
  else {
    activeId.value = ann.id
    editingText.value = ann.comment
    nextTick(() => focusInput(ann.id))
  }
}

function handleInput(id: string, value: string) {
  editingText.value = value
  save(annotations.value.map(a => a.id === id ? { ...a, comment: value } : a))
}

function removeAnnotation(id: string) {
  const spans = contentRef.value?.querySelectorAll(`[data-ann-id="${id}"]`)
  spans?.forEach((span) => {
    const parent = span.parentNode
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span)
      parent.removeChild(span)
    }
  })
  save(annotations.value.filter(a => a.id !== id))
  if (activeId.value === id)
    activeId.value = null
}

// ── 高亮文字 ──────────────────────────────────────────
function highlightAnnotation(ann: Annotation) {
  if (!contentRef.value)
    return
  const body = contentRef.value.querySelector('.article-body')
  if (!body)
    return

  // 避免重复高亮
  if (body.querySelector(`[data-ann-id="${ann.id}"]`))
    return

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  let remaining = ann.text
  let startNode: Node | null = null
  let startOffset = 0
  let currentPos = 0

  while (walker.nextNode() && remaining) {
    const node = walker.currentNode as Text
    const nodeText = node.textContent || ''

    if (!startNode) {
      const idx = nodeText.indexOf(remaining[0])
      if (idx === -1)
        continue
      startNode = node
      startOffset = idx
      currentPos = idx
    }

    while (currentPos < nodeText.length && remaining) {
      if (nodeText[currentPos] === remaining[0]) {
        remaining = remaining.slice(1)
        currentPos++
      }
      else {
        // 不匹配，重置
        remaining = ann.text
        startNode = null
        break
      }
    }

    if (!remaining && startNode) {
      // 找到完整匹配，用 span 包裹
      const range = document.createRange()
      range.setStart(startNode, startOffset)
      range.setEnd(node, currentPos)
      const span = document.createElement('span')
      span.className = 'ann-highlight'
      span.dataset.annId = ann.id
      span.addEventListener('mouseenter', () => { cancelCollapse(); hoveredId.value = ann.id; updateLine() })
      span.addEventListener('mouseleave', () => {
        if (activeId.value !== ann.id)
          scheduleCollapse()
      })
      span.addEventListener('click', () => handleCardClick(ann))
      try { range.surroundContents(span) }
      catch { /* skip cross-element */ }
      return
    }

    if (!startNode) {
      currentPos = 0
    }
  }
}

// 初始化高亮
onMounted(() => {
  nextTick(() => {
    annotations.value.forEach(a => highlightAnnotation(a))
  })
})

// ── 连接线 ────────────────────────────────────────────
function updateLine() {
  const id = hoveredId.value || activeId.value
  if (!id || !contentRef.value) { lineCoords.value = null; return }

  const highlight = contentRef.value.querySelector(`[data-ann-id="${id}"]`) as HTMLElement
  const card = contentRef.value.querySelector(`[data-card-id="${id}"]`) as HTMLElement
  if (!highlight || !card) { lineCoords.value = null; return }

  const containerRect = contentRef.value.getBoundingClientRect()
  const hlRect = highlight.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()

  lineCoords.value = {
    x1: hlRect.right - containerRect.left,
    y1: hlRect.top - containerRect.top + hlRect.height / 2,
    x2: cardRect.left - containerRect.left,
    y2: cardRect.top - containerRect.top + 12,
  }
}

watch([hoveredId, activeId], () => { nextTick(updateLine) })
</script>

<template>
  <div ref="contentRef" class="flex flex-1 overflow-hidden relative">
    <!-- 左侧：文章正文 -->
    <div
      class="article-body article-content flex-1 overflow-y-auto px-8 py-6 select-text cursor-text"
      @mouseup="handleMouseUp"
    >
      <div v-html="content" />

      <!-- 选中弹窗 -->
      <div
        v-if="popup"
        class="annotate-popup fixed z-50"
        :style="{ left: `${popup.x}px`, top: `${popup.y}px` }"
      >
        <button
          class="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          @click="createAnnotation"
        >
          <MessageSquarePlus class="h-3.5 w-3.5" />
          批注
        </button>
      </div>
    </div>

    <!-- 右侧：批注侧栏 -->
    <div class="w-64 border-l flex flex-col overflow-y-auto bg-muted/5 py-2">
      <div
        v-for="ann in annotations"
        :key="ann.id"
        :data-card-id="ann.id"
        class="group mx-2 mb-2 rounded-lg transition-all duration-200 cursor-pointer"
        :class="[
          hoveredId === ann.id || activeId === ann.id
            ? 'ring-1 ring-red-400/40 bg-background shadow-sm'
            : 'hover:bg-background/50',
        ]"
        @mouseenter="cancelCollapse(); hoveredId = ann.id; nextTick(updateLine)"
        @mouseleave="activeId !== ann.id && scheduleCollapse()"
        @click="handleCardClick(ann)"
      >
        <!-- 默认：一行摘要 -->
        <div class="px-3 py-2">
          <div class="flex items-start justify-between gap-2">
            <p class="text-[11px] text-muted-foreground flex-1 line-clamp-1">
              <span class="text-red-400 mr-1">●</span>
              {{ ann.comment || '点击编辑批注...' }}
            </p>
            <button
              class="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
              @click.stop="removeAnnotation(ann.id)"
            >
              <X class="h-3 w-3" />
            </button>
          </div>
          <p class="text-[10px] text-muted-foreground/50 mt-0.5 truncate italic">
            "{{ ann.text.slice(0, 50) }}{{ ann.text.length > 50 ? '...' : '' }}"
          </p>
        </div>

        <!-- 展开：编辑批注 -->
        <div
          v-if="activeId === ann.id"
          class="px-3 pb-2 border-t"
          @click.stop
        >
          <textarea
            :value="ann.comment"
            placeholder="写下你的批注..."
            class="w-full min-h-[60px] mt-2 text-xs resize-none rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            @input="handleInput(ann.id, ($event.target as HTMLTextAreaElement).value)"
          />
          <p class="text-[9px] text-muted-foreground/30 mt-1">
            {{ new Date(ann.createdAt).toLocaleString() }}
          </p>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="!annotations.length"
        class="flex flex-col items-center justify-center h-32 text-muted-foreground/30"
      >
        <MessageSquarePlus class="h-6 w-6 mb-2" />
        <span class="text-[10px]">划词添加批注</span>
      </div>
    </div>

    <!-- 连接线 SVG -->
    <svg
      v-if="lineCoords"
      class="absolute inset-0 pointer-events-none overflow-visible"
      style="z-index: 5;"
    >
      <line
        :x1="lineCoords.x1"
        :y1="lineCoords.y1"
        :x2="lineCoords.x2"
        :y2="lineCoords.y2"
        stroke="#ef4444"
        stroke-width="1.5"
        stroke-dasharray="5 3"
        stroke-opacity="0.6"
      />
    </svg>
  </div>
</template>

<style scoped>
.article-body :deep(.ann-highlight) {
  background: rgba(239, 68, 68, 0.1);
  border-bottom: 2px dashed #ef4444;
  cursor: pointer;
  transition: background 0.15s;
  border-radius: 2px;
  padding: 0 1px;
}
.article-body :deep(.ann-highlight:hover) {
  background: rgba(239, 68, 68, 0.2);
}
</style>
