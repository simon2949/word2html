import { describe, expect, it } from 'vitest'
import { compileMathExpression } from './mathExpression'

describe('safe math expression runtime', () => {
  it('evaluates arithmetic, powers, functions, constants and parameters', () => {
    const expression = compileMathExpression('amplitude * sin(frequency * x) + 2^3 + cos(pi)', [
      'x', 'amplitude', 'frequency',
    ])
    expect(expression.evaluate({ x: Math.PI / 2, amplitude: 2, frequency: 1 })).toBeCloseTo(9, 12)
  })

  it('uses mathematical precedence for unary minus and powers', () => {
    expect(compileMathExpression('-x^2', ['x']).evaluate({ x: 3 })).toBe(-9)
    expect(compileMathExpression('2^-2', []).evaluate({})).toBe(0.25)
  })

  it('rejects scripts, unknown variables, implicit multiplication and excessive nesting', () => {
    expect(() => compileMathExpression('window.alert(1)', ['x'])).toThrow()
    expect(() => compileMathExpression('unknown + 1', ['x'])).toThrow(/未知变量/)
    expect(() => compileMathExpression('2x', ['x'])).toThrow()
    expect(() => compileMathExpression(`${'('.repeat(40)}x${')'.repeat(40)}`, ['x'])).toThrow(/嵌套过深/)
  })
})
