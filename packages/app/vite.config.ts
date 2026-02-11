import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5174,
    allowedHosts: ["app.opendiff.dev"],
  },
  preview: {
    host: true,
    port: 5174,
    allowedHosts: ["app.opendiff.dev"],
  },
  publicDir: path.resolve(__dirname, "../assets/public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
})
