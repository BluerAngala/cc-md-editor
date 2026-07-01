/**
 * GitHub API 客户端 — 直接读写用户专属仓库
 * 不需要后端，用 Personal Access Token 鉴权
 */

const GITHUB_API = 'https://api.github.com'
const REPO_NAME = 'cc-md-editor-data'
const REPO_DESC = 'CC Markdown Editor 数据仓库（自动创建，请勿手动修改）'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface AccessTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GitHubFile {
  name: string
  path: string
  sha: string
  content: string
  size: number
}

interface GitHubRepo {
  full_name: string
  private: boolean
}

export class GitHubSyncClient {
  constructor(private getToken: () => string | null) {}

  private get token(): string | null {
    return this.getToken()
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token)
      throw new Error('未配置 GitHub Token')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
    }
    if (body !== undefined)
      headers['Content-Type'] = 'application/json'

    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as Record<string, unknown>
      throw new Error(`GitHub API ${res.status}: ${(errBody.message as string) || res.statusText}`)
    }

    if (res.status === 204)
      return undefined as T

    return res.json() as Promise<T>
  }

  /** 发起 Device Flow 授权 */
  static async startDeviceFlow(): Promise<DeviceCodeResponse> {
    const res = await fetch('/.netlify/functions/github-device-flow?action=device_code', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>
      throw new Error(body.error || `Device Flow 启动失败: ${res.status}`)
    }

    return res.json() as Promise<DeviceCodeResponse>
  }

  /** 轮询等待用户授权完成 */
  static async pollForToken(deviceCode: string, interval: number): Promise<string> {
    const { promise, resolve, reject } = Promise.withResolvers<string>()
    const poll = async () => {
      try {
        const res = await fetch('/.netlify/functions/github-device-flow?action=access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ device_code: deviceCode }),
        })
        const data = await res.json() as AccessTokenResponse

        if (data.access_token) {
          resolve(data.access_token)
          return
        }
        if (data.error === 'authorization_pending' || data.error === 'slow_down') {
          setTimeout(poll, (interval + 1) * 1000)
          return
        }
        reject(new Error(data.error_description || data.error || '授权失败'))
      }
      catch (e) {
        reject(e)
      }
    }
    setTimeout(poll, interval * 1000)
    return promise
  }

  /** 获取当前用户名 */
  async getUsername(): Promise<string> {
    const user = await this.request<{ login: string }>(`GET`, `/user`)
    return user.login
  }

  /** 确保专属仓库存在，不存在则创建 */
  async ensureRepo(): Promise<string> {
    const username = await this.getUsername()
    const fullName = `${username}/${REPO_NAME}`

    try {
      await this.request<GitHubRepo>(`GET`, `/repos/${fullName}`)
      return fullName
    }
    catch {
      // 仓库不存在，创建
      await this.request<GitHubRepo>(`POST`, `/user/repos`, {
        name: REPO_NAME,
        description: REPO_DESC,
        private: true,
        auto_init: true,
      })
      return fullName
    }
  }

  /** 列出目录下的文件 */
  async listFiles(repo: string, path: string): Promise<GitHubFile[]> {
    try {
      const files = await this.request<GitHubFile[] | GitHubFile>(`GET`, `/repos/${repo}/contents/${path}`)
      return Array.isArray(files) ? files : [files]
    }
    catch {
      return []
    }
  }

  /** 读取文件内容 */
  async readFile(repo: string, path: string): Promise<{ content: string, sha: string } | null> {
    try {
      const file = await this.request<GitHubFile>(`GET`, `/repos/${repo}/contents/${path}`)
      // GitHub API 返回 base4 编码的内容
      const content = atob(file.content.replace(/\n/g, ``))
      return { content, sha: file.sha }
    }
    catch {
      return null
    }
  }

  /** 创建或更新文件 */
  async writeFile(repo: string, path: string, content: string, message: string, sha?: string): Promise<void> {
    const body: Record<string, string> = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
    }
    if (sha)
      body.sha = sha

    await this.request(`PUT`, `/repos/${repo}/contents/${path}`, body)
  }

  /** 删除文件 */
  async deleteFile(repo: string, path: string, message: string, sha: string): Promise<void> {
    await this.request(`DELETE`, `/repos/${repo}/contents/${path}`, { message, sha })
  }
}
