import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import Home from '@/views/Home.vue'
import Browse from '@/views/Browse.vue'
import Practice from '@/views/Practice.vue'
import PracticeMode from '@/views/PracticeMode.vue'
import MyAchievements from '@/views/MyAchievements.vue'
import ResetPassword from '@/views/ResetPassword.vue'
import NotFound from '@/views/NotFound.vue'
import questionIndex from '@/utils/questionIndex.json'
import { NEW_SITE_URL } from '@/utils/siteMigration'

const SITE_URL = NEW_SITE_URL
const DEFAULT_TITLE = 'IELTS Reading Past Papers'
const DEFAULT_DESCRIPTION = 'Practice IELTS Reading past papers online with a community question bank, PDF references, progress tracking, review tools, and an AI study assistant.'

function setMeta(name: string, content: string, attribute = 'name') {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function setCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }
  element.setAttribute('href', url)
}

function getPracticeModeHead(queryId: unknown) {
  if (typeof queryId !== 'string') {
    return null
  }

  const question = (questionIndex as Array<{ id: string; title: string; category?: string }>).find((item) => item.id === queryId)
  if (!question) {
    return null
  }

  return {
    title: `${question.title} | IELTS Reading Practice`,
    description: `Practice ${question.title}${question.category ? ` (${question.category})` : ''} online with IELTS Reading answers, review tools, PDF reference, and an AI study assistant.`
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/', 
      component: MainLayout,
      children: [
        { path: '', redirect: '/home' },
        {
          path: 'home',
          component: Home,
          meta: {
            title: DEFAULT_TITLE,
            description: DEFAULT_DESCRIPTION,
            robots: 'index,follow'
          }
        },
        {
          path: 'browse',
          component: Browse,
          meta: {
            title: 'IELTS Reading Question Bank | IELTS Reading Past Papers',
            description: 'Browse IELTS Reading practice passages by passage type and frequency, search question titles, open PDF references, and start online practice.',
            robots: 'index,follow'
          }
        },
        {
          path: 'practice',
          component: Practice,
          meta: {
            title: 'Practice Records | IELTS Reading Past Papers',
            description: 'View local IELTS Reading practice history, progress, import and export data, and review completed attempts.',
            robots: 'noindex,follow'
          }
        },
        {
          path: 'practice-mode',
          component: PracticeMode,
          meta: {
            title: 'IELTS Reading Practice | IELTS Reading Past Papers',
            description: 'Practice an IELTS Reading passage online with timing, answers, review tools, highlights, notes, PDF reference, and an AI study assistant.',
            robots: 'noindex,follow'
          }
        },
        {
          path: 'my-achievements',
          component: MyAchievements,
          meta: {
            title: 'My Achievements | IELTS Reading Past Papers',
            description: 'View local IELTS Reading study achievements and progress milestones.',
            robots: 'noindex,follow'
          }
        },
        {
          path: 'reset-password',
          component: ResetPassword,
          meta: {
            title: 'Reset Password | IELTS Reading Past Papers',
            description: 'Set a new password for your IELTS Reading Past Papers account.',
            robots: 'noindex,nofollow'
          }
        },
        {
          path: ':pathMatch(.*)*',
          component: NotFound,
          meta: {
            title: 'Page Not Found | IELTS Reading Past Papers',
            description: DEFAULT_DESCRIPTION,
            robots: 'noindex,follow'
          }
        }
      ]
    }
  ]
})

router.afterEach((to) => {
  const practiceModeHead = to.path === '/practice-mode' ? getPracticeModeHead(to.query.id) : null
  const title = practiceModeHead?.title || (typeof to.meta.title === 'string' ? to.meta.title : DEFAULT_TITLE)
  const description = practiceModeHead?.description || (typeof to.meta.description === 'string' ? to.meta.description : DEFAULT_DESCRIPTION)
  const robots = typeof to.meta.robots === 'string' ? to.meta.robots : 'index,follow'
  const canonicalUrl = `${SITE_URL}${to.path === '/' ? '/home' : to.path}`

  document.title = title
  setMeta('description', description)
  setMeta('robots', robots)
  setMeta('og:title', title, 'property')
  setMeta('og:description', description, 'property')
  setMeta('og:url', canonicalUrl, 'property')
  setCanonical(canonicalUrl)
})

export default router
