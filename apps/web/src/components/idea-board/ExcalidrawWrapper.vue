<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  initialData?: {
    elements: any[]
    appState?: Record<string, any>
  }
}>()

const emit = defineEmits<{
  change: [elements: readonly any[], appState: any, files: any]
  ready: []
}>()

const containerRef = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref<string | null>(null)
let root: ReturnType<typeof import('react-dom/client').createRoot> | null = null
let excalidrawRef: any = null

/** 移除 Excalidraw 菜单中不需要的项目 */
function hideUnwantedMenuItems() {
  const observer = new MutationObserver(() => {
    const container = containerRef.value
    if (!container)
      return

    // 移除所有 <a> 标签的下拉菜单项（GitHub、Follow us、Discord）
    container.querySelectorAll('a.dropdown-menu-item').forEach(el => el.remove())

    // 移除 "Find on canvas" 菜单项
    container.querySelectorAll('button.dropdown-menu-item').forEach((item) => {
      const text = item.querySelector('.dropdown-menu-item__text')?.textContent || ''
      if (text.includes('Find') || text.includes('搜索') || text.includes('查找')) {
        item.remove()
      }
    })

    // 移除素材库按钮
    container.querySelectorAll('.sidebar-trigger').forEach(el => el.remove())
  })

  observer.observe(containerRef.value!, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), 30_000)
}

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

    // CSS 已通过 index.html 预加载，这里确保注入
    await import('@excalidraw/excalidraw/index.css')

    loading.value = false
    emit('ready')

    const App = () => {
      const excalidrawProps: any = {
        langCode: `zh-CN`,
        initialData: props.initialData || { elements: [] },
        onChange: (elements: readonly any[], appState: any, files: any) => {
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
            image: false,
          },
        },
        renderTopRightUI: () => null,
      }

      return React.createElement(
        'div',
        { style: { height: '100%', width: '100%' } },
        React.createElement(Excalidraw, {
          ...excalidrawProps,
          ref: (ref: any) => { excalidrawRef = ref },
        }),
      )
    }

    root = ReactDOM.createRoot(containerRef.value)
    root.render(React.createElement(App))

    // 移除不需要的菜单项
    hideUnwantedMenuItems()
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

onMounted(() => {
  mountExcalidraw()
})

onBeforeUnmount(() => {
  unmountExcalidraw()
})

defineExpose({
  getRef: () => excalidrawRef,
})
</script>

<template>
  <div class="relative h-full w-full excalidraw-wrapper">
    <div ref="containerRef" class="h-full w-full" />

    <!-- Loading skeleton -->
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

    <!-- Error state -->
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
/* 隐藏素材库按钮和侧边栏 */
.excalidraw-wrapper .layer-ui__library {
  display: none !important;
}
.excalidraw-wrapper .library-button,
.excalidraw-wrapper .sidebar-trigger.default-sidebar-trigger,
.excalidraw-wrapper .sidebar-trigger__label {
  display: none !important;
}

/* 隐藏 Excalidraw 外部链接（GitHub、Follow us、Discord）*/
.excalidraw-wrapper a.dropdown-menu-item[href],
.excalidraw-wrapper a.dropdown-menu-item {
  display: none !important;
}

/* 隐藏 Excalidraw links 标题 */
.excalidraw-wrapper .dropdown-menu-group-title {
  display: none !important;
}

/* 菜单项文本统一左对齐 */
.excalidraw-wrapper .dropdown-menu-item__text {
  text-align: left !important;
}
</style>
