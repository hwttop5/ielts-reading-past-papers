import { env } from './config/env.js'
import { createApp } from './app.js'

const app = await createApp()

try {
  await app.listen({
    host: '0.0.0.0',
    port: env.PORT
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
