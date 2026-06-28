import type { CreateShareRequest, CreateShareResponse, ListSharesResponse } from './types'
import type { AccountUser } from '@/services/account/types'
import { ApiError, MdApiClient } from '@/services/account/client'
import { isAccountConfigured, MD_API_URL } from '@/services/account/config'

/** 是否部署在 Netlify 上（本地开发时可通过 VITE_NETLIFY=true 模拟） */
export function isNetlifyMode(): boolean {
  if (import.meta.env.VITE_NETLIFY === `true`)
    return true
  return typeof window !== `undefined` && window.location.hostname.endsWith(`.netlify.app`)
}

export function isShareConfigured(): boolean {
  return isNetlifyMode() || isAccountConfigured()
}

/** 是否为有效 Pro 用户（分享「我的分享」等 Pro 能力） */
export function isShareProUser(user: Pick<AccountUser, `plan` | `planExpiresAt`> | null | undefined): boolean {
  if (!user || user.plan !== `pro`)
    return false
  return user.planExpiresAt != null && user.planExpiresAt > Date.now()
}


/** 是否在 UI 中展示分享入口 */
export function isShareUiEnabled(): boolean {
  const flag = import.meta.env.VITE_SHARE_UI_ENABLED
  if (flag === `false` || flag === `0`)
    return false
  return isShareConfigured()
}

export function getSharePageUrl(id: string): string {
  if (isNetlifyMode()) {
    const origin = typeof window !== `undefined` ? window.location.origin : ``
    return `${origin}/s/${id}`
  }
  return `${MD_API_URL}/s/${id}`
}

/** Netlify 匿名分享客户端（无需登录，调用本地 Function） */
export class NetlifyShareClient {
  async create(payload: CreateShareRequest): Promise<CreateShareResponse> {
    const res = await fetch(`/.netlify/functions/share-create`, {
      method: `POST`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      let message = res.statusText
      try {
        const body = await res.json() as Record<string, unknown>
        if (typeof body?.error === `string`)
          message = body.error
      }
      catch { /* ignore */ }
      throw new ApiError(res.status, message)
    }
    return res.json() as Promise<CreateShareResponse>
  }

  // Netlify 模式不支持 list/revoke（无账户体系）
  async list(): Promise<ListSharesResponse> {
    return { shares: [] }
  }

  async revoke(): Promise<{ ok: true }> {
    return { ok: true }
  }
}

/** doocs 后端分享客户端（需登录） */
export class ShareClient extends MdApiClient {
  list(): Promise<ListSharesResponse> {
    return this.request<ListSharesResponse>(`GET`, `/share`)
  }

  create(payload: CreateShareRequest): Promise<CreateShareResponse> {
    return this.request<CreateShareResponse>(`POST`, `/share`, payload)
  }

  revoke(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`DELETE`, `/share/${id}`)
  }
}

export { ApiError as ShareApiError }
