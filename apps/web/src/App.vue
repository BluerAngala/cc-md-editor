<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import LandingPage from '@/components/LandingPage.vue'
import { Toaster } from '@/components/ui/sonner'
import { useCommandPaletteHotkey } from '@/composables/useCommandPaletteHotkey'
import { usePreferencesHotkey } from '@/composables/usePreferencesHotkey'
import { useUIStore } from '@/stores/ui'

const CodemirrorEditor = defineAsyncComponent(() => import('@/components/editor/CodemirrorEditor.vue'))
const IdeaBoard = defineAsyncComponent(() => import('@/components/idea-board/IdeaBoard.vue'))
const ReadingView = defineAsyncComponent(() => import('@/components/reading/ReadingView.vue'))
const CommandPalette = defineAsyncComponent(() => import('@/components/editor/dialogs/CommandPalette.vue'))
const ConfirmDialog = defineAsyncComponent(() => import('@/components/shared/confirm-dialog/ConfirmDialog.vue'))
const PreferencesDialog = defineAsyncComponent(() => import('@/components/editor/dialogs/PreferencesDialog.vue'))

const uiStore = useUIStore()
const { isDark, currentView, isShowPreferencesDialog } = storeToRefs(uiStore)

usePlatformEnv()
useAccountSyncBootstrap()
useDeepLinkImport()
useCommandPaletteHotkey()
usePreferencesHotkey()
</script>

<template>
  <LandingPage v-if="currentView === 'landing'" />
  <CodemirrorEditor v-else-if="currentView === 'editor'" />
  <IdeaBoard
    v-else-if="currentView === 'ideaBoard'"
  />
  <ReadingView
    v-else-if="currentView === 'reading'"
  />

  <CommandPalette />

  <ConfirmDialog />

  <PreferencesDialog v-model:open="isShowPreferencesDialog" />

  <Toaster
    rich-colors
    position="top-center"
    :duration="1200"
    :visible-toasts="1"
    :theme="isDark ? 'dark' : 'light'"
  />
</template>
