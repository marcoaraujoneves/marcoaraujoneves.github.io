import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createPostStore,
  EditorError,
  versionOf,
  type PostStore,
} from './store'

const POST = `---
cover: code.jpg
title: 'Hello: World'
category: career
date: 2026-10-01T12:00:00.000Z
---

Body
`

let root: string
let store: PostStore

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'blog-editor-'))
  await mkdir(path.join(root, 'posts'))
  await mkdir(path.join(root, 'src', 'assets', 'images'), { recursive: true })
  await writeFile(path.join(root, 'posts', 'hello.md'), POST)
  await writeFile(path.join(root, 'src', 'assets', 'images', 'code.jpg'), '')
  store = createPostStore(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const readPostFile = (slug: string) =>
  readFile(path.join(root, 'posts', `${slug}.md`), 'utf8')

async function rejection(promise: Promise<unknown>): Promise<EditorError> {
  const error = await promise.catch((error: unknown) => error)

  expect(error).toBeInstanceOf(EditorError)
  return error as EditorError
}

describe('listPosts', () => {
  it('lists posts newest first with their frontmatter, drafts included', async () => {
    await writeFile(
      path.join(root, 'posts', 'newer.md'),
      '---\ntitle: Newer\ncategory: engineering\ndate: 2026-10-02T00:00:00.000Z\ndraft: true\n---\n'
    )

    expect(await store.listPosts()).toEqual([
      {
        slug: 'newer',
        title: 'Newer',
        category: 'engineering',
        date: '2026-10-02T00:00:00.000Z',
        draft: true,
      },
      {
        slug: 'hello',
        title: 'Hello: World',
        category: 'career',
        date: '2026-10-01T12:00:00.000Z',
        draft: false,
      },
    ])
  })
})

describe('readPost', () => {
  it('returns the raw file and its version', async () => {
    expect(await store.readPost('hello')).toEqual({
      content: POST,
      version: versionOf(POST),
    })
  })

  it('rejects a missing post', async () => {
    expect((await rejection(store.readPost('nope'))).status).toBe(404)
  })

  it.each(['../package', 'a/b', 'Hello', ''])(
    'rejects the slug %j',
    async slug => {
      expect((await rejection(store.readPost(slug))).status).toBe(400)
    }
  )
})

describe('savePost', () => {
  it('writes the file when it still matches the loaded version', async () => {
    const result = await store.savePost('hello', 'changed', versionOf(POST))

    expect(result).toEqual({ ok: true, version: versionOf('changed') })
    expect(await readPostFile('hello')).toBe('changed')
  })

  it('refuses when the file changed on disk, returning the disk version', async () => {
    await writeFile(path.join(root, 'posts', 'hello.md'), 'edited elsewhere')

    const result = await store.savePost('hello', 'mine', versionOf(POST))

    expect(result).toEqual({
      ok: false,
      content: 'edited elsewhere',
      version: versionOf('edited elsewhere'),
    })
    expect(await readPostFile('hello')).toBe('edited elsewhere')
  })

  it('overwrites whatever is on disk when no version is given', async () => {
    await writeFile(path.join(root, 'posts', 'hello.md'), 'edited elsewhere')

    expect((await store.savePost('hello', 'mine', null)).ok).toBe(true)
    expect(await readPostFile('hello')).toBe('mine')
  })

  it('does not create posts', async () => {
    expect((await rejection(store.savePost('new', 'x', null))).status).toBe(404)
  })

  it('leaves no temporary files behind', async () => {
    await store.savePost('hello', 'changed', versionOf(POST))

    expect(await readdir(path.join(root, 'posts'))).toEqual(['hello.md'])
  })

  it('refuses paths outside the posts folder', async () => {
    const error = await rejection(store.savePost('../evil', 'x', null))

    expect(error.status).toBe(400)
    expect(await readdir(root)).not.toContain('evil.md')
  })
})

describe('createPost', () => {
  const input = {
    slug: 'my-new-post',
    title: 'A "quoted": title',
    description: 'What it is about',
    category: 'engineering',
    tags: ['astro', ' ', 'tools '],
    cover: 'code.jpg',
  }

  it('writes a draft with valid frontmatter', async () => {
    await store.createPost(input, new Date('2026-10-03T10:00:00.000Z'))

    expect(await readPostFile('my-new-post')).toBe(`---
cover: code.jpg
title: "A \\"quoted\\": title"
description: "What it is about"
category: "engineering"
tags:
  - "astro"
  - "tools"
date: 2026-10-03T10:00:00.000Z
draft: true
---

`)
  })

  it('shows up in the post list as a draft', async () => {
    await store.createPost(input)

    expect(await store.listPosts()).toContainEqual(
      expect.objectContaining({
        slug: 'my-new-post',
        title: 'A "quoted": title',
        draft: true,
      })
    )
  })

  it('never overwrites an existing post', async () => {
    const error = await rejection(store.createPost({ ...input, slug: 'hello' }))

    expect(error.status).toBe(409)
    expect(await readPostFile('hello')).toBe(POST)
  })

  it('requires the cover to exist', async () => {
    const error = await rejection(
      store.createPost({ ...input, cover: 'x.png' })
    )

    expect(error.status).toBe(400)
  })

  it('requires a title', async () => {
    const error = await rejection(store.createPost({ ...input, title: '  ' }))

    expect(error.status).toBe(400)
  })

  it('rejects invalid slugs', async () => {
    const error = await rejection(store.createPost({ ...input, slug: '../x' }))

    expect(error.status).toBe(400)
  })
})

describe('images', () => {
  const bytes = new Uint8Array([1, 2, 3])
  const imagePath = (name: string) =>
    path.join(root, 'src', 'assets', 'images', name)

  it('saves an image and lists it', async () => {
    await store.saveImage('cls-diagram.png', bytes)

    expect(
      new Uint8Array(await readFile(imagePath('cls-diagram.png')))
    ).toEqual(bytes)
    expect(await store.listImages()).toEqual(['cls-diagram.png', 'code.jpg'])
  })

  it('never overwrites an existing image', async () => {
    const error = await rejection(store.saveImage('code.jpg', bytes))

    expect(error.status).toBe(409)
    expect((await readFile(imagePath('code.jpg'))).length).toBe(0)
  })

  it.each(['../evil.png', 'a/b.png', 'notes.txt', 'image.svg', '.png'])(
    'rejects the name %j',
    async name => {
      expect((await rejection(store.saveImage(name, bytes))).status).toBe(400)
    }
  )
})
