import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'

/** Opening character typed → closing character added after the selection. */
const WRAPPERS: Record<string, string> = {
  '*': '*',
  _: '_',
  '`': '`',
  '~': '~',
  '"': '"',
  "'": "'",
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
}

/**
 * Typing a wrapper character over a selection wraps it instead of replacing
 * it. The text stays selected, so typing `*` twice makes it bold.
 * Returns null when typing should behave normally.
 */
export function wrapSelection(
  state: EditorState,
  text: string
): TransactionSpec | null {
  const close = WRAPPERS[text]

  if (!close || state.selection.ranges.some(range => range.empty)) return null

  return state.changeByRange(range => ({
    changes: [
      { from: range.from, insert: text },
      { from: range.to, insert: close },
    ],
    range: EditorSelection.range(range.anchor + 1, range.head + 1),
  }))
}

/**
 * Toggles an inline marker (`**` for bold, `_` for italic) around each
 * selection. Without a selection it inserts a pair with the cursor inside.
 */
export function toggleInline(
  state: EditorState,
  marker: string
): TransactionSpec {
  const size = marker.length

  return state.changeByRange(range => {
    const { from, to } = range
    const before = state.sliceDoc(from - size, from)
    const after = state.sliceDoc(to, to + size)
    const text = state.sliceDoc(from, to)

    // Markers just outside the selection: remove them.
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: from - size, to: from },
          { from: to, to: to + size },
        ],
        range: EditorSelection.range(from - size, to - size),
      }
    }

    // Markers included in the selection: remove them.
    if (
      text.length >= size * 2 &&
      text.startsWith(marker) &&
      text.endsWith(marker)
    ) {
      return {
        changes: [
          { from, to: from + size },
          { from: to - size, to },
        ],
        range: EditorSelection.range(from, to - size * 2),
      }
    }

    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      range: EditorSelection.range(from + size, to + size),
    }
  })
}

type LineStyle = 'quote' | 'bullet' | 'ordered'

const LINE_PREFIX: Record<LineStyle, RegExp> = {
  quote: /^> ?/,
  bullet: /^[-*+] /,
  ordered: /^\d+[.)] /,
}

/** Lines touched by any selection, ignoring a selection ending at a line start. */
function selectedLines(state: EditorState) {
  const numbers = new Set<number>()

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    let last = state.doc.lineAt(range.to).number

    if (!range.empty && last > first && state.doc.line(last).from === range.to)
      last--
    for (let n = first; n <= last; n++) numbers.add(n)
  }

  const lines = [...numbers].sort((a, b) => a - b).map(n => state.doc.line(n))
  const filled = lines.filter(line => line.text.trim() !== '')

  return filled.length > 0 ? filled : lines
}

/**
 * Toggles a quote, bullet or numbered list on the selected lines. Applying a
 * list style to lines in the other list style switches them over.
 */
export function toggleLines(
  state: EditorState,
  style: LineStyle
): TransactionSpec {
  const lines = selectedLines(state).map(line => {
    const indent = /^\s*/.exec(line.text)![0]
    const rest = line.text.slice(indent.length)

    return { line, start: line.from + indent.length, rest }
  })
  const remove = lines.every(({ rest }) => LINE_PREFIX[style].test(rest))
  const changes: ChangeSpec[] = lines.map(({ start, rest }, index) => {
    if (remove) {
      return {
        from: start,
        to: start + LINE_PREFIX[style].exec(rest)![0].length,
      }
    }

    const insert =
      style === 'quote' ? '> ' : style === 'bullet' ? '- ' : `${index + 1}. `
    // Replaced rather than stacked, so lists switch style and quotes don't nest.
    const current =
      style === 'quote'
        ? LINE_PREFIX.quote.exec(rest)
        : (LINE_PREFIX.bullet.exec(rest) ?? LINE_PREFIX.ordered.exec(rest))

    return { from: start, to: start + (current?.[0].length ?? 0), insert }
  })
  const changeSet = state.changes(changes)

  return { changes: changeSet, selection: state.selection.map(changeSet, 1) }
}

/**
 * Wraps the selected lines in a ``` code block, or removes the fences when
 * they are already in one.
 */
export function toggleCodeBlock(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  const above = first.number > 1 ? state.doc.line(first.number - 1) : null
  const below =
    last.number < state.doc.lines ? state.doc.line(last.number + 1) : null

  if (above?.text.startsWith('```') && below?.text.trim() === '```') {
    return {
      changes: [
        { from: above.from, to: first.from },
        { from: last.to, to: below.to },
      ],
    }
  }

  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' },
    ],
    // Right after the opening fence, ready for the language name.
    selection: EditorSelection.cursor(first.from + 3),
  }
}
