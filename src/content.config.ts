import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './posts' }),
  schema: z.object({
    // File name of an image in src/assets/images (e.g. "code.jpg").
    cover: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    date: z.coerce.date(),
    // Drafts show up in dev but are left out of the production build.
    draft: z.boolean().default(false),
  }),
})

export const collections = { posts }
