type Translate = (key: string, params?: Record<string, string>) => string

interface ApiErrorLike {
  code: string
}

const apiErrorMessageKeys: Record<string, string> = {
  account_exists: 'auth.accountExists',
  invalid_credentials: 'auth.invalidCredentials',
  invalid_request: 'auth.invalidRequest',
  invalid_reset_token: 'auth.invalidResetToken',
  mail_unavailable: 'auth.resetMailUnavailable',
  unauthorized: 'auth.unauthorized',
  csrf_invalid: 'auth.csrfInvalid',
  network_error: 'auth.networkError',
  request_failed: 'auth.requestFailed'
}

function isApiErrorLike(error: unknown): error is ApiErrorLike {
  if (!error || typeof error !== 'object') {
    return false
  }
  const value = error as { code?: unknown }
  return typeof value.code === 'string'
}

export function getLocalizedApiErrorMessage(
  error: unknown,
  t: Translate,
  fallbackKey: string,
  overrides: Record<string, string> = {}
): string {
  if (isApiErrorLike(error)) {
    const key = overrides[error.code] || apiErrorMessageKeys[error.code]
    if (key) {
      return t(key)
    }
  }

  return t(fallbackKey)
}
