import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, requestPasswordReset } from './authSync'
import { getLocalizedApiErrorMessage } from './authErrors'
import { translations, type Locale } from '@/i18n'

async function catchApiRequestError(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError)
    return error as ApiRequestError
  }

  throw new Error('Expected ApiRequestError.')
}

function translate(locale: Locale) {
  return (key: string) => translations[locale][key] || key
}

describe('authSync password reset errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves mail_unavailable so the auth modal can show a local message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'mail_unavailable',
      message: 'Password reset email is not configured.'
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json'
      }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await catchApiRequestError(requestPasswordReset({
      email: 'test@example.com',
      locale: 'zh'
    }))

    expect(error.status).toBe(503)
    expect(error.code).toBe('mail_unavailable')
    expect(error.message).toBe('Password reset email is not configured.')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/password-reset/request', expect.objectContaining({
      method: 'POST',
      credentials: 'include'
    }))
  })

  it('wraps non-json proxy failures as structured request errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Proxy error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    })))

    const error = await catchApiRequestError(requestPasswordReset({
      email: 'test@example.com',
      locale: 'zh'
    }))

    expect(error.status).toBe(500)
    expect(error.code).toBe('request_failed')
    expect(error.message).toBe('Request failed with HTTP 500.')
  })

  it('wraps fetch rejections as network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await catchApiRequestError(requestPasswordReset({
      email: 'test@example.com',
      locale: 'zh'
    }))

    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.message).toBe('Failed to fetch')
  })
})

describe('localized auth api errors', () => {
  it('localizes account_exists in Chinese and English', () => {
    const error = new ApiRequestError(409, 'account_exists', 'An account with this email already exists.')

    expect(getLocalizedApiErrorMessage(error, translate('zh'), 'auth.failed')).toBe('该邮箱已注册。')
    expect(getLocalizedApiErrorMessage(error, translate('en'), 'auth.failed')).toBe('An account with this email already exists.')
  })

  it('localizes common auth and reset errors by code', () => {
    const t = translate('zh')

    expect(getLocalizedApiErrorMessage(
      new ApiRequestError(401, 'invalid_credentials', 'Email or password is incorrect.'),
      t,
      'auth.failed'
    )).toBe('邮箱或密码不正确。')
    expect(getLocalizedApiErrorMessage(
      new ApiRequestError(400, 'invalid_reset_token', 'Password reset link is invalid or expired.'),
      t,
      'auth.failed'
    )).toBe('重置链接无效或已过期。')
    expect(getLocalizedApiErrorMessage(
      new ApiRequestError(503, 'mail_unavailable', 'Password reset email is not configured.'),
      t,
      'auth.failed'
    )).toBe('密码重置邮件服务暂未配置，请稍后再试或联系站长。')
    expect(getLocalizedApiErrorMessage(
      new ApiRequestError(0, 'network_error', 'Failed to fetch'),
      t,
      'auth.failed'
    )).toBe('网络连接失败，请检查网络后重试。')
  })

  it('localizes structural api errors from mocked callers', () => {
    expect(getLocalizedApiErrorMessage(
      { code: 'invalid_request' },
      translate('zh'),
      'auth.failed'
    )).toBe('请求参数无效，请检查输入后重试。')
  })

  it('falls back to the caller message for unknown error codes', () => {
    const error = new ApiRequestError(418, 'unknown_problem', 'Backend English message.')

    expect(getLocalizedApiErrorMessage(error, translate('zh'), 'auth.failed')).toBe('操作失败')
  })
})
