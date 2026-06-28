<script setup lang="ts">
import { Bot, Image as ImageIcon, Settings2, Wand2 } from '@lucide/vue'
import { defineAsyncComponent } from 'vue'
import { useAIPanelStore } from '@/stores/aiPanel'
import { useEditorStore } from '@/stores/editor'
import { useUIStore } from '@/stores/ui'
import { AIPolishPopover } from './tool-box'

defineProps<{
  isMobile: boolean
  showEditor: boolean
}>()
const AIImageGeneratorPanel = defineAsyncComponent(() => import('./image-generator/AIImageGeneratorPanel.vue'))

const SELECTION_HINT_TIMEOUT_MS = 3000

const uiStore = useUIStore()
const { aiImageDialogVisible } = storeToRefs(uiStore)
const { toggleAIImageDialog } = uiStore

const editorStore = useEditorStore()
const { editor } = storeToRefs(editorStore)
const aiPanelStore = useAIPanelStore()

const { hasShownAIToolboxHint } = storeToRefs(uiStore)
const { t } = useI18n()

// 工具栏状态：false=默认(只显示贴边栏), true=展开(显示AI图标)
const isExpanded = ref(false) // 默认收起状态

// AI 工具箱相关状态
const toolBoxVisible = ref(false)

// 是否显示选中文本提示动画
const showSelectionHint = ref(false)
let selectionHintTimer: NodeJS.Timeout | null = null
let lastSelectedText = ``

// 检查选中文本的函数
function getSelectedText() {
  try {
    if (!editor.value)
      return ``
    const selection = editor.value.state.selection.main
    return editor.value.state.doc.sliceString(selection.from, selection.to).trim()
  }
  catch {
    return ``
  }
}

// 检查并更新选中文本提示
function checkSelectionAndUpdateHint() {
  // 如果已经显示过提示，就不再显示
  if (hasShownAIToolboxHint.value) {
    return
  }

  const selected = getSelectedText()

  // 如果选中状态发生变化
  if (selected !== lastSelectedText) {
    lastSelectedText = selected

    // 清除之前的定时器
    if (selectionHintTimer) {
      clearTimeout(selectionHintTimer)
      selectionHintTimer = null
    }

    // 如果有选中文本且工具栏未展开
    if (selected && !isExpanded.value) {
      showSelectionHint.value = true

      // 标记已经显示过提示
      hasShownAIToolboxHint.value = true

      // 3秒后自动隐藏提示
      selectionHintTimer = setTimeout(() => {
        showSelectionHint.value = false
      }, SELECTION_HINT_TIMEOUT_MS)
    }
    else {
      showSelectionHint.value = false
    }
  }
}

// 动态计算是否有选中文本
const hasSelectedText = computed(() => {
  if (!editor.value || !isExpanded.value)
    return false
  return getSelectedText().length > 0
})

// 当打开工具箱时，获取当前选中的文本
const currentSelectedText = computed(() => {
  return toolBoxVisible.value ? getSelectedText() : ``
})

// 切换展开/收起状态
function toggleExpanded() {
  isExpanded.value = !isExpanded.value

  // 展开后隐藏提示
  if (isExpanded.value) {
    showSelectionHint.value = false
    if (selectionHintTimer) {
      clearTimeout(selectionHintTimer)
      selectionHintTimer = null
    }
  }
}

// 打开AI助手（浮动面板）
function openAIChat() {
  const selected = getSelectedText()
  aiPanelStore.open(selected || undefined)
}

// 打开AI文生图
function openAIImageGenerator() {
  toggleAIImageDialog(true)
}

// 打开AI工具箱
function openAIToolBox() {
  toolBoxVisible.value = true
}

// 监听编辑区点击，自动收起工具栏
onMounted(() => {
  // 使用 selectionchange 事件替代轮询，检测选中文本变化
  const handleSelectionChange = () => {
    checkSelectionAndUpdateHint()
  }
  document.addEventListener(`selectionchange`, handleSelectionChange)

  const handleInteraction = (e: Event) => {
    // 只有在展开状态才需要处理
    if (!isExpanded.value)
      return

    const target = e.target as Element
    if (!target)
      return

    const toolbar = document.querySelector(`.editor-ai-toolbar`)

    // 如果点击的是工具栏及其子元素，不处理
    if (toolbar && toolbar.contains(target))
      return

    // 排除不应该收起的区域
    const excludeSelectors = [
      `dialog`,
      `.popover`,
      `.modal`,
      `[role="dialog"]`,
      `nav`,
      `.menu`,
      `.dropdown`,
      `.tooltip`,
      `.floating`,
      `.ai-floating-panel`,
      `.ai-image-generator-panel`,
    ]

    const shouldNotCollapse = excludeSelectors.some(selector => target.closest(selector))

    if (!shouldNotCollapse) {
      isExpanded.value = false
    }
  }

  // 同时监听点击和触摸事件，覆盖桌面端和移动端
  document.addEventListener(`click`, handleInteraction, true)
  document.addEventListener(`touchstart`, handleInteraction, true)

  onUnmounted(() => {
    document.removeEventListener(`click`, handleInteraction, true)
    document.removeEventListener(`touchstart`, handleInteraction, true)
    document.removeEventListener(`selectionchange`, handleSelectionChange)

    // 清理定时器
    if (selectionHintTimer) {
      clearTimeout(selectionHintTimer)
      selectionHintTimer = null
    }
  })
})
</script>

