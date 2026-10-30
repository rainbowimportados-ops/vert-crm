import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt": o SW novo espera o usuário aceitar (banner de atualização).
      // Com "autoUpdate" o cache antigo era purgado no meio da sessão e as
      // páginas lazy quebravam ao carregar chunks que não existiam mais.
      registerType: "prompt",
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico", "icons/icon-192.png", "icons/icon-512.png"],
      workbox: {
        cacheId: "vert-crm-v1",
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/storage\//,
          /\/object\//,
          /\.(mp3|ogg|opus|m4a|wav|webm|mp4|jpg|jpeg|png|webp|gif|pdf)$/i,
        ],
        cleanupOutdatedCaches: true,
        // JS/CSS são pré-cacheados (nomes com hash são imutáveis), evitando
        // mistura de versões entre HTML novo e chunks antigos.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Bibliotecas pesadas ficam FORA do download inicial.
        //
        // Medido no build: xlsx 430 kB, gerador de PDF 420 kB, html2canvas
        // 201 kB e gráficos 310 kB — 1,3 MB que a maioria das telas nunca abre,
        // mas que eram baixados na primeira visita e de novo a cada
        // atualização, porque o precache leva tudo. Agora chegam sob demanda, na
        // primeira vez que alguém exporta planilha, gera PDF ou abre relatório,
        // e ficam em cache a partir daí.
        //
        // O preço: sem internet, essas três funções não abrem na primeira vez.
        // O resto do sistema continua funcionando offline.
        globIgnores: [
          "**/assets/xlsx-*.js",
          "**/assets/pdf-generator-*.js",
          "**/assets/html2canvas*.js",
          "**/assets/CategoricalChart-*.js",
        ],
        runtimeCaching: [
          {
            // As bibliotecas acima: primeira vez pela rede, depois do cache.
            // Têm hash no nome, então cache antigo nunca serve conteúdo errado.
            urlPattern: /\/assets\/(xlsx|pdf-generator|html2canvas|CategoricalChart)[^/]*\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "vert-crm-libs-v1",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Apenas navegações HTML: NetworkFirst para sempre tentar
            // entregar o shell mais novo, com fallback offline ao precache.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "vert-crm-html-v1",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },

      manifest: {
        name: "VERT CRM",
        short_name: "VERT CRM",
        description: "Atendimento de pacientes pelo WhatsApp",
        theme_color: "#A4543A",
        background_color: "#F8F4EE",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
