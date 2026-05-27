import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, requestPasswordReset } from './authSync'

async function catchApiRequestError(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError)
    return error as ApiRequestError
  }

  throw new Error('Expected ApiRequestError.')
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
