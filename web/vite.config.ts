import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type ProxyOptions } from "vite"
import { configDefaults } from "vitest/config"

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env }

  // The backend serves routes at the root, so /api is stripped like it is at the ingress.
  const proxy: Record<string, ProxyOptions> = {
    "/api": {
      target: env.API_PROXY_TARGET ?? "http://localhost:8000",
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/api/, ""),
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    server: { proxy },
    preview: { proxy },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test-setup.ts"],
      css: false,
      exclude: [...configDefaults.exclude, "tests/**"],
    },
  }
})
