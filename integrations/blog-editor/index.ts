import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

import { createPostStore, EditorError, type PostStore } from './store'

const BASE = '/__editor'
const MAX_POST_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const pageFile = new URL('./editor.html', import.meta.url)
const clientFile = fileURLToPath(new URL('./client.ts', import.meta.url))

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) throw new EditorError(400, 'Request body too large')
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  try {
    return JSON.parse((await readBody(req, MAX_POST_BYTES)).toString('utf8'))
  } catch (error) {
    if (error instanceof EditorError) throw error
    throw new EditorError(400, 'Invalid JSON body')
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Maps `/__editor/api/...` requests to the store. Returns false if unmatched. */
async function handleApi(
  store: PostStore,
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  onCreate: () => Promise<void>
): Promise<boolean> {
  const [resource, name, ...rest] = route.split('/').map(decodeURIComponent)

  if (rest.length > 0) return false

  if (resource === 'posts' && name === undefined) {
    if (req.method === 'GET') send(res, 200, await store.listPosts())
    else if (req.method === 'POST') {
      const slug = await store.createPost(await readJson(req))

      await onCreate()
      send(res, 201, { slug })
    } else return false
    return true
  }

  if (resource === 'posts') {
    if (req.method === 'GET') send(res, 200, await store.readPost(name))
    else if (req.method === 'PUT') {
      const { content, baseVersion } = await readJson<{
        content: string
        baseVersion: string | null
      }>(req)
      const result = await store.savePost(name, content, baseVersion)

      send(res, result.ok ? 200 : 409, result)
    } else return false
    return true
  }

  if (resource === 'images' && name === undefined && req.method === 'GET') {
    send(res, 200, await store.listImages())
    return true
  }

  if (resource === 'images' && req.method === 'PUT') {
    await store.saveImage(name, await readBody(req, MAX_IMAGE_BYTES))
    send(res, 201, { name })
    return true
  }

  return false
}

/**
 * Local post editor at /__editor/, enabled by `npm run blog-editor`.
 * Only exists in `astro dev` with EDIT set, so it never reaches the build.
 */
export default function blogEditor(): AstroIntegration {
  let enabled = false
  let store: PostStore

  return {
    name: 'blog-editor',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        enabled = command === 'dev' && Boolean(process.env.EDIT)
        if (!enabled) return

        updateConfig({
          vite: {
            // Bundled up front, so Vite never reloads to add them mid-session.
            optimizeDeps: {
              include: [
                'codemirror',
                '@codemirror/commands',
                '@codemirror/lang-markdown',
                '@codemirror/lang-yaml',
                '@codemirror/language-data',
                '@codemirror/state',
                '@codemirror/theme-one-dark',
                '@codemirror/view',
              ],
            },
          },
        })
      },

      'astro:config:done': ({ config }) => {
        if (enabled) store = createPostStore(fileURLToPath(config.root))
      },

      'astro:server:setup': ({ server, logger, refreshContent }) => {
        if (!enabled) return

        // Syncs a new post before responding, so its preview isn't a 404.
        const onCreate = async () => {
          await refreshContent?.({})
        }

        // Served outside Astro's pages on purpose: Astro reloads every open
        // page when a post changes, and only the preview should reload.
        server.middlewares.use(BASE, async (req, res, next) => {
          const route = (req.url ?? '/').split('?')[0].replace(/^\//, '')

          try {
            if (route === '' && req.method === 'GET') {
              const html = await readFile(pageFile, 'utf8')

              res.setHeader('Content-Type', 'text/html')
              res.end(
                html
                  .replace('%CLIENT%', `/@fs${clientFile}`)
                  .replace('%IMAGES%', `/@fs${store.imagesDir}/`)
              )
              return
            }

            if (route.startsWith('api/')) {
              const handled = await handleApi(
                store,
                req,
                res,
                route.slice(4),
                onCreate
              )

              if (handled) return
              send(res, 404, { error: 'Not found' })
              return
            }

            next()
          } catch (error) {
            if (error instanceof EditorError) {
              send(res, error.status, { error: error.message })
              return
            }
            logger.error(String(error))
            send(res, 500, { error: String(error) })
          }
        })

        logger.info(`Blog editor enabled at ${BASE}/`)
      },
    },
  }
}
