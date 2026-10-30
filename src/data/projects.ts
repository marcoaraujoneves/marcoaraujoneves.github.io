import customerHub from '../assets/projects/customer-hub.svg'
import slideasy from '../assets/projects/slideasy.svg'
import planitpoker from '../assets/projects/planitpoker.svg'
import auditPlatform from '../assets/projects/audit-platform.svg'
import climateApp from '../assets/projects/climate-app.svg'
import portfolioSite from '../assets/projects/portfolio-site.svg'

export interface Project {
  title: string
  /** Cover image. The files in src/assets/projects are placeholders. */
  image: ImageMetadata
  year: string
  role: string
  description: string
  highlights: string[]
  tags: string[]
  /** Live site or repository. Projects without one render as plain text. */
  href?: string
  linkLabel?: string
}

// Newest first. Replace or extend with your own work.
export const projects: Project[] = [
  {
    title: 'Customer Hub & Product Detail Page',
    image: customerHub,
    year: '2025 – 2026',
    role: 'Fullstack Engineer · Form Factory',
    description:
      'Rebuilt the customer account area and the product detail page of a major US clothing brand on a headless Shopify storefront.',
    highlights: [
      'Loyalty provider, account, orders and support in a single hub',
      'Lighthouse scores up by 20+ points on the PDP',
    ],
    tags: ['TypeScript', 'React', 'Remix / RR7', 'Shopify Hydrogen', 'CWV'],
  },
  {
    title: 'Slideasy',
    image: slideasy,
    year: '2023 – 2024',
    role: 'Fullstack Engineer · EasyRetro',
    description:
      'An AI-assisted presentation tool, built from scratch up to its MVP launch, from discovery and prototyping to analytics and SEO.',
    highlights: [
      'Image generation with Stable Diffusion, FLUX and OpenAI APIs',
      'Serverless backend on Firebase',
    ],
    tags: ['Vue', 'Nuxt', 'Node.js', 'Firebase', 'OpenAI'],
  },
  {
    title: 'PlanITPoker',
    image: planitpoker,
    year: '2022 – 2023',
    role: 'Fullstack Engineer · EasyRetro',
    description:
      'Led the migration of this planning poker app to a new stack while it moved from a free to a paid product.',
    highlights: ['Real-time estimation sessions', 'Zero-downtime migration'],
    tags: ['JavaScript', 'Vue', 'Nuxt', 'Firebase'],
  },
  {
    title: 'Transportation Agencies Audit Platform',
    image: auditPlatform,
    year: '2020',
    role: 'Freelance Developer · Satélite Norte',
    description:
      'Three web apps for auditing transportation agencies, covering requirements, UI/UX, planning and implementation, still used to audit hundreds of agencies.',
    highlights: [
      'Centralized insights, planning and requests',
      'React and React Native frontends',
    ],
    tags: ['React', 'React Native', 'Node.js', 'PostgreSQL'],
  },
  {
    title: 'Climate Monitoring App',
    image: climateApp,
    year: '2019',
    role: 'IT Intern · UERJ',
    description:
      'A mobile app and Java REST API for disaster prevention, fed by a scalable network of weather stations and sensors.',
    highlights: [
      'Published on the Google Play Store',
      'Earned a project registration certificate',
    ],
    tags: ['Ionic', 'Angular', 'Java', 'REST API'],
  },
  {
    title: 'marcoaraujoneves.github.io',
    image: portfolioSite,
    year: '2026',
    role: 'Personal project',
    description:
      'This site: an Astro blog and portfolio with a custom markdown editor, dark mode, RSS and strong Core Web Vitals.',
    highlights: ['Static output, deployed with GitHub Actions'],
    tags: ['Astro', 'TypeScript', 'CSS Modules'],
    href: 'https://github.com/marcoaraujoneves/marcoaraujoneves.github.io',
    linkLabel: 'View source',
  },
]
