/** Keep diagnostics useful without retaining common credentials or request bodies. */
export function redactDiagnostic(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)/g,
      '[redacted]',
    )
    .replace(
      /((?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[redacted]',
    )
}

export function safeDiagnosticContext(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[omitted]'
  if (typeof value === 'string') return redactDiagnostic(value)
  if (value instanceof Error)
    return {
      message: redactDiagnostic(value.message),
      stack: value.stack ? redactDiagnostic(value.stack) : undefined,
    }
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => safeDiagnosticContext(item, depth + 1))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          /token|password|secret|authorization|cookie|content|body/i.test(key)
            ? '[redacted]'
            : safeDiagnosticContext(item, depth + 1),
        ]),
    )
  return typeof value === 'bigint' ? String(value) : value
}
