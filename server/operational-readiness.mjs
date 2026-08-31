export async function checkOperationalReadiness(operations) {
  const entries = Object.entries(operations ?? {})
  const results = await Promise.all(entries.map(async ([name, operation]) => {
    try {
      if (typeof operation !== 'function') throw new Error('invalid readiness operation')
      await operation()
      return [name, 'ready']
    } catch {
      return [name, 'unavailable']
    }
  }))
  const checks = Object.fromEntries(results)
  return { ok: results.every(([, status]) => status === 'ready'), checks }
}

export function securityHeaders({ html = false } = {}) {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(html ? {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join('; '),
    } : {}),
  }
}
