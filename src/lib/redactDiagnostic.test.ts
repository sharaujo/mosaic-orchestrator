import { describe, expect, it } from 'vitest'
import { redactDiagnostic, safeDiagnosticContext } from './redactDiagnostic'

describe('diagnostic privacy', () => {
  it('redacts credentials while preserving the operation', () => {
    expect(redactDiagnostic('export failed: Bearer abc123 password=test ghp_testvalue')).toBe('export failed: Bearer [redacted] password=[redacted] [redacted]')
    expect(safeDiagnosticContext({ operation: 'write_text_file', token: 'secret', body: 'private' })).toEqual({ operation: 'write_text_file', token: '[redacted]', body: '[redacted]' })
  })
  it('bounds circular contexts so report export cannot throw', () => {
    const value: Record<string, unknown> = {}
    value.self = value
    expect(() => JSON.stringify(safeDiagnosticContext(value))).not.toThrow()
  })
})
