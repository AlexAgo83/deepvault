import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from '../src/lib/file-download'

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns early when the DOM is unavailable', () => {
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('window', undefined)

    expect(() => downloadTextFile('file.txt', 'content')).not.toThrow()
  })

  it('creates and clicks an anchor when the DOM is available', () => {
    const anchor = document.createElement('a')
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    const removeSpy = vi.spyOn(anchor, 'remove').mockImplementation(() => {})
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor)
    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:test-url')
    const revokeObjectUrlSpy = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrlSpy,
    })
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrlSpy,
    })

    downloadTextFile('file.txt', 'content', 'text/plain')

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(appendSpy).toHaveBeenCalledWith(anchor)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:test-url')
  })
})
