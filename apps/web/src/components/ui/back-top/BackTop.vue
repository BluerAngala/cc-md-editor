<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine } from '@lucide/vue'
import { throttle } from 'es-toolkit'

type Target = HTMLElement | Window | null

const props = defineProps<{
  left?: number
  top?: number
  right?: number
  bottom?: number
  visibilityHeight?: number
  target?: string
  onClick?: (e: MouseEvent) => void
}>()

const visibilityHeight = ref(props.visibilityHeight ?? 400)
const visible = ref(false)

const target = ref<Target>(null)

function scrollToTop(e: MouseEvent) {
  target.value?.scrollTo({ top: 0, left: 0, behavior: `smooth` })
  props.onClick?.(e)
}

function scrollToBottom(e: MouseEvent) {
  if (!target.value)
    return
  const maxTop = target.value instanceof HTMLElement
    ? target.value.scrollHeight
    : document.documentElement.scrollHeight
  target.value.scrollTo({ top: maxTop, left: 0, behavior: `smooth` })
  props.onClick?.(e)
}

const throttledScroll = throttle((el: Target) => {
  if (el instanceof HTMLElement) {
    visible.value = el.scrollTop > visibilityHeight.value
  }
  else {
    visible.value = window.scrollY > visibilityHeight.value
  }
}, 200, { edges: [`leading`, `trailing`] })

function handleScroll() {
  throttledScroll(target.value)
}

onMounted(() => {
  if (props.target) {
    target.value = document.getElementById(props.target)
  }
  else {
    target.value = window
  }

  target.value?.addEventListener(`scroll`, handleScroll)
})

onUnmounted(() => {
  target.value?.removeEventListener(`scroll`, handleScroll)
})
</script>

<template>
  <div v-if="visible" class="absolute z-50 flex flex-col gap-1" :style="{ left: `${left}px`, top: `${top}px`, right: `${right}px`, bottom: `${bottom}px` }">
    <Button variant="outline" size="icon" class="rounded-full border-border/40 bg-background/60 text-muted-foreground/70 backdrop-blur-sm hover:bg-background/80 hover:text-foreground" @click="scrollToTop">
      <ArrowUpFromLine />
    </Button>
    <Button variant="outline" size="icon" class="rounded-full border-border/40 bg-background/60 text-muted-foreground/70 backdrop-blur-sm hover:bg-background/80 hover:text-foreground" @click="scrollToBottom">
      <ArrowDownToLine />
    </Button>
  </div>
</template>
