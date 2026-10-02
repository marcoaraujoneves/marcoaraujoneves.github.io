import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'

import { SITE_DESCRIPTION, SITE_TITLE } from '../consts'
import { getPosts, postPath } from '../lib/posts'

export const GET: APIRoute = async context => {
  const posts = await getPosts()

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: posts.map(post => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      categories: [post.data.category, ...post.data.tags],
      link: postPath(post),
    })),
  })
}