<template>
  <!-- 编辑区内侧AI工具栏 -->
  <!-- @mousedown.prevent 防止点击工具栏时编辑器失去焦点，从而保持选区高亮 -->
  <div
    v-if="(!isMobile || (isMobile && showEditor))"
    class="editor-ai-toolbar absolute top-1/2 -translate-y-1/2 right-0 z-30 transition-all duration-300 ease-out"
    @mousedown.prevent
  >
    <!-- 默认状态：贴边栏 -->
    <div
      v-if="!isExpanded"
      class="w-5 h-16 bg-gradient-to-b from-blue-500/90 to-purple-500/90 hover:from-blue-600/95 hover:to-purple-600/95 dark:from-blue-400/90 dark:to-purple-400/90 dark:hover:from-blue-500/95 dark:hover:to-purple-500/95 backdrop-blur-lg border-l border-y border-blue-300/50 dark:border-blue-600/50 cursor-pointer transition-all duration-200 flex items-center justify-center rounded-l-lg shadow-lg group utools-sidebar-edge"
      :class="{ 'animate-pulse-hint': showSelectionHint }"
      :title="t('ai.toolbar.expand')"
      @click="toggleExpanded"
    >
      <Settings2 class="h-4 w-4 text-white drop-shadow-sm group-hover:scale-110 transition-transform duration-200" />

      <!-- 选中文本提示气泡 -->
      <Transition name="hint-fade">
        <div
          v-if="showSelectionHint"
          class="hint-bubble absolute right-full mr-3 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium rounded-lg shadow-xl whitespace-nowrap pointer-events-none animate-bounce-gentle z-50"
          style="top: 50%; transform: translateY(-50%);"
        >
          <div class="relative flex items-center gap-2">
            <Wand2 class="h-4 w-4" />
            <span>{{ t('ai.toolbar.openToolboxHint') }}</span>
            <!-- 箭头 -->
            <div class="hint-arrow absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-b-[6px] border-l-[6px] border-transparent border-l-purple-500" />
          </div>
        </div>
      </Transition>
    </div>

    <!-- 展开状态：显示AI图标 -->
    <div
      v-else
      class="bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-l border-gray-200/50 dark:border-gray-700/50 shadow-lg overflow-hidden transition-all duration-300 w-12 rounded-l-md"
      :style="{ height: 'auto' }"
    >
      <!-- 展开状态的AI按钮 -->
      <div class="flex flex-col py-2 gap-2">
        <!-- AI助手按钮 -->
        <div class="flex flex-col items-center gap-1 px-1">
          <button
            class="group relative w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center utools-ai-button"
            :title="t('ai.toolbar.assistant')"
            @click="openAIChat"
          >
            <Bot class="h-4 w-4" />
          </button>

          <!-- 标签 -->
          <span class="text-[9px] text-gray-500 dark:text-gray-400 font-medium text-center leading-tight">
            {{ t('ai.toolbar.assistantLabel') }}
          </span>
        </div>

        <!-- 分割线 -->
        <div class="mx-1.5">
          <div class="h-px bg-gray-200/50 dark:bg-gray-700/50" />
        </div>

        <!-- AI文生图按钮 -->
        <div class="flex flex-col items-center gap-1 px-1">
          <button
            class="group relative w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center utools-ai-button"
            :title="t('ai.toolbar.imageGen')"
            @click="openAIImageGenerator"
          >
            <ImageIcon class="h-4 w-4" />
          </button>

          <!-- 标签 -->
          <span class="text-[9px] text-gray-500 dark:text-gray-400 font-medium text-center leading-tight">
            {{ t('ai.toolbar.imageGenLabel') }}
          </span>
        </div>

        <!-- 分割线 -->
        <div v-if="hasSelectedText && isExpanded" class="mx-1.5">
          <div class="h-px bg-gray-200/50 dark:bg-gray-700/50" />
        </div>

        <!-- AI工具箱按钮 (只有选中文本且展开时才显示) -->
        <div v-if="hasSelectedText && isExpanded" class="flex flex-col items-center gap-1 px-1">
          <button
            class="group relative w-7 h-7 rounded-lg bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center utools-ai-button"
            :title="t('ai.toolbar.toolbox')"
            @click="openAIToolBox"
          >
            <Wand2 class="h-4 w-4" />
          </button>

          <!-- 标签 -->
          <span class="text-[9px] text-gray-500 dark:text-gray-400 font-medium text-center leading-tight">
            {{ t('ai.toolbar.toolboxLabel') }}
          </span>
        </div>
      </div>
    </div>

    <!-- AI文生图弹窗 -->
    <AIImageGeneratorPanel v-if="aiImageDialogVisible" v-model:open="aiImageDialogVisible" />

    <!-- AI工具箱弹窗 -->
    <AIPolishPopover
      v-model:open="toolBoxVisible"
      :selected-text="currentSelectedText"
      :is-mobile="isMobile"
    />
  </div>
</template>

<style scoped>
/* 确保工具栏与编辑器完美集成 */
.editor-ai-toolbar {
  /* 工具栏动画 */
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 提示气泡动画 */
.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.hint-fade-enter-from {
  opacity: 0;
  transform: translateX(10px) translateY(-50%);
}

.hint-fade-leave-to {
  opacity: 0;
  transform: translateX(10px) translateY(-50%);
}

/* 微弹跳动画 */
@keyframes bounce-gentle {
  0%,
  100% {
    transform: translateY(-50%) scale(1);
  }
  50% {
    transform: translateY(-53%) scale(1.02);
  }
}

.animate-bounce-gentle {
  animation: bounce-gentle 2s ease-in-out infinite;
}

/* 脉冲提示动画 */
@keyframes pulse-hint {
  0%,
  100% {
    opacity: 1;
    transform: scaleY(1);
  }
  50% {
    opacity: 0.7;
    transform: scaleY(1.1);
  }
}

.animate-pulse-hint {
  animation: pulse-hint 1.5s ease-in-out 3;
}
</style>
