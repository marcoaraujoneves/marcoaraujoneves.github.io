# marcoaraujoneves.github.io

Personal blog built with [Astro](https://astro.build), deployed to GitHub Pages.

## Commands

Requires Node 22.12+ (see `.nvmrc`).

| Command           | Action                                     |
| :---------------- | :----------------------------------------- |
| `npm install`     | Install dependencies                       |
| `npm run dev`     | Start the dev server at `localhost:4321`   |
| `npm run build`   | Type-check and build the site to `./dist/` |
| `npm run preview` | Serve the production build locally         |
| `npm run check`   | Type-check `.astro` and `.ts` files        |
| `npm run lint`    | Lint with ESLint                           |
| `npm run format`  | Format with Prettier                       |

## Writing a post

Add a Markdown file to `posts/`. Its file name becomes the URL (`posts/my-post.md` → `/my-post/`).

```md
---
cover: code.jpg # file name of an image in src/assets/images
title: My post
description: One-line summary shown on cards and in search results.
category: blogging
tags:
  - astro
date: 2026-10-01T12:00:00.000Z
---

Post content…
```

The frontmatter is validated at build time (`src/content.config.ts`), so a typo or missing field fails the build instead of silently breaking a page.

## Project structure

```text
posts/                 Blog posts (Markdown)
public/                Files copied as-is (favicon)
src/
  assets/images/       Images, optimized at build time
  components/          Navbar, Footer, PostCard, SEO head, icons
  layouts/             Base page layout
  lib/posts.ts         Post queries and URL/date helpers
  pages/               Routes, including [slug], tag/[tag], category/[category], rss.xml
  styles/              Global CSS and CSS modules
  content.config.ts    Post frontmatter schema
```
