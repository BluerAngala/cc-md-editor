<div align="center">

# CC Markdown Editor

**A WeChat Markdown editor forked from [doocs/md](https://github.com/doocs/md)**

</div>

## Overview

This project is a heavily customized fork of [doocs/md](https://github.com/doocs/md), with major improvements to the AI writing assistant, WeChat compatibility, theme system, and overall interaction design.

Standard Markdown syntax is all you need to produce clean, well-styled WeChat articles.

## Key Changes

### Floating AI Panel

- Replaced the dialog-based AI assistant with a **draggable, resizable floating panel**
- Panel position is remembered and restored on reopen
- Sidebar click opens the panel directly next to the editor
- AI configuration slides out as a side panel without blocking the chat area

### AI Preset System

- **Two preset types**: auto-context (injects date/time, editor content automatically) and manual reference (user-selected text)
- Full CRUD for user-defined presets
- Presets and AI config unified into a tabbed panel

### Enhanced AI Chat

- **Recall and re-edit** user messages; AI regenerates its response
- Copy button for user messages
- Selected text in the editor auto-fills the AI panel as a context reference
- Current document name displayed at the bottom of the AI panel
- Improved system prompt to prevent AI identity hallucination

### Theme System Overhaul

- New **Ink** and **Newspaper** themes
- Redesigned 12-color palette featuring Klein Blue, Official Red, and other trendy colors
- **Background pattern system**: grid, dots, horizontal lines, vertical lines — each combinable with colors
- Per-theme default background configuration
- Dark mode auto-lightens theme colors for readability
- Refined heading styles for grace/simple themes

### WeChat Clipboard Compatibility (Extensive Fixes)

- **Lists**: Eliminated duplicate bullets and broken numbering; converts to plain paragraphs preserving inline formatting
- **Blockquotes**: Blockquotes exceeding 300 characters converted to `div` to avoid WeChat errors
- **Horizontal rules**: Hardcoded color (CSS variables don't resolve in WeChat); adjusted spacing
- **CSS variables**: Replaces `var()` values before inlining to ensure correct theme colors
- **Pseudo-elements**: `::after` / `::before` / `::first-letter` converted to real HTML elements
- **Paragraph spacing**: Unified to `0.5em`
- **List indentation**: `padding-left` standardized to `0.5em`

### Interaction Improvements

- **Content management** icon in the menu bar for quick toggle
- Image upload button promoted to menu bar level
- Optimized draft box and menu bar interactions
- Improved right slider panel initialization and styling

## Features

- Standard Markdown syntax and math formulas (KaTeX)
- Mermaid diagrams, PlantUML, and GFM alert blocks
- Ruby annotation extension: `[text]{ruby}` and `[text]^(ruby)` formats
- Multiple code highlight themes; customizable theme colors and CSS
- Local draft management with auto-save
- Multiple image hosting options (GitHub, Alibaba Cloud OSS, Tencent COS, Qiniu, MinIO, S3, Cloudflare R2, and more)
- File import and export
- AI assistant integration (DeepSeek, OpenAI, Tongyi Qianwen, Tencent Hunyuan, Volcengine, 302.AI, etc.)

## Supported Image Hosts

| #   | Service                                                 | Configuration required                                           | Notes                                                                                                                    |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Default                                                 | No                                                               | -                                                                                                                        |
| 2   | [GitHub](https://github.com)                            | `Repo`, `Token`                                                  | [How to get a GitHub token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) |
| 3   | [Alibaba Cloud OSS](https://www.aliyun.com/product/oss) | `AccessKey ID`, `AccessKey Secret`, `Bucket`, `Region`           | [Docs](https://help.aliyun.com/document_detail/31883.html)                                                               |
| 4   | [Tencent COS](https://cloud.tencent.com/act/pro/cos)    | `SecretId`, `SecretKey`, `Bucket`, `Region`                      | [Docs](https://cloud.tencent.com/document/product/436/38484)                                                             |
| 5   | [Qiniu Kodo](https://www.qiniu.com/products/kodo)       | `AccessKey`, `SecretKey`, `Bucket`, `Domain`, `Region`           | [Docs](https://developer.qiniu.com/kodo)                                                                                 |
| 6   | [MinIO](https://min.io/)                                | `Endpoint`, `Port`, `UseSSL`, `Bucket`, `AccessKey`, `SecretKey` | [Docs](http://docs.minio.org.cn/docs/master/)                                                                            |
| 7   | [S3-compatible](https://aws.amazon.com/s3/)             | `Endpoint`, `Region`, `Bucket`, `AccessKey`, `SecretKey`         | Supports AWS S3, Oracle, DigitalOcean, and other S3-compatible storage                                                   |
| 8   | [WeChat Official Account](https://mp.weixin.qq.com/)    | `appID`, `appsecret`, proxy domain                               | [Tutorial](https://md-pages.doocs.org/tutorial)                                                                          |
| 9   | [Cloudflare R2](https://developers.cloudflare.com/r2/)  | `AccountId`, `AccessKey`, `SecretKey`, `Bucket`, `Domain`        | [S3 API docs](https://developers.cloudflare.com/r2/api/s3/api/)                                                          |
| 10  | [Upyun](https://www.upyun.com/)                         | `Bucket`, `Operator`, `Password`, `Domain`                       | [Docs](https://help.upyun.com/)                                                                                          |
| 11  | [Telegram](https://core.telegram.org/api)               | `Bot Token`, `Chat ID`                                           | [Usage guide](docs/telegram-usage.md)                                                                                    |
| 12  | [Cloudinary](https://cloudinary.com/)                   | `Cloud Name`, `API Key`, `API Secret`                            | [Docs](https://cloudinary.com/documentation/upload_images)                                                               |
| 13  | Custom upload                                           | Yes                                                              | [How to configure](/docs/custom-upload.md)                                                                               |

## Development & Build

```sh
# Install the required Node version
nvm i && nvm use

# Install dependencies
pnpm i

# Start the dev server, available at http://localhost:5173/md/
pnpm web dev

# Production build, served under /md/
pnpm web build

# Production build, served at the root path
pnpm web build:h5-netlify

# Chrome extension dev mode
# After starting, open chrome://extensions/, enable Developer mode,
# then load the unpacked extension from apps/web/.output/chrome-mv3-dev
pnpm web ext:dev

# Package the Chrome extension
pnpm web ext:zip

# Package the Firefox extension — output: apps/web/.output/md-{version}-firefox.zip
pnpm web firefox:zip

# Package the uTools plugin — output: apps/utools/release/md-utools-v{version}.zip
pnpm utools:package

# Cloudflare Workers development and deployment
pnpm web wrangler:dev
pnpm web wrangler:deploy
```

## Acknowledgments

This project is based on [doocs/md](https://github.com/doocs/md). Thanks to the original authors and all contributors for their excellent work.
