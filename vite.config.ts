import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      proxy: {
        "/api/v1": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;

            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/")
            ) {
              return "react-vendor";
            }

            if (
              id.includes("/react-markdown/") ||
              id.includes("/remark-gfm/") ||
              id.includes("/remark-") ||
              id.includes("/rehype-") ||
              id.includes("/unified/") ||
              id.includes("/mdast-") ||
              id.includes("/micromark") ||
              id.includes("/hast-") ||
              id.includes("/property-information/") ||
              id.includes("/vfile/")
            ) {
              return "markdown-vendor";
            }

            if (id.includes("/lucide-react/")) {
              return "icon-vendor";
            }

            if (id.includes("/dompurify/")) {
              return "sanitize-vendor";
            }

            return "vendor";
          },
        },
      },
    },
  };
});
