import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { detectInitialLocale } from '@/i18n/detect'
import { setAppI18n, setupI18n } from '@/i18n/index'
import { initStorage } from '@/storage'
import { useLocaleStore } from '@/stores/locale'

import AppRoot from './App.vue'
import { dismissInitialLoader } from './lib/bootstrap/dismiss-initial-loader'
import { setupComponents } from './lib/bootstrap/setup-components'

/** 组件暗色模式 CSS 变量注入（从 @md/core 内联，避免启动时拉取整个 core 包） */
function initComponentDarkVars() {
  if (typeof document === `undefined`)
    return
  if (document.getElementById(`md-comp-dark`))
    return
  const style = document.createElement(`style`)
  style.id = `md-comp-dark`
  style.textContent = `.dark {
  --md-comp-bg: #1e1e1e;
  --md-comp-bg-secondary: #2d2d2d;
  --md-comp-bg-stripe: #2a2a2a;
  --md-comp-text-primary: #e0e0e0;
  --md-comp-text-secondary: #b0b0b0;
  --md-comp-text-tertiary: #888;
  --md-comp-border-default: #404040;
  --md-comp-border-light: #333;
}`
  document.head.appendChild(style)
}

export async function bootstrap(): Promise<void> {
  initComponentDarkVars()
  setupComponents()

  const i18n = setupI18n(detectInitialLocale())
  setAppI18n(i18n)

  const app = createApp(AppRoot)
  app.use(i18n)
  app.use(createPinia())
  useLocaleStore()
  app.mount(`#app`)

  // Storage 后台初始化，不阻塞 UI 挂载
  initStorage().catch(console.error)
  dismissInitialLoader()
}
