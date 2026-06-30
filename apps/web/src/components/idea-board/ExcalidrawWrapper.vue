<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{
  initialData?: {
    elements: unknown[]
    appState?: Record<string, unknown>
  }
}>()

const emit = defineEmits<{
  change: [elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>]
  ready: []
}>()

const uiStore = useUIStore()

const containerRef = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref<string | null>(null)
let root: ReturnType<typeof import('react-dom/client').createRoot> | null = null
let excalidrawRef: {
  updateScene: (scene: Record<string, unknown>) => void
  getAppState: () => Record<string, unknown>
  getSceneElements: () => readonly Record<string, unknown>[]
  getFiles: () => Record<string, unknown>
} | null = null

// ── 移除不需要的菜单项 ─────────────────────────────────────
function hideUnwantedMenuItems() {
  const container = containerRef.value
  if (!container)
    return

  const observer = new MutationObserver(() => {
    container.querySelectorAll('a.dropdown-menu-item').forEach(el => el.remove())
    container.querySelectorAll('button.dropdown-menu-item').forEach((item) => {
      const text = item.querySelector('.dropdown-menu-item__text')?.textContent || ''
      if (text.includes('Find') || text.includes('搜索') || text.includes('查找'))
        item.remove()
    })
    container.querySelectorAll('.sidebar-trigger').forEach(el => el.remove())
  })

  observer.observe(container, { childList: true, subtree: true })
}

// ── Excalidraw 挂载 ───────────────────────────────────────
async function mountExcalidraw() {
  if (!containerRef.value)
    return

  try {
    const [React, ReactDOM, excalidraw] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('@excalidraw/excalidraw'),
    ])

    const { Excalidraw } = excalidraw

    await import('@excalidraw/excalidraw/index.css')

    loading.value = false
    emit('ready')

    const App = () => {
      const excalidrawProps = {
        langCode: `zh-CN`,
        initialData: props.initialData || { elements: [] },
        theme: uiStore.isDark ? 'dark' : 'light',
        onChange: (elements: any, appState: any, files: any) => {
          emit('change', elements, appState, files)
        },
        UIOptions: {
          canvasActions: {
            changeViewBackgroundColor: true,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: true,
          },
          tools: {
            image: true,
          },
        },
        renderTopRightUI: () => null,
      }

      return React.createElement(
        'div',
        { style: { height: '100%', width: '100%' } },
        React.createElement(Excalidraw, {
          ...excalidrawProps,
          excalidrawAPI: (api: typeof excalidrawRef) => { excalidrawRef = api },
        } as any),
      )
    }

    root = ReactDOM.createRoot(containerRef.value)
    root.render(React.createElement(App))

    hideUnwantedMenuItems()

    watch(() => uiStore.isDark, (isDark) => {
      if (excalidrawRef)
        excalidrawRef.updateScene({ appState: { theme: isDark ? 'dark' : 'light' } })
    })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
    loading.value = false
  }
}

function unmountExcalidraw() {
  if (root) {
    root.unmount()
    root = null
    excalidrawRef = null
  }
}

onMounted(() => mountExcalidraw())
onBeforeUnmount(() => unmountExcalidraw())

// ── 导出接口 ─────────────────────────────────────────────
interface ExcalidrawElement {
  id: string
  [key: string]: unknown
}

defineExpose({
  getRef: () => excalidrawRef,

  getElements: (): ExcalidrawElement[] => {
    if (!excalidrawRef)
      return []
    const selected = excalidrawRef.getAppState()?.selectedElementIds as Record<string, boolean> | undefined
    const allElements = excalidrawRef.getSceneElements() as any[]
    if (selected && Object.keys(selected).length > 0)
      return allElements.filter((el: ExcalidrawElement) => selected[el.id])
    return allElements
  },

  exportToDataUrl: async (): Promise<string | null> => {
    if (!excalidrawRef)
      return null
    try {
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const elements = excalidrawRef.getSceneElements() || []
      if (!elements.length)
        return null
      const appState = excalidrawRef.getAppState() || {}
      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportWithDarkMode: uiStore.isDark },
        files: excalidrawRef.getFiles(),
      })
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }
    catch (e) {
      console.error('[ExcalidrawWrapper] exportToDataUrl failed:', e)
      return null
    }
  },
})
</script>

<template>
  <div class="relative h-full w-full excalidraw-wrapper">
    <div ref="containerRef" class="h-full w-full" />

    <div
      v-if="loading"
      class="absolute inset-0 flex flex-col items-center justify-center bg-background"
    >
      <div class="flex flex-col items-center gap-4">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <p class="text-sm text-muted-foreground">
          正在加载画布...
        </p>
      </div>
    </div>

    <div
      v-if="error"
      class="absolute inset-0 flex flex-col items-center justify-center bg-background"
    >
      <p class="text-sm text-red-500">
        {{ error }}
      </p>
    </div>
  </div>
</template>

<style>
.excalidraw-wrapper .layer-ui__library {
  display: none !important;
}
.excalidraw-wrapper .library-button,
.excalidraw-wrapper .sidebar-trigger.default-sidebar-trigger,
.excalidraw-wrapper .sidebar-trigger__label {
  display: none !important;
}
.excalidraw-wrapper a.dropdown-menu-item[href],
.excalidraw-wrapper a.dropdown-menu-item {
  display: none !important;
}
.excalidraw-wrapper .dropdown-menu-group-title {
  display: none !important;
}
.excalidraw-wrapper .dropdown-menu-item__text {
  text-align: left !important;
}
</style>
