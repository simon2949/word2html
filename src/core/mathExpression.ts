export type MathScope = Record<string, number>

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'left' | 'right' | 'comma' | 'end' }

type ExpressionNode =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; operator: '+' | '-'; operand: ExpressionNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'call'; name: string; arguments: ExpressionNode[] }

const functions: Record<string, { minArgs: number; maxArgs: number; call: (...values: number[]) => number }> = {
  sin: { minArgs: 1, maxArgs: 1, call: Math.sin },
  cos: { minArgs: 1, maxArgs: 1, call: Math.cos },
  tan: { minArgs: 1, maxArgs: 1, call: Math.tan },
  sqrt: { minArgs: 1, maxArgs: 1, call: Math.sqrt },
  abs: { minArgs: 1, maxArgs: 1, call: Math.abs },
  exp: { minArgs: 1, maxArgs: 1, call: Math.exp },
  log: { minArgs: 1, maxArgs: 1, call: Math.log },
  ln: { minArgs: 1, maxArgs: 1, call: Math.log },
  min: { minArgs: 2, maxArgs: 6, call: Math.min },
  max: { minArgs: 2, maxArgs: 6, call: Math.max },
  pow: { minArgs: 2, maxArgs: 2, call: Math.pow },
  step: { minArgs: 1, maxArgs: 1, call: (value) => value >= 0 ? 1 : 0 },
}

const constants: MathScope = { pi: Math.PI, e: Math.E }
export const SAFE_MATH_FUNCTIONS = new Set(Object.keys(functions))
export const SAFE_MATH_CONSTANTS = new Set(Object.keys(constants))

function tokenize(expression: string): Token[] {
  if (expression.length === 0 || expression.length > 240) throw new Error('函数表达式长度必须在 1 到 240 个字符之间。')
  const tokens: Token[] = []
  let index = 0
  while (index < expression.length) {
    const char = expression[index]!
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (/\d|\./.test(char)) {
      const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
      if (!match) throw new Error(`无法识别表达式位置 ${index + 1}。`)
      const value = Number(match[0])
      if (!Number.isFinite(value)) throw new Error('表达式包含无效数字。')
      tokens.push({ type: 'number', value })
      index += match[0].length
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)
      if (!match) throw new Error(`无法识别表达式位置 ${index + 1}。`)
      tokens.push({ type: 'identifier', value: match[0] })
      index += match[0].length
      continue
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }
    if (char === '(') tokens.push({ type: 'left' })
    else if (char === ')') tokens.push({ type: 'right' })
    else if (char === ',') tokens.push({ type: 'comma' })
    else throw new Error(`表达式包含不允许的字符：${char}`)
    index += 1
  }
  if (tokens.length > 256) throw new Error('函数表达式过于复杂。')
  tokens.push({ type: 'end' })
  return tokens
}

class Parser {
  private index = 0
  private depth = 0

  constructor(
    private readonly tokens: Token[],
    private readonly allowedVariables: Set<string>,
  ) {}

  parse(): ExpressionNode {
    const node = this.parseAdditive()
    if (this.peek().type !== 'end') throw new Error('表达式末尾存在多余内容。')
    return node
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: 'end' }
  }

  private take(): Token {
    const token = this.peek()
    this.index += 1
    return token
  }

  private withDepth<T>(callback: () => T): T {
    this.depth += 1
    if (this.depth > 32) throw new Error('函数表达式嵌套过深。')
    try { return callback() } finally { this.depth -= 1 }
  }

  private parseAdditive(): ExpressionNode {
    let node = this.parseMultiplicative()
    while (this.peek().type === 'operator' && (this.peek() as { value?: string }).value?.match(/^[+-]$/)) {
      const operator = (this.take() as Extract<Token, { type: 'operator' }>).value as '+' | '-'
      node = { kind: 'binary', operator, left: node, right: this.parseMultiplicative() }
    }
    return node
  }

  private parseMultiplicative(): ExpressionNode {
    let node = this.parseUnary()
    while (this.peek().type === 'operator' && (this.peek() as { value?: string }).value?.match(/^[*/]$/)) {
      const operator = (this.take() as Extract<Token, { type: 'operator' }>).value as '*' | '/'
      node = { kind: 'binary', operator, left: node, right: this.parseUnary() }
    }
    return node
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek()
    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.take()
      return { kind: 'unary', operator: token.value, operand: this.withDepth(() => this.parseUnary()) }
    }
    return this.parsePower()
  }

  private parsePower(): ExpressionNode {
    const left = this.parsePrimary()
    const token = this.peek()
    if (token.type === 'operator' && token.value === '^') {
      this.take()
      return { kind: 'binary', operator: '^', left, right: this.withDepth(() => this.parseUnary()) }
    }
    return left
  }

  private parsePrimary(): ExpressionNode {
    const token = this.take()
    if (token.type === 'number') return { kind: 'number', value: token.value }
    if (token.type === 'left') {
      const node = this.withDepth(() => this.parseAdditive())
      if (this.take().type !== 'right') throw new Error('函数表达式缺少右括号。')
      return node
    }
    if (token.type !== 'identifier') throw new Error('函数表达式缺少数字、变量或函数。')

    if (this.peek().type !== 'left') {
      if (!this.allowedVariables.has(token.value) && !SAFE_MATH_CONSTANTS.has(token.value)) {
        throw new Error(`函数表达式引用了未知变量：${token.value}`)
      }
      return { kind: 'variable', name: token.value }
    }

    const definition = functions[token.value]
    if (!definition) throw new Error(`函数表达式使用了不允许的函数：${token.value}`)
    this.take()
    const argumentsList: ExpressionNode[] = []
    if (this.peek().type !== 'right') {
      while (true) {
        argumentsList.push(this.withDepth(() => this.parseAdditive()))
        if (this.peek().type !== 'comma') break
        this.take()
      }
    }
    if (this.take().type !== 'right') throw new Error('函数调用缺少右括号。')
    if (argumentsList.length < definition.minArgs || argumentsList.length > definition.maxArgs) {
      throw new Error(`函数 ${token.value} 的参数数量不正确。`)
    }
    return { kind: 'call', name: token.value, arguments: argumentsList }
  }
}

function evaluateNode(node: ExpressionNode, scope: MathScope): number {
  if (node.kind === 'number') return node.value
  if (node.kind === 'variable') return constants[node.name] ?? scope[node.name] ?? Number.NaN
  if (node.kind === 'unary') {
    const value = evaluateNode(node.operand, scope)
    return node.operator === '-' ? -value : value
  }
  if (node.kind === 'binary') {
    const left = evaluateNode(node.left, scope)
    const right = evaluateNode(node.right, scope)
    if (node.operator === '+') return left + right
    if (node.operator === '-') return left - right
    if (node.operator === '*') return left * right
    if (node.operator === '/') return left / right
    return left ** right
  }
  return functions[node.name]!.call(...node.arguments.map((argument) => evaluateNode(argument, scope)))
}

export interface CompiledMathExpression {
  evaluate: (scope: MathScope) => number
}

export function compileMathExpression(
  expression: string,
  allowedVariables: Iterable<string>,
): CompiledMathExpression {
  const variables = new Set(allowedVariables)
  const root = new Parser(tokenize(expression), variables).parse()
  return {
    evaluate: (scope) => evaluateNode(root, scope),
  }
}
