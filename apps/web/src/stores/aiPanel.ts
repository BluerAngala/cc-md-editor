import type { Ref } from 'vue'

export interface AIMessage {
  id: string
  role: `user` | `assistant`
  content: string
  timestamp: number
}

interface PanelPosition {
  x: number
  y: number
}

interface PanelSize {
  width: number
  height: number
}

const PANEL_KEY = `ai-panel`
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 560
const MIN_WIDTH = 320
const MIN_HEIGHT = 400

export const useAIPanelStore = defineStore(`aiPanel`, () => {
  const visible = ref(false)
  const position = useStorage<PanelPosition>(`${PANEL_KEY}-pos`, { x: -1, y: -1 })
  const size = useStorage<PanelSize>(`${PANEL_KEY}-size`, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const selectedText = ref(``)
  const messages: Ref<AIMessage[]> = ref([])
  const isStreaming = ref(false)

  function open(text?: string, anchor?: { right: number, top: number }) {
    if (text !== undefined)
      selectedText.value = text
    visible.value = true

    const pos = position.value
    const isDefault = pos.x < 0 || pos.y < 0
    const isOutOfBounds = pos.x > window.innerWidth - 50 || pos.y > window.innerHeight - 50

    // If position is default or out of bounds, determine initial position
    if (isDefault || isOutOfBounds) {
      if (anchor) {
        // First open: position next to sidebar icon
        position.value = {
          x: Math.max(20, anchor.right + 8),
          y: Math.max(20, anchor.top - size.value.height / 3),
        }
      }
      else {
        // No anchor (Cmd+J): center on screen
        position.value = {
          x: Math.max(20, (window.innerWidth - size.value.width) / 2),
          y: Math.max(20, (window.innerHeight - size.value.height) / 3),
        }
      }
    }
    // Otherwise: keep stored position (user has moved the panel)
  }

  function close() {
    visible.value = false
  }

  function toggle(text?: string) {
    if (visible.value)
      close()
    else
      open(text)
  }

  function setPosition(x: number, y: number) {
    position.value = { x, y }
  }

  function setSize(w: number, h: number) {
    size.value = {
      width: Math.max(MIN_WIDTH, w),
      height: Math.max(MIN_HEIGHT, h),
    }
  }

  function addMessage(msg: Omit<AIMessage, `id` | `timestamp`>) {
    messages.value.push({
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })
  }

  function clearMessages() {
    messages.value = []
  }

  function resetPosition() {
    position.value = { x: -1, y: -1 }
    size.value = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }

  return {
    visible,
    position,
    size,
    selectedText,
    messages,
    isStreaming,
    open,
    close,
    toggle,
    setPosition,
    setSize,
    addMessage,
    clearMessages,
    resetPosition,
    MIN_WIDTH,
    MIN_HEIGHT,
  }
})
