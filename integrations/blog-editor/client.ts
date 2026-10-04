import {
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { yamlFrontmatter } from '@codemirror/lang-yaml'
import { languages } from '@codemirror/language-data'
import {
  Annotation,
  Prec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { basicSetup, EditorView } from 'codemirror'

import type { PostSummary, SaveResult } from './store'
import {
  toggleCodeBlock,
  toggleInline,
  toggleLines,
  wrapSelection,
} from './format'

const API = '/__editor/api'
const AUTOSAVE_MS = 300
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif']

const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!

const params = new URLSearchParams(location.search)
const status = $('#status')
const heading = $('#heading')

function setStatus(state: '' | 'saving' | 'saved' | 'error', text = '') {
  status.dataset.state = state
  status.textContent = text
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/${path}`, init)
  const body = await res.json()

  if (!res.ok)
    throw Object.assign(new Error(body.error), { status: res.status })
  return body
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------- images

const imageDialog = $<HTMLDialogElement>('#image-dialog')
const imageForm = $<HTMLFormElement>('#image-form')
const imageError = $('#image-error')

function suggestImageName(file: File, prefix: string): string {
  const extension =
    file.type === 'image/jpeg' ? 'jpg' : file.type.replace('image/', '')
  const base = slugify(file.name.replace(/\.[^.]+$/, ''))

  // Pasted screenshots are all called "image.png", so name them by time.
  if (!base || base === 'image') {
    const stamp = new Date().toISOString().slice(0, 19).replace(/\D/g, '')
    return `${prefix}-${stamp}.${extension}`
  }
  return `${base}.${extension}`
}

/** Asks for a name and uploads; resolves to the saved name, or null if cancelled. */
function uploadImage(file: File, prefix: string): Promise<string | null> {
  const extension =
    file.type === 'image/jpeg' ? 'jpg' : file.type.replace('image/', '')

  if (!IMAGE_EXTENSIONS.includes(extension)) {
    setStatus('error', `Unsupported image type ${file.type || '(unknown)'}`)
    return Promise.resolve(null)
  }

  const input = imageForm.elements.namedItem('name') as HTMLInputElement

  input.value = suggestImageName(file, prefix)
  imageError.textContent = ''
  imageDialog.showModal()
  input.setSelectionRange(0, input.value.lastIndexOf('.'))

  return new Promise(resolve => {
    async function onSubmit(event: SubmitEvent) {
      const submitter = event.submitter as HTMLButtonElement | null

      if (submitter?.value !== 'save') return finish(null)

      event.preventDefault()
      try {
        const name = input.value.trim()

        await api(`images/${encodeURIComponent(name)}`, {
          method: 'PUT',
          body: file,
        })
        imageDialog.close()
        finish(name)
      } catch (error) {
        imageError.textContent = (error as Error).message
      }
    }

    function onClose() {
      finish(null)
    }

    function finish(name: string | null) {
      imageForm.removeEventListener('submit', onSubmit)
      imageDialog.removeEventListener('close', onClose)
      resolve(name)
    }

    imageForm.addEventListener('submit', onSubmit)
    imageDialog.addEventListener('close', onClose)
  })
}

// ---------------------------------------------------------------- list view

async function showList() {
  $('#list-view').hidden = false
  $('#home-link').hidden = true

  const list = $('#posts')

  for (const post of await api<PostSummary[]>('posts')) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    const title = document.createElement('strong')
    const meta = document.createElement('small')

    link.href = `/__editor/?post=${encodeURIComponent(post.slug)}`
    title.textContent = post.title || post.slug
    meta.textContent = [post.category, post.date.slice(0, 10)]
      .filter(Boolean)
      .join(' · ')
    link.append(title)
    if (post.draft) {
      const badge = document.createElement('span')

      badge.className = 'badge'
      badge.textContent = 'Draft'
      link.append(badge)
    }
    link.append(meta)
    item.append(link)
    list.append(item)
  }
}

// ---------------------------------------------------------------- new post

async function showNewPost() {
  $('#new-view').hidden = false
  heading.textContent = 'New post'

  const form = $<HTMLFormElement>('#new-form')
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement
  const coverSelect = $<HTMLSelectElement>('#cover-select')
  const coverPreview = $<HTMLImageElement>('#cover-preview')
  const error = $('#new-error')
  let slugEdited = false

  const [posts, images] = await Promise.all([
    api<PostSummary[]>('posts'),
    api<string[]>('images'),
  ])

  for (const category of new Set(posts.map(post => post.category))) {
    $('#categories').append(new Option(category))
  }

  function renderCovers(selected = '') {
    coverSelect.replaceChildren(new Option('Choose a cover…', ''))
    for (const name of images) coverSelect.append(new Option(name))
    coverSelect.value = selected
    coverSelect.dispatchEvent(new Event('change'))
  }
  renderCovers()

  coverSelect.addEventListener('change', () => {
    coverPreview.hidden = !coverSelect.value
    if (coverSelect.value) {
      coverPreview.src = document.body.dataset.images + coverSelect.value
    }
  })

  field('title').addEventListener('input', () => {
    if (!slugEdited) field('slug').value = slugify(field('title').value)
  })
  field('slug').addEventListener('input', () => {
    slugEdited = field('slug').value !== ''
  })

  const fileInput = $<HTMLInputElement>('#cover-file')

  $('#cover-upload').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]

    fileInput.value = ''
    if (!file) return

    const name = await uploadImage(file, field('slug').value || 'cover')

    if (name) {
      images.push(name)
      images.sort()
      renderCovers(name)
    }
  })

  form.addEventListener('submit', async event => {
    event.preventDefault()
    error.textContent = ''

    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    try {
      const { slug } = await api<{ slug: string }>('posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: field('slug').value,
          title: field('title').value,
          description: field('description').value,
          category: field('category').value,
          tags: field('tags').value.split(','),
          cover: coverSelect.value,
        }),
      })

      location.href = `/__editor/?post=${encodeURIComponent(slug)}`
    } catch (err) {
      error.textContent = (err as Error).message
    }
  })
}

// ---------------------------------------------------------------- editor

/** Index of the Markdown heading at or above `line`, or -1 before the first. */
function headingIndexAt(lines: string[], line: number): number {
  let index = -1
  let fence: string | null = null
  let start = 0

  // Skip the frontmatter.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) start = end + 1
  }

  for (let i = start; i <= line && i < lines.length; i++) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i])

    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
    } else if (!fence && /^ {0,3}#{1,6}(\s|$)/.test(lines[i])) {
      index++
    }
  }

  return index
}

const remote = Annotation.define<boolean>()

async function showEditor(slug: string) {
  $('#editor-view').hidden = false
  heading.hidden = true

  const preview = $<HTMLIFrameElement>('#preview')
  const openLink = $<HTMLAnchorElement>('#open-link')
  const conflict = $('#conflict')
  const postUrl = `/blog/${slug}/`

  let { content: saved, version } = await api<{
    content: string
    version: string
  }>(`posts/${encodeURIComponent(slug)}`)
  let diskCopy: { content: string; version: string } | null = null
  let saving = false
  let timer: ReturnType<typeof setTimeout> | undefined

  document.title = `${slug} · Blog editor`
  openLink.href = postUrl
  openLink.hidden = false

  async function save(force = false) {
    clearTimeout(timer)
    if (saving) {
      timer = setTimeout(save, AUTOSAVE_MS)
      return
    }

    const content = view.state.doc.toString()

    if (content === saved && !force) {
      setStatus('saved', 'Saved')
      return
    }

    saving = true
    setStatus('saving', 'Saving…')
    try {
      const res = await fetch(`${API}/posts/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, baseVersion: force ? null : version }),
      })
      const result = (await res.json()) as SaveResult & { error?: string }

      if (result.ok) {
        saved = content
        version = result.version
        setStatus(
          view.state.doc.toString() === saved ? 'saved' : 'saving',
          view.state.doc.toString() === saved ? 'Saved' : 'Saving…'
        )
      } else if (res.status === 409) {
        diskCopy = { content: result.content, version: result.version }
        conflict.hidden = false
        setStatus('error', 'Not saved')
      } else {
        setStatus('error', result.error ?? `Error ${res.status}`)
      }
    } catch (error) {
      setStatus('error', `Not saved: ${(error as Error).message}`)
    } finally {
      saving = false
    }
  }

  $('#conflict-reload').addEventListener('click', () => {
    if (!diskCopy) return

    saved = diskCopy.content
    version = diskCopy.version
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: saved },
      annotations: remote.of(true),
    })
    diskCopy = null
    conflict.hidden = true
    setStatus('saved', 'Saved')
    view.focus()
  })

  $('#conflict-overwrite').addEventListener('click', () => {
    diskCopy = null
    conflict.hidden = true
    void save(true)
    view.focus()
  })

  addEventListener('beforeunload', event => {
    if (view.state.doc.toString() !== saved) event.preventDefault()
  })

  // --- preview: follows the section the cursor is in

  let followedIndex = -1

  function currentHeadingIndex() {
    const lines = view.state.doc.toString().split('\n')
    const line =
      view.state.doc.lineAt(view.state.selection.main.head).number - 1

    return headingIndexAt(lines, line)
  }

  function scrollPreview(behavior: ScrollBehavior) {
    const win = preview.contentWindow
    const doc = preview.contentDocument

    if (!win || !doc) return

    followedIndex = currentHeadingIndex()

    // Above the first heading is the intro, at the top of the page.
    const target = doc.querySelectorAll('article :is(h1, h2, h3, h4, h5, h6)')[
      followedIndex
    ]
    const top = target
      ? target.getBoundingClientRect().top + win.scrollY - 80
      : 0

    win.scrollTo({ top, behavior })
  }

  preview.addEventListener('load', () => {
    const win = preview.contentWindow

    if (!win) return

    // Otherwise the browser restores the old position after each reload,
    // undoing the scroll below.
    win.history.scrollRestoration = 'manual'
    scrollPreview('instant')
  })

  let followTimer: ReturnType<typeof setTimeout> | undefined

  // --- source editor

  const format =
    (command: (state: EditorState) => TransactionSpec) =>
    (view: EditorView) => {
      view.dispatch(
        view.state.update(command(view.state), {
          userEvent: 'input',
          scrollIntoView: true,
        })
      )
      return true
    }

  const commands: Record<string, (view: EditorView) => boolean> = {
    bold: format(state => toggleInline(state, '**')),
    italic: format(state => toggleInline(state, '_')),
    quote: format(state => toggleLines(state, 'quote')),
    codeBlock: format(toggleCodeBlock),
    bullet: format(state => toggleLines(state, 'bullet')),
    ordered: format(state => toggleLines(state, 'ordered')),
    undo,
    redo,
  }
  const toolButton = (command: string) =>
    $<HTMLButtonElement>(`#toolbar [data-command="${command}"]`)

  const view = new EditorView({
    parent: $('#source'),
    doc: saved,
    extensions: [
      basicSetup,
      // Above basicSetup, whose Mod-i would otherwise win.
      Prec.high(
        keymap.of([
          indentWithTab,
          { key: 'Mod-b', run: commands.bold },
          { key: 'Mod-i', run: commands.italic },
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              void save()
              return true
            },
          },
        ])
      ),
      // Runs before basicSetup's bracket closing, which would replace it.
      Prec.high(
        EditorView.inputHandler.of((view, _from, _to, text) => {
          const spec = wrapSelection(view.state, text)

          if (!spec) return false
          view.dispatch(view.state.update(spec, { userEvent: 'input.type' }))
          return true
        })
      ),
      EditorView.lineWrapping,
      yamlFrontmatter({ content: markdown({ codeLanguages: languages }) }),
      document.documentElement.dataset.theme === 'dark' ? oneDark : [],
      EditorView.updateListener.of(update => {
        if (update.transactions.length > 0) {
          toolButton('undo').disabled = undoDepth(update.state) === 0
          toolButton('redo').disabled = redoDepth(update.state) === 0
        }
        if (
          update.docChanged &&
          !update.transactions.some(tr => tr.annotation(remote))
        ) {
          clearTimeout(timer)
          if (!diskCopy) {
            setStatus('saving', 'Unsaved')
            timer = setTimeout(save, AUTOSAVE_MS)
          }
        }
        if (update.selectionSet || update.docChanged) {
          clearTimeout(followTimer)
          followTimer = setTimeout(() => {
            if (currentHeadingIndex() !== followedIndex) scrollPreview('smooth')
          }, 150)
        }
      }),
      EditorView.domEventHandlers({
        paste(event, view) {
          const file = [...(event.clipboardData?.files ?? [])].find(file =>
            file.type.startsWith('image/')
          )

          if (!file) return false
          event.preventDefault()
          void insertImage(view, file, view.state.selection.main.head)
          return true
        },
        drop(event, view) {
          const file = [...(event.dataTransfer?.files ?? [])].find(file =>
            file.type.startsWith('image/')
          )

          if (!file) return false
          event.preventDefault()

          const pos =
            view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
            view.state.selection.main.head

          void insertImage(view, file, pos)
          return true
        },
      }),
    ],
  })

  async function insertImage(view: EditorView, file: File, pos: number) {
    const name = await uploadImage(file, slug)

    if (!name) {
      view.focus()
      return
    }

    // Cursor lands inside the brackets, ready for the alt text.
    view.dispatch({
      changes: { from: pos, insert: `![](../src/assets/images/${name})` },
      selection: { anchor: pos + 2 },
    })
    view.focus()
  }

  const toolbar = $('#toolbar')

  toolbar.hidden = false
  // Keeps focus (and the selection) in the editor when a button is clicked.
  toolbar.addEventListener('mousedown', event => event.preventDefault())
  toolbar.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      'button[data-command]'
    )

    if (!button) return
    commands[button.dataset.command!](view)
    view.focus()
  })

  preview.src = postUrl
  setStatus('saved', 'Saved')
  view.focus()
}

// ---------------------------------------------------------------- routing

const post = params.get('post')
const shown = post
  ? showEditor(post)
  : params.has('new')
    ? showNewPost()
    : showList()

shown.catch((error: Error) => setStatus('error', error.message))
