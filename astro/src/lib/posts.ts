import type { ImageMetadata } from 'astro'
import { getCollection, type CollectionEntry } from 'astro:content'

export type Post = CollectionEntry<'posts'>

const images = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/images/*.{png,jpg,jpeg,webp,avif}',
  { eager: true }
)

export function getLocalImage(fileName: string): ImageMetadata {
  const image = images[`/src/assets/images/${fileName}`]

  if (!image) {
    throw new Error(`Image "${fileName}" not found in src/assets/images`)
  }

  return image.default
}

/** All posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts')

  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/ /g, '-')
}

export function postPath(post: Post): string {
  return `/blog/${post.id}/`
}

export function termPath(type: 'category' | 'tag', value: string): string {
  return `/blog/${type}/${slugify(value)}/`
}

export function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function readingTime(post: Post): number {
  const words = (post.body ?? '').split(/\s+/).filter(Boolean).length

  return Math.max(1, Math.round(words / 220))
}

export function formatDate(
  date: Date,
  month: 'long' | 'short' = 'long'
): string {
  return date.toLocaleDateString('en-US', {
    month,
    day: month === 'long' ? '2-digit' : 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
