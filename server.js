import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// Serve static assets with aggressive caching
app.use(express.static(join(__dirname, 'dist'), {
  maxAge: '1y',
  etag: false,
}))

// React Router: rewrite all other requests to index.html
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
