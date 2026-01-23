import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev, o front fala com o backend por proxy (evita CORS e mantém a mesma origem do browser).
// Ajuste a porta do backend aqui se precisar.
const BACKEND_TARGET = "http://127.0.0.1:3000";

function swallowProxyErrors() {
  return (proxy: any) => {
    // Evita que erros transitórios (backend reiniciando / socket fechando) derrubem o Vite.
    proxy.on("error", () => {});
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/assets": {
        target: BACKEND_TARGET,
        changeOrigin: true,
        configure: swallowProxyErrors()
      },
      "/api": {
        target: BACKEND_TARGET,
        changeOrigin: true,
        configure: swallowProxyErrors()
      },
      "/socket.io": {
        target: BACKEND_TARGET,
        ws: true,
        changeOrigin: true,
        configure: swallowProxyErrors()
      }
    }
  }
});

