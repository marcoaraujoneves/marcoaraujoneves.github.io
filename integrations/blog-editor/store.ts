import { createHash } from 'node:crypto'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Thrown for requests the editor refuses; `status` maps to the HTTP response. */
export class EditorError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message)
  }
}

export interface PostSummary {
  slug: string
  title: string
  category: string
  date: string
  draft: boolean
}

export interface NewPost {
  slug: string
  title: string
  description: string
  category: string
  tags: string[]
  cover: string
}

export type SaveResult =
  | { ok: true; version: string }
  | { ok: false; content: string; version: string }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IMAGE_NAME =
  /^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:png|jpe?g|webp|avif)$/i

/** Content hash, used to detect changes made outside the editor. */
export function versionOf(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

/** Reads one top-level frontmatter value. Only used for listing posts. */
function frontmatterValue(content: string, key: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? ''
  const value = (
    new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(frontmatter)?.[1] ?? ''
  ).trim()

  if (/^'.*'$/.test(value)) return value.slice(1, -1).replaceAll("''", "'")
  if (/^".*"$/.test(value)) {
    try {
      return JSON.parse(value) as string
    } catch {
      return value.slice(1, -1)
    }
  }

  return value
}

/**
 * Every file operation of the blog editor. Only ever touches
 * `<root>/posts/<slug>.md` and `<root>/src/assets/images/<name>`.
 */
export function createPostStore(root: string) {
  const postsDir = path.join(root, 'posts')
  const imagesDir = path.join(root, 'src', 'assets', 'images')

  function postFile(slug: string): string {
    if (!SLUG.test(slug)) throw new EditorError(400, `Invalid slug "${slug}"`)

    return path.join(postsDir, `${slug}.md`)
  }

  // Writes to a temporary file first, so the dev server never reads half a post.
  async function writeAtomic(file: string, content: string) {
    const temporary = `${file}.${process.pid}.tmp`

    await writeFile(temporary, content)
    await rename(temporary, file)
  }

  async function readPost(slug: string) {
    try {
      const content = await readFile(postFile(slug), 'utf8')

      return { content, version: versionOf(content) }
    } catch (error) {
      if (isMissing(error))
        throw new EditorError(404, `Post "${slug}" not found`)
      throw error
    }
  }

  async function listImages(): Promise<string[]> {
    const names = await readdir(imagesDir)

    return names.filter(name => IMAGE_NAME.test(name)).sort()
  }

  return {
    imagesDir,
    readPost,
    listImages,

    /** All posts, newest first, drafts included. */
    async listPosts(): Promise<PostSummary[]> {
      const names = await readdir(postsDir)
      const posts = await Promise.all(
        names
          .filter(name => name.endsWith('.md'))
          .map(async name => {
            const content = await readFile(path.join(postsDir, name), 'utf8')

            return {
              slug: name.slice(0, -'.md'.length),
              title: frontmatterValue(content, 'title'),
              category: frontmatterValue(content, 'category'),
              date: frontmatterValue(content, 'date'),
              draft: frontmatterValue(content, 'draft') === 'true',
            }
          })
      )

      return posts.sort((a, b) => b.date.localeCompare(a.date))
    },

    /**
     * Saves only if the file still matches `baseVersion`, the version the
     * editor last loaded. Pass `null` to overwrite whatever is on disk.
     */
    async savePost(
      slug: string,
      content: string,
      baseVersion: string | null
    ): Promise<SaveResult> {
      const current = await readPost(slug)

      if (baseVersion !== null && current.version !== baseVersion) {
        return { ok: false, ...current }
      }

      await writeAtomic(postFile(slug), content)

      return { ok: true, version: versionOf(content) }
    },

    async createPost(post: NewPost, now = new Date()): Promise<string> {
      const file = postFile(post.slug)

      for (const field of ['title', 'description', 'category'] as const) {
        if (!post[field].trim()) {
          throw new EditorError(400, `The ${field} is required`)
        }
      }
      if (!(await listImages()).includes(post.cover)) {
        throw new EditorError(400, `Cover "${post.cover}" not found`)
      }

      // JSON strings are valid YAML, so quoting this way is always safe.
      const tags = post.tags.map(tag => tag.trim()).filter(Boolean)
      const content = [
        '---',
        `cover: ${post.cover}`,
        `title: ${JSON.stringify(post.title.trim())}`,
        `description: ${JSON.stringify(post.description.trim())}`,
        `category: ${JSON.stringify(post.category.trim())}`,
        ...(tags.length > 0
          ? ['tags:', ...tags.map(tag => `  - ${JSON.stringify(tag)}`)]
          : []),
        `date: ${now.toISOString()}`,
        'draft: true',
        '---',
        '',
        '',
      ].join('\n')

      try {
        await writeFile(file, content, { flag: 'wx' })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new EditorError(409, `Post "${post.slug}" already exists`)
        }
        throw error
      }

      return post.slug
    },

    /** Never overwrites: an existing name is a conflict. */
    async saveImage(name: string, bytes: Uint8Array): Promise<void> {
      if (!IMAGE_NAME.test(name)) {
        throw new EditorError(
          400,
          `Invalid image name "${name}" (use letters, numbers, - and _, ending in .png, .jpg, .jpeg, .webp or .avif)`
        )
      }

      try {
        await writeFile(path.join(imagesDir, name), bytes, { flag: 'wx' })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new EditorError(409, `Image "${name}" already exists`)
        }
        throw error
      }
    },
  }
}

export type PostStore = ReturnType<typeof createPostStore>
