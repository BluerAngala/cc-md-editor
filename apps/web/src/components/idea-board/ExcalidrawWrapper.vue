<script setup lang="ts">
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types/types'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  initialData?: {
    elements: ExcalidrawElement[]
    appState?: Partial<AppState>
  }
}>()

const emit = defineEmits<{
  change: [elements: ExcalidrawElement[], appState: AppState, files: BinaryFiles | null]
  ready: []
}>()

const containerRef = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref<string | null>(null)
let root: ReturnType<typeof import('react-dom/client').createRoot> | null = null
let excalidrawRef: any = null

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
      return React.createElement(
        'div',
        { style: { height: '100%', width: '100%' } },
        React.createElement(Excalidraw, {
          ref: (ref: any) => { excalidrawRef = ref },
          initialData: props.initialData || { elements: [] },
          onChange: (elements: ExcalidrawElement[], appState: AppState, files: BinaryFiles | null) => {
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
          },
        }),
      )
    }

    root = ReactDOM.createRoot(containerRef.value)
    root.render(React.createElement(App))
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
  <div class="relative h-full w-full">
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
