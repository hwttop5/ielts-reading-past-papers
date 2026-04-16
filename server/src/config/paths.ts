import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export const serverRoot = resolve(currentDir, '../..')
export const repoRoot = resolve(currentDir, '../../..')
export const publicRoot = resolve(repoRoot, 'public')
export const questionIndexPath = resolve(repoRoot, 'src/utils/questionIndex.json')
export const similarRecommendationsPath = resolve(repoRoot, 'src/generated/reading-native/similar-recommendations.json')
