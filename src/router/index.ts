import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import Home from '@/views/Home.vue'
import Browse from '@/views/Browse.vue'
import Practice from '@/views/Practice.vue'
import PracticeMode from '@/views/PracticeMode.vue'
import MyAchievements from '@/views/MyAchievements.vue'
import NotFound from '@/views/NotFound.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/', 
      component: MainLayout,
      children: [
        { path: '', redirect: '/home' },
        { path: 'home', component: Home },
        { path: 'browse', component: Browse },
        { path: 'practice', component: Practice },
        { path: 'practice-mode', component: PracticeMode },
        { path: 'my-achievements', component: MyAchievements }
      ]
    },
    { path: '/:pathMatch(.*)*', component: NotFound }
  ]
})

export default router
