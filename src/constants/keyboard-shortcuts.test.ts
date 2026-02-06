import { describe, it, expect } from 'vitest'
import { matchesShortcut, KeyboardShortcut, SHORTCUTS } from './keyboard-shortcuts'

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent
}

describe('matchesShortcut', () => {
  it('matches CmdOrCtrl+Shift+N with metaKey', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.NEW_INDEX
    const event = makeKeyEvent({ key: 'N', metaKey: true, shiftKey: true })
    expect(matchesShortcut(event, shortcut)).toBe(true)
  })

  it('matches CmdOrCtrl+Shift+N with ctrlKey', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.NEW_INDEX
    const event = makeKeyEvent({ key: 'N', ctrlKey: true, shiftKey: true })
    expect(matchesShortcut(event, shortcut)).toBe(true)
  })

  it('does not match when shift is missing', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.NEW_INDEX
    const event = makeKeyEvent({ key: 'N', metaKey: true, shiftKey: false })
    expect(matchesShortcut(event, shortcut)).toBe(false)
  })

  it('does not match when meta/ctrl is missing', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.NEW_INDEX
    const event = makeKeyEvent({ key: 'N', shiftKey: true })
    expect(matchesShortcut(event, shortcut)).toBe(false)
  })

  it('matches CmdOrCtrl+Return for send message', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.SEND_MESSAGE
    const event = makeKeyEvent({ key: 'Enter', metaKey: true })
    expect(matchesShortcut(event, shortcut)).toBe(true)
  })

  it('matches CmdOrCtrl+/ for keyboard shortcuts', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.KEYBOARD_SHORTCUTS
    const event = makeKeyEvent({ key: '/', metaKey: true })
    expect(matchesShortcut(event, shortcut)).toBe(true)
  })

  it('does not match wrong key', () => {
    const shortcut: KeyboardShortcut = SHORTCUTS.NEW_INDEX
    const event = makeKeyEvent({ key: 'A', metaKey: true, shiftKey: true })
    expect(matchesShortcut(event, shortcut)).toBe(false)
  })

  it('NEW_INDEX and NEW_ASSISTANT have different accelerators', () => {
    expect(SHORTCUTS.NEW_INDEX.accelerator).not.toBe(SHORTCUTS.NEW_ASSISTANT.accelerator)
  })
})
