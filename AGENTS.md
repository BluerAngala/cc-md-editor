# Repository Guidelines

本文件为 AI Agent（Claude Code、OpenCode、Cursor、Copilot 等）在本仓库中工作时提供统一入口。

## 项目概览

**cc-md-editor** — 基于 [doocs/md](https://github.com/doocs/md) 二次开发的微信 Markdown 编辑器，将 Markdown 渲染为微信公众号文章格式。支持自定义主题样式、多图床、AI 助手、浏览器扩展、**简体中文 / English 界面**等特性。

- **在线地址:** https://cc-md-editor.netlify.app
- **GitHub:** https://github.com/BluerAngala/cc-md-editor
- **Node 版本:** >= 22.22.2（`.nvmrc`: v22.22.2）
- **包管理器:** pnpm（monorepo）
- **npm 镜像:** https://registry.npmmirror.com（`.npmrc`）

## Monorepo 结构

| 工作区           | 路径                  | 说明                                                                 |
| ---------------- | --------------------- | -------------------------------------------------------------------- |
| `@md/web`        | `apps/web`            | 主应用，Vue 3 + 浏览器扩展（WXT: Chrome/Firefox）                    |
| `doocs-md`       | `apps/vscode`         | VS Code 扩展（webpack 构建，marketplace ID: `doocs.doocs-md`）       |
| `@md/utools`     | `apps/utools`         | uTools 插件打包                                                      |
| `@md/core`       | `packages/core`       | 核心 Markdown 渲染引擎（marked + 自定义扩展）                        |
| `@md/shared`     | `packages/shared`     | 共享工具函数、配置、类型、编辑器配置                                 |
| `@md/config`     | `packages/config`     | TypeScript 配置基础文件                                              |
| `@doocs/md-cli`  | `packages/md-cli`     | CLI 工具（Express 服务托管构建产物）                                 |
| `@md/mcp-server` | `packages/mcp-server` | MCP 服务，为 AI Agent 暴露接口                                       |
| `@md/api`        | `apps/api`            | 后端 API：账户登录 + 云同步 + 计费（Cloudflare Workers + Hono + D1） |

独立示例（不在 workspace 内）：`docs/examples/wechat-openapi-worker/` — 微信公众号 OpenAPI 代理 Worker。

## 常用命令

### 根目录

```bash
pnpm install          # 安装所有依赖
pnpm start            # 等同于 `pnpm web dev`
pnpm run lint         # ESLint --fix 全项目检查
pnpm run type-check   # vue-tsc 类型检查（web + packages）
pnpm run test         # 运行所有测试（core + web）
pnpm run build:cli    # 构建 web + 复制到 md-cli + npm pack
pnpm run release:cli  # 通过 scripts/release.js 发布 CLI
pnpm utools:package   # 打包 uTools 插件
pnpm run inspector    # node-modules-inspector 查看依赖树
pnpm link-claude-skills  # 链接 .claude/skills → .agents/skills
```

### Web 应用 (`@md/web`)

```bash
pnpm web dev          # 启动 Vite 开发服务器
pnpm web build        # 生产构建 + 类型检查
pnpm web build:h5-netlify   # 构建用于 Netlify 根目录部署
pnpm web build:analyze      # 构建并生成 rollup-plugin-visualizer 分析
pnpm web ext:dev      # WXT Chrome 扩展开发模式
pnpm web ext:zip      # 打包 Chrome 扩展
pnpm web firefox:dev  # WXT Firefox 扩展开发模式
pnpm web firefox:zip  # 打包 Firefox 扩展
pnpm web wrangler:dev    # Cloudflare Workers 开发
pnpm web wrangler:deploy   # Cloudflare Workers 部署
pnpm web test         # vitest run（web 测试）
pnpm web test:watch   # vitest 监听模式
```

### VSCode 扩展

```bash
pnpm vscode compile   # webpack 编译
pnpm vscode watch     # webpack 监听
pnpm vscode build     # 生产 webpack 构建
pnpm vscode package   # vsce 打包
```

### CLI & MCP

```bash
pnpm cli <cmd>        # 在 @doocs/md-cli 中执行命令
pnpm mcp <cmd>        # 在 @md/mcp-server 中执行命令（render_markdown 等 MCP 工具）
pnpm mcp dev          # MCP Server 监听模式
```

`@md/mcp-server` 通过 stdio 暴露 `render_markdown`、`list_themes`、`list_colors` 等工具，配置见 [packages/mcp-server/README.md](./packages/mcp-server/README.md)、[`.vscode/mcp.json`](./.vscode/mcp.json) 与 [`.cursor/mcp.json`](./.cursor/mcp.json)。

## 架构

### 数据流

```
CodeMirror 编辑器 → debounce → post store (Pinia) → @md/core renderer
  → marked + 13 个自定义扩展 → juice 内联 CSS → DOMPurify 净化
  → 主题 CSS 变量注入 → 预览面板 DOM
```

持久化链：`reactive ref → watch() → StorageManager → IndexedDB`（带 localStorage 降级）。

### 渲染管线

1. `@md/core` 封装 `marked`，实现自定义扩展（Mermaid、PlantUML、Ruby、KaTeX、TOC、alert 块、infographic、slider、markup、脚注、自定义组件）
2. `juice` 内联 CSS 以兼容微信
3. `isomorphic-dompurify` 净化输出
4. 主题系统（`@md/core/src/theme/`）注入 CSS 变量

### 构建系统

- **`@md/core` 和 `@md/shared` 直接导出 TypeScript 源码**（不预构建）。由消费方的构建工具（Vite/webpack）编译。
- Web 应用使用 Vite 8，VSCode 扩展使用 webpack，浏览器扩展使用 WXT

### 样式与主题

- Web 应用使用 Tailwind CSS 4 + PostCSS
- 主题 CSS 文件位于 `packages/shared/src/configs/theme-css/`（default.css、grace.css、simple.css）
- 部分主题文件使用 Less

### WeChat (公众号) 兼容性

复制到公众号后台时，CSS 通过 juice 内联。**公众号编辑器不支持以下 CSS 特性**，主题开发时必须注意：

- **`::after` / `::before` 伪元素** — 公众号会完全剥离。`content` 属性中的 unicode 转义（如 `\25A0`）会被 juice 拆成乱码。需要在 `apps/web/src/services/export/clipboard.ts` 的 `processPseudoElementsForWeChat()` 中转成真正的 HTML 元素。
- **`::first-letter` 伪元素** — 公众号不支持。需要在 `processFirstLetterForWeChat()` 中转成 `<span>` 包裹首字。
- **`display: inline-block` + `margin: auto`** — 不会水平居中。需要改成 `display: block; width: fit-content; margin-left: auto; margin-right: auto`。
- **CSS 变量（`var(--xxx)`）** — juice 的 `resolveCSSVariables: false`，不解析变量。复制流程中通过字符串替换手动处理关键变量。
- **`hsl(var(--foreground))`** — 替换为 `#3f3f3f`。
- **`<blockquote>` 超 300 字** — 公众号会报"不合理引用"错误。复制时将 `<blockquote>` 转为 `<div>`（样式已由 juice 内联）。
- **`<ul>/<ol>/<li>`** — 公众号渲染有 bug（重复圆点、序号全变 1）。复制时转为纯文本 `<p>` 段落。
- **列表 `padding-left`** — 主题 CSS 统一使用 `0.5em`，避免缩进过大。

**新增主题时**，如果使用了伪元素（`::after`、`::before`、`::first-letter`），必须在 `clipboard.ts` 中添加对应的公众号兼容处理，否则复制后效果丢失。

### 存储架构

- **StorageManager**（`apps/web/src/storage/manager.ts`）：`reactive<T>()` 创建自动持久化的 Vue Ref，通过 `watch()` 落盘
- **引擎**：IndexedDB（主，带预加载缓存）、localStorage（降级）、RESTful（远程）
- **数据库 schema**（`apps/web/src/storage/db.ts`）：documents、settings、secrets、cache、meta 五个 object store
- **文档仓库**（`apps/web/src/storage/repositories/documents.ts`）：序列化写入 IndexedDB，带 legacy fallback
- **云同步**（`apps/web/src/stores/sync.ts`）：LWW 策略，push/pull 状态机，cursor 追踪，auto-sync debounce；详见 [docs/cloud-sync.md](./docs/cloud-sync.md)

### 状态管理

约 18 个 Pinia store，按领域划分，位于 `apps/web/src/stores/`：`useEditorStore`（CodeMirror 实例）、`useRenderStore`（渲染管线）、`useThemeStore`（主题设置）、`useUiStore`（暗色模式/视图/对话框）、`usePostStore`（文档 CRUD + 持久化）、`useSyncStore`（云同步）、`useCustomComponentStore`（自定义组件）、`useLocaleStore`（i18n）等。

- UI 组件遵循 Shadcn-Vue 模式，位于 `apps/web/src/components/ui`
- 跨 feature 通用组件位于 `apps/web/src/components/shared`
- 架构详情见 [docs/architecture.md](./docs/architecture.md)

### 国际化（i18n，`@md/web`）

Web 主应用与部分浏览器扩展 UI 支持 **zh-CN**、**en-US**；VS Code 扩展、uTools、CLI、MCP **未**国际化。

- **库**：`vue-i18n`（composition API，`legacy: false`），在 `apps/web/vite.config.ts` 中通过 `unplugin-auto-import` 自动导入 `useI18n`
- **文案**：`apps/web/src/i18n/messages/{zh-CN,en-US}/`（`common`、`editor`、`dialog`、`store`、`ai`、`upload`、`chrome`）
- **组件内**：`useI18n()` + `t('key')`；**Store / 工具函数**：`@/i18n/translate` 的 `t()` / `getLocale()` / `formatLocalDateTime()`
- **语言状态**：`useLocaleStore`（持久化 key：`locale`）；用户可在 **偏好设置**（`Ctrl+,`）→ General 切换
- **启动**：`await initStorage()` → `setupI18n(detectInitialLocale())` → Pinia → `useLocaleStore()`（见 `apps/web/src/bootstrap.ts`）；`index.html` 启动屏从 `localStorage` 读取 locale
- **云同步**：`locale` 在 `SYNC_SETTING_KEYS` 中，远端应用后由 `hydrateSyncedSettings` 热更新
- **约定**：新增用户可见文案须同时维护 zh-CN 与 en-US；在 computed 中调用 `t()` 且需随语言切换更新时，应依赖 `locale`（例如 `void locale.value`）

### 环境变量

环境变量以 `VITE_` 或 `CF_` 为前缀（`apps/web/vite.config.ts` 的 `envPrefix`）：

| 文件 | 用途 |
| --- | --- |
| `apps/web/.env` | 默认开发环境：本地 API `localhost:8787`，同步 UI 禁用 |
| `apps/web/.env.production` | 生产环境：`md-api.doocs.org`，账户 + 同步 UI 启用 |
| `apps/web/.env.utools` | uTools 环境：所有云功能禁用 |
关键变量：`VITE_MD_API_URL`（API 地址）、`VITE_SYNC_API_URL`（同步 API）、`VITE_NETLIFY`（设为 `true` 可在本地模拟 Netlify 模式，启用匿名分享预览）、`VITE_VUE_DEVTOOLS`（开发工具）。

**Netlify 部署**：使用 `pnpm web build:h5-netlify` 构建，然后 `netlify deploy --prod --dir=dist --no-build` 部署。分享预览功能通过 Netlify Functions + Blobs 实现，详见下方「Netlify 分享预览系统」章节。

## 代码约定与常见模式

### 自动导入（`apps/web`）

通过 `unplugin-auto-import` 和 `unplugin-vue-components` 实现，**无需手动导入**：

- **自动导入的 API 来源：** `vue`、`pinia`、`@vueuse/core`、`vue-i18n`
- **自动导入的目录：** `./src/stores`（所有 Pinia store）、`./src/lib/toast`、`./src/composables`
- **自动注册的组件：** `apps/web/src/components/ui/` 下的 Shadcn-Vue 组件

这意味着在 `apps/web/src/` 中可以直接使用 `ref()`、`computed()`、`defineStore()`、`useI18n()`、`useEditorStore()` 等而无需 import 语句。但 `@md/core` 和 `@md/shared` 中的代码**没有**自动导入，需要显式 import。

### Pinia Store 模式

Store 使用 Composition API 风格：

```ts
export const useEditorStore = defineStore(`editor`, () => {
  const editor = ref<EditorView | null>(null)
  // ...state, actions
  return { editor, ... }
})
```

- Store ID 使用反引号字符串：`` defineStore(`editor`, ``
- 返回值是解构友好的对象

### 字符串约定

项目 **不使用分号**，字符串偏好 **反引号**（`` ` ``）而非单/双引号，与 ESLint `@antfu/eslint-config` 一致。

### 路径别名

`@` 映射到 `src/` 目录，在 Vite、Vitest、TypeScript 中统一配置：

```ts
import { something } from '@/stores/editor'
```

### 模块导出模式

`@md/core` 和 `@md/shared` 通过桶文件（barrel exports）导出：

```ts
// packages/core/src/index.ts
export * from './extensions'
export * from './renderer'
export * from './theme'
export * from './utils'
```

`@md/core` 还支持子路径导入：`@md/core/renderer`、`@md/core/extensions`、`@md/core/theme`、`@md/core/utils`。

## 重要文件与入口点

### Web 应用入口

| 文件 | 用途 |
| --- | --- |
| `apps/web/src/main.ts` | 主入口：加载样式 → `bootstrap()` |
| `apps/web/src/bootstrap.ts` | 启动序列：`initStorage()` → i18n → Pinia → 挂载 Vue |
| `apps/web/src/App.vue` | 根组件 |
| `apps/web/src/sidepanel.ts` | 浏览器扩展 SidePanel 入口 |

### 浏览器扩展入口（WXT）

| 文件 | 用途 |
| --- | --- |
| `apps/web/src/entrypoints/background.ts` | Service Worker 后台脚本 |
| `apps/web/src/entrypoints/injected.ts` | 注入到目标页面的脚本 |
| `apps/web/src/entrypoints/appmsg.content.ts` | 微信公众号编辑器页面内容脚本 |
| `apps/web/src/entrypoints/popup/` | 扩展弹窗 |

### 包入口

| 文件 | 用途 |
| --- | --- |
| `packages/core/src/index.ts` | 导出 extensions、renderer、theme、utils |
| `packages/shared/src/index.ts` | 导出 assets、configs、constants、editor、types、utils |

### 配置文件

| 文件 | 用途 |
| --- | --- |
| `apps/web/vite.config.ts` | Web 构建配置（Vite 8 + Tailwind + 自动导入 + Cloudflare） |
| `apps/web/wxt.config.ts` | 浏览器扩展配置（Chrome/Firefox manifest） |
| `apps/web/tsconfig.json` | Web TypeScript 配置 |
| `packages/config/tsconfig.base.json` | 共享 TypeScript 基础配置 |
| `eslint.config.mjs` | 全项目 ESLint 配置 |
| `.husky/pre-commit` | Git pre-commit 钩子（lint-staged） |
| `apps/api/wrangler.toml` | Cloudflare Workers 配置（D1 数据库、自定义域名、CORS） |
| `netlify.toml` | 根目录 Netlify 配置（functions 路径指向 `apps/web/netlify/functions`） |
| `apps/web/netlify.toml` | Web 应用 Netlify 配置（build command、SPA 重定向） |

### Netlify 分享预览系统

部署到 Netlify 时，分享预览功能使用 Netlify Functions + Blobs 实现，无需依赖 doocs 后端：

| 文件 | 用途 |
| --- | --- |
| `apps/web/netlify/functions/share-create.ts` | POST 端点：接收 HTML 快照，存入 Blobs，返回短 ID |
| `apps/web/netlify/functions/share-get.ts` | GET 端点：根据 ID 读取 Blobs，渲染完整分享页面 |
| `apps/web/src/services/share/client.ts` | 客户端：`isNetlifyMode()` 检测 + `NetlifyShareClient` 匿名调用 |
| `apps/web/src/components/editor/editor-header/ShareDialog.vue` | 对话框：Netlify 模式跳过登录，直接调用 Function |

**向后兼容**：非 Netlify 部署（有 `VITE_SYNC_API_URL`）仍走 doocs 后端的 `ShareClient`。`isNetlifyMode()` 通过 `location.hostname` 检测 `.netlify.app` 域名，本地开发可通过 `VITE_NETLIFY=true` 模拟。

**路由**：根目录 `netlify.toml` 配置 `[[redirects]]` 将 `/s/:id` 路由到 `share-get` Function，访问者通过短链接查看分享内容。

**存储**：Netlify Blobs 存储 HTML 快照（`bodyHtml` + `stylesHtml`），免费额度 5GB。

## Lint 与格式化

- **ESLint:** `@antfu/eslint-config` + Vue + TypeScript + formatter
- **Prettier:** 固定版本 `2.8.8`（通过 `pnpm-workspace.yaml` 的 `overrides` 强制）
- **Pre-commit 钩子:** `lint-staged` 对所有文件执行 `eslint --fix`
- 规则：不使用分号，关闭 `no-unused-vars`、`no-console`、`no-debugger`

## 依赖管理

这是一个 pnpm monorepo，`pnpm-workspace.yaml` 中包含大量安全覆盖（overrides）。

### 升级依赖

1. **Prettier 必须固定在 `2.8.8`** — 通过 `pnpm-workspace.yaml` 的 `overrides.prettier` 强制
2. **Patch 文件：** 如果打了 patch 的依赖升级了，必须同步更新 `patches/` 中对应的 patch 文件：
   - `@codemirror/view` → `patches/@codemirror__view@6.43.1.patch`（导出 `MeasureRequest` 接口，修复 macOS 上 Alt+Shift 快捷键处理）
   - `juice` → `patches/juice@12.1.0.patch`（为 `parseCSS` 返回值增加空值检查）
3. 更新 `pnpm-workspace.yaml` 中的 `patchedDependencies` 以匹配新版本
4. 运行 `pnpm install` 重新生成 `pnpm-lock.yaml`

### 安全覆盖

`pnpm-workspace.yaml` 的 `overrides` 部分强制了存在漏洞的间接依赖的最低版本（ajv、dompurify、undici、minimatch 等）。除非上游已修复漏洞，否则不要移除这些覆盖。

### allowBuilds

`pnpm-workspace.yaml` 包含 `allowBuilds` 列表，用于需要原生构建脚本的依赖（`esbuild`、`sharp`、`keytar`、`workerd` 等）。新增需要原生构建的依赖可能需要添加到此列表。

## 测试与 QA

### 框架

- **Vitest** 是唯一的测试框架（无 E2E 框架，无 Playwright/Cypress 配置）
- `@md/core` 使用 `jsdom` 环境，`@md/web` 使用 `node` 环境
- 测试文件命名：`*.test.ts`，与源文件同目录（无 `__tests__/` 目录）

### 运行测试

```bash
pnpm run test         # 运行全部（core + web）
pnpm --filter @md/core test   # 仅 core 包
pnpm web test         # 仅 web 应用
pnpm web test:watch   # web 监听模式
```

### 测试覆盖范围

测试聚焦于纯函数单元测试和关键集成测试，共约 13 个测试文件：

- **`packages/core/src/`：** 渲染器集成测试、SVG 缓存、异步图表状态、HTML 转义工具、数学公式检测、图表主题
- **`apps/web/src/`：** 浏览器扩展检测、WeChat SVG 净化、标题导航、标题提取、预览就绪检测、对话框焦点管理

### 约定

- 测试简洁，无外部 mock 框架，使用内联 helper
- 无 coverage 配置（无 istanbul/c8）
- 新增关键逻辑应附带 `*.test.ts` 文件

## 运行时与工具链

| 维度 | 选择 |
| --- | --- |
| 运行时 | Node >= 22.22.2（`.nvmrc`） |
| 包管理器 | pnpm（monorepo workspace） |
| 类型系统 | TypeScript ~6.0.3 |
| Web 构建 | Vite 8 |
| 扩展构建 | WXT（Chrome + Firefox） |
| VSCode 构建 | webpack |
| CSS | Tailwind CSS 4 + PostCSS + Less（主题文件） |
| 状态管理 | Pinia 3 |
| UI 组件 | Shadcn-Vue（`reka-ui` 底层） |
| Markdown | `marked` 18 + 自定义扩展 |
| 代码编辑器 | CodeMirror 6 |

## Git 规范

- **提交信息:** 遵循 Conventional Commits（`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`chore`），**一律使用英文**
- **分支命名:** `feat/description`、`fix/description`
- **贡献指南:** [CONTRIBUTING.md](./CONTRIBUTING.md)

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/architecture.md](./docs/architecture.md) | 完整架构概览：渲染管线、目录约定、Pinia store、云同步、本地存储 |
| [docs/cloud-sync.md](./docs/cloud-sync.md) | 云同步策略：LWW、同步/非同步偏好、安全说明 |
| [docs/custom-upload.md](./docs/custom-upload.md) | 自定义图床提供商 |
| [docs/mp-card.md](./docs/mp-card.md) | 微信公众号名片插入 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本历史 v1.6.0 – v2.1.0 |

## 部署

- **GitHub Pages + Cloudflare Workers**：`.github/workflows/deploy.yml` 双部署
- **Docker**：`scripts/build-*.sh` 构建多架构镜像
- **Zeabur**：`zbpack.json` 配置
- **Netlify**：`pnpm web build:h5-netlify`
- **uTools**：`pnpm utools:package`

## Skills

Reusable workflows live in [`.agents/skills/`](./.agents/skills/) (canonical). Claude Code reads the same files via `.claude/skills` → `.agents/skills`.

After clone, create the link once:

```bash
# macOS / Linux / Git Bash
./scripts/link-claude-skills.sh

# Windows PowerShell
./scripts/link-claude-skills.ps1
```

| Skill        | When to use                                                                           |
| ------------ | ------------------------------------------------------------------------------------- |
| `git-commit` | Commit changes with Conventional Commits (`/git-commit` or "commit my changes")       |
| `create-pr`  | Create a GitHub pull request (`/create-pr` or "open a PR")                            |
| `wechat-svg` | WeChat SVG whitelist, bubbling-group interaction, paste compatibility (`/wechat-svg`) |

Invoke manually: `/skill-name` in Cursor or Claude Code; OpenCode uses the `skill` tool.
