import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const port = Number(process.env.VITE_PORT) || 5174
const defaultAllowedHosts = ["localhost", "127.0.0.1", "app.opendiff.dev", ".opendiff.dev"]
const allowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  : defaultAllowedHosts

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
