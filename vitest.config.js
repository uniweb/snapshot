import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    // The live suite launches a browser; one at a time keeps it predictable.
    fileParallelism: false,
  },
})
