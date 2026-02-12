import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const port = Number(process.env.VITE_PORT) || 5174
const allowedHosts = [
  "app.opendiff.dev",
  ...(process.env.VITE_ALLOWED_HOST ? [process.env.VITE_ALLOWED_HOST] : []),
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port,
    allowedHosts,
  },
  preview: {
    host: true,
    port,
    allowedHosts,
  },
  publicDir: path.resolve(__dirname, "../assets/public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
})
