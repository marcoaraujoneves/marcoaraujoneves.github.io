import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import {
  toggleCodeBlock,
  toggleInline,
  toggleLines,
  wrapSelection,
} from './format'

function type(doc: string, selection: EditorSelection, text: string) {
  const state = EditorState.create({
    doc,
    selection,
    extensions: EditorState.allowMultipleSelections.of(true),
  })
  const spec = wrapSelection(state, text)

  if (!spec) return null

  const next = state.update(spec).state

  return {
    doc: next.doc.toString(),
    selected: next.selection.ranges.map(range =>
      next.sliceDoc(range.from, range.to)
    ),
  }
}

describe('wrapSelection', () => {
  it.each([
    ['*', '*word*'],
    ['_', '_word_'],
    ['`', '`word`'],
    ['~', '~word~'],
    ['"', '"word"'],
    ["'", "'word'"],
    ['(', '(word)'],
    ['[', '[word]'],
    ['{', '{word}'],
    ['<', '<word>'],
  ])('wraps the selection with %s', (text, wrapped) => {
    expect(type('a word b', EditorSelection.single(2, 6), text)).toEqual({
      doc: `a ${wrapped} b`,
      selected: ['word'],
    })
  })

  it('keeps the text selected, so wrapping twice makes it bold', () => {
    const state = EditorState.create({
      doc: 'a word b',
      selection: EditorSelection.single(2, 6),
    })
    const once = state.update(wrapSelection(state, '*')!).state
    const twice = once.update(wrapSelection(once, '*')!).state

    expect(twice.doc.toString()).toBe('a **word** b')
    expect(
      twice.sliceDoc(twice.selection.main.from, twice.selection.main.to)
    ).toBe('word')
  })

  it('keeps a backwards selection backwards', () => {
    const state = EditorState.create({
      doc: 'a word b',
      selection: EditorSelection.single(6, 2),
    })
    const next = state.update(wrapSelection(state, '_')!).state

    expect(next.selection.main.anchor).toBe(7)
    expect(next.selection.main.head).toBe(3)
  })

  it('wraps every selection at once', () => {
    expect(
      type(
        'one two',
        EditorSelection.create([
          EditorSelection.range(0, 3),
          EditorSelection.range(4, 7),
        ]),
        '`'
      )
    ).toEqual({ doc: '`one` `two`', selected: ['one', 'two'] })
  })

  it('types normally without a selection', () => {
    expect(type('a word b', EditorSelection.single(0), '*')).toBeNull()
  })

  it('types normally for other characters', () => {
    expect(type('a word b', EditorSelection.single(2, 6), 'x')).toBeNull()
  })
})

/** Runs a toolbar command with `from..to` selected. */
function apply(
  doc: string,
  from: number,
  to: number,
  command: (state: EditorState) => TransactionSpec
) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
  })
  const next = state.update(command(state)).state
  const { main } = next.selection

  return {
    doc: next.doc.toString(),
    selected: next.sliceDoc(main.from, main.to),
  }
}

const bold = (state: EditorState) => toggleInline(state, '**')
const italic = (state: EditorState) => toggleInline(state, '_')

describe('toggleInline', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(apply('a word b', 2, 6, bold)).toEqual({
      doc: 'a **word** b',
      selected: 'word',
    })
    expect(apply('a word b', 2, 6, italic).doc).toBe('a _word_ b')
  })

  it('unwraps when the markers are just outside the selection', () => {
    expect(apply('a **word** b', 4, 8, bold)).toEqual({
      doc: 'a word b',
      selected: 'word',
    })
  })

  it('unwraps when the markers are inside the selection', () => {
    expect(apply('a **word** b', 2, 10, bold)).toEqual({
      doc: 'a word b',
      selected: 'word',
    })
  })

  it('inserts a pair with the cursor inside when nothing is selected', () => {
    const state = EditorState.create({ doc: 'a  b', selection: { anchor: 2 } })
    const next = state.update(bold(state)).state

    expect(next.doc.toString()).toBe('a **** b')
    expect(next.selection.main.head).toBe(4)
  })
})

describe('toggleLines', () => {
  const quote = (state: EditorState) => toggleLines(state, 'quote')
  const bullet = (state: EditorState) => toggleLines(state, 'bullet')
  const ordered = (state: EditorState) => toggleLines(state, 'ordered')

  it('prefixes every selected line, skipping blank ones', () => {
    expect(apply('one\n\ntwo', 0, 8, quote).doc).toBe('> one\n\n> two')
    expect(apply('one\ntwo', 0, 7, bullet).doc).toBe('- one\n- two')
    expect(apply('one\ntwo\nthree', 0, 13, ordered).doc).toBe(
      '1. one\n2. two\n3. three'
    )
  })

  it('works on the cursor line without a selection', () => {
    expect(apply('one\ntwo', 5, 5, bullet).doc).toBe('one\n- two')
  })

  it('removes the prefix when every line has it', () => {
    expect(apply('> one\n> two', 0, 11, quote).doc).toBe('one\ntwo')
    expect(apply('- one\n* two', 0, 11, bullet).doc).toBe('one\ntwo')
    expect(apply('1. one\n2. two', 0, 13, ordered).doc).toBe('one\ntwo')
  })

  it('adds the prefix when only some lines have it', () => {
    expect(apply('> one\ntwo', 0, 9, quote).doc).toBe('> one\n> two')
  })

  it('switches between list styles', () => {
    expect(apply('- one\n- two', 0, 11, ordered).doc).toBe('1. one\n2. two')
    expect(apply('1. one\n2. two', 0, 13, bullet).doc).toBe('- one\n- two')
  })

  it('keeps indentation', () => {
    expect(apply('- one\n  - two', 6, 13, ordered).doc).toBe('- one\n  1. two')
  })

  it('ignores a selection that ends at the start of the next line', () => {
    expect(apply('one\ntwo', 0, 4, bullet).doc).toBe('- one\ntwo')
  })
})

describe('toggleCodeBlock', () => {
  it('fences the selected lines with the cursor after the opening fence', () => {
    const state = EditorState.create({
      doc: 'a\nconst x = 1\nb',
      selection: { anchor: 4 },
    })
    const next = state.update(toggleCodeBlock(state)).state

    expect(next.doc.toString()).toBe('a\n```\nconst x = 1\n```\nb')
    expect(next.selection.main.head).toBe(5)
  })

  it('fences several lines', () => {
    expect(apply('one\ntwo', 0, 7, toggleCodeBlock).doc).toBe(
      '```\none\ntwo\n```'
    )
  })

  it('removes the fences when already in a code block', () => {
    expect(apply('a\n```ts\nx\n```\nb', 8, 8, toggleCodeBlock).doc).toBe(
      'a\nx\nb'
    )
  })
})
