import { describe, expect, it } from 'vitest'
import * as components from '../src/components'
import * as hooks from '../src/hooks'
import * as lib from '../src/lib'

describe('barrel exports', () => {
  it('re-exports the public component, hook, and lib surfaces', () => {
    expect(components.AppShell).toBeTypeOf('function')
    expect(components.ErrorBoundary).toBeTypeOf('function')
    expect(hooks.useAppModel).toBeTypeOf('function')
    expect(hooks.useBishopConversation).toBeTypeOf('function')
    expect(lib.getDocumentScore).toBeTypeOf('function')
    expect('bishopGroundQuestion' in lib).toBe(false)
  })
})
