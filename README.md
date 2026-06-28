<div align="center">

# CC Markdown 编辑器

**基于 [doocs/md](https://github.com/doocs/md) 二次开发的微信 Markdown 编辑器**

</div>

## 项目介绍

本项目基于 [doocs/md](https://github.com/doocs/md) 进行了大量二次开发与优化，在原有功能基础上，重点改进了 AI 辅助写作体验、公众号排版兼容性、主题系统和交互设计。

只需掌握基本的 Markdown 语法，即可生成样式简洁、美观大方的微信图文。

## 核心改动

### AI 浮动面板

- 将原来的对话框式 AI 助手替换为**可拖拽、可调整大小的浮动面板**
- 支持面板位置记忆，再次打开时恢复上次位置
- 侧边栏点击直接打开面板，定位到编辑器旁边
- AI 配置以滑出式侧边面板呈现，不遮挡对话区域

### AI 预设系统

- **两种预设类型**：自动上下文（自动注入日期时间、编辑器内容）和手动引用（用户自选文本）
- 支持用户自定义预设的增删改查
- 预设与 AI 配置整合为标签页，统一管理

### AI 对话增强

- 支持**撤回并重新编辑**用户消息，AI 重新生成回复
- 支持复制用户消息
- 编辑器中选中文本自动填充到 AI 面板作为上下文引用
- AI 面板底部显示当前文档名称
- 优化系统提示词，防止 AI 身份幻觉

### 主题系统重构

- 新增**水墨（ink）** 和**报纸（newspaper）** 主题
- 重新设计 12 色调色板，包含克莱因蓝、公文红等潮流色彩
- 新增**背景图案系统**：网格、圆点、横线、竖线四种图案，可与颜色自由组合
- 每个主题独立的背景默认配置
- 深色模式自动调亮主题色以保证可读性
- 优化 grace/simple 主题的标题样式

### 公众号排版兼容性（大量修复）

- **列表处理**：彻底解决公众号列表重复圆点、序号全变 1 的问题，转换为纯文本段落并保留行内格式
- **引用块**：超过 300 字的 blockquote 转为 div，避免公众号报错
- **分隔线**：硬编码颜色（CSS 变量在公众号不生效），调整间距
- **CSS 变量**：替换 var() 值后再内联，确保主题色正确渲染
- **伪元素处理**：::after / ::before / ::first-letter 转为真实 HTML 元素
- **段落间距**：统一优化为 0.5em
- **列表缩进**：padding-left 统一使用 0.5em，避免过大缩进

### 交互优化

- 菜单栏添加**内容管理**图标，一键开关内容管理面板
- 图片上传按钮提升到菜单栏同级
- 优化草稿箱与菜单栏的交互体验
- 优化右侧滑块面板的初始化与样式

## 功能特性

- 支持标准 Markdown 语法及数学公式（KaTeX）
- 支持 Mermaid 图表、PlantUML、GFM 警告块
- 支持 Ruby 注音扩展，格式兼容 `[文字]{注音}` 与 `[文字]^(注音)`
- 代码块提供多种高亮主题，可自定义主题色与 CSS 样式
- 内置本地草稿管理，支持内容自动保存
- 支持多种图床（GitHub、阿里云、腾讯云、七牛云、MinIO、S3、Cloudflare R2 等）
- 支持文件导入与导出
- 集成主流 AI 模型（DeepSeek、OpenAI、通义千问、腾讯混元、火山方舟、302.AI 等），辅助内容创作

## 支持的图床服务

| #   | 图床                                                   | 使用时是否需要配置                                                         | 备注                                                                                   |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | 默认                                                   | 否                                                                         | -                                                                                      |
| 2   | [GitHub](https://github.com)                           | 配置 `Repo`、`Token` 参数                                                  | [如何获取 GitHub token？](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) |
| 3   | [阿里云](https://www.aliyun.com/product/oss)           | 配置 `AccessKey ID`、`AccessKey Secret`、`Bucket`、`Region` 参数           | [如何使用阿里云 OSS？](https://help.aliyun.com/document_detail/31883.html)             |
| 4   | [腾讯云](https://cloud.tencent.com/act/pro/cos)        | 配置 `SecretId`、`SecretKey`、`Bucket`、`Region` 参数                      | [如何使用腾讯云 COS？](https://cloud.tencent.com/document/product/436/38484)           |
| 5   | [七牛云](https://www.qiniu.com/products/kodo)          | 配置 `AccessKey`、`SecretKey`、`Bucket`、`Domain`、`Region` 参数           | [如何使用七牛云 Kodo？](https://developer.qiniu.com/kodo)                              |
| 6   | [MinIO](https://min.io/)                               | 配置 `Endpoint`、`Port`、`UseSSL`、`Bucket`、`AccessKey`、`SecretKey` 参数 | [如何使用 MinIO？](http://docs.minio.org.cn/docs/master/)                              |
| 7   | [S3 协议](https://aws.amazon.com/s3/)                  | 配置 `Endpoint`、`Region`、`Bucket`、`AccessKey`、`SecretKey` 参数         | 支持 AWS S3、Oracle、DigitalOcean 等兼容 S3 的存储服务                                 |
| 8   | [公众号](https://mp.weixin.qq.com/)                    | 配置 `appID`、`appsecret`、`代理域名` 参数                                 | [如何使用公众号图床？](https://md-pages.doocs.org/tutorial)                            |
| 9   | [Cloudflare R2](https://developers.cloudflare.com/r2/) | 配置 `AccountId`、`AccessKey`、`SecretKey`、`Bucket`、`Domain` 参数        | [如何使用 S3 API 操作 R2？](https://developers.cloudflare.com/r2/api/s3/api/)          |
| 10  | [又拍云](https://www.upyun.com/)                       | 配置 `Bucket`、`Operator`、`Password`、`Domain` 参数                       | [如何使用 又拍云？](https://help.upyun.com/)                                           |
| 11  | [Telegram](https://core.telegram.org/api)              | 配置 `Bot Token`、`Chat ID` 参数                                           | [如何使用 Telegram 图床？](docs/telegram-usage.md)                                     |
| 12  | [Cloudinary](https://cloudinary.com/)                  | 配置 `Cloud Name`、`API Key`、`API Secret` 参数                            | [如何使用 Cloudinary？](https://cloudinary.com/documentation/upload_images)            |
| 13  | 自定义上传                                             | 是                                                                         | [如何自定义上传？](/docs/custom-upload.md)                                             |

## 开发与部署

```sh
# 安装 Node 版本
nvm i && nvm use

# 安装依赖
pnpm i

# 启动开发模式，访问 http://localhost:5173/md/
pnpm web dev

# 构建，部署在 /md 路径下
pnpm web build

# 构建，部署在根路径下
pnpm web build:h5-netlify

# Chrome 扩展开发模式
# 启动后在 chrome://extensions/ 开启开发者模式，加载 apps/web/.output/chrome-mv3-dev 目录
pnpm web ext:dev

# 打包 Chrome 扩展
pnpm web ext:zip

# 打包 Firefox 扩展，输出至 apps/web/.output/md-{version}-firefox.zip
pnpm web firefox:zip

# 打包 uTools 插件，输出至 apps/utools/release/md-utools-v{version}.zip
pnpm utools:package

# Cloudflare Workers 开发与部署
pnpm web wrangler:dev
pnpm web wrangler:deploy
```

## 致谢

本项目基于 [doocs/md](https://github.com/doocs/md) 开发，感谢原作者和所有贡献者的优秀工作。
