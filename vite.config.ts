import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Tło ekranu startowego Androida (jeden kolor, bez wariantu ciemnego) – kolor nocnego nieba z ekranu startowego iOS
const SPLASH_BG = '#0B0B14';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const iconDir = env.VITE_ICON_DIR;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Oznaczenie wdrożenia (skrót commita w GitHub Actions), żeby na telefonie było widać, która wersja jest wczytana
      __BUILD_ID__: JSON.stringify((process.env.BUILD_ID ?? process.env.GITHUB_SHA)?.slice(0, 7) ?? 'lokalna'),
    },
    plugins: [
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,webmanifest}', 'splash/splash.jpg'],
          // obrazy startowe iOS pobiera system przy instalacji – nie trzymamy ich w pamięci offline
          globIgnores: ['splash/splash-*.jpg', `icons/${mode === 'production' ? 'test' : 'prod'}/**`],
        },
        manifest: {
          id: '/',
          name: env.VITE_APP_NAME,
          short_name: env.VITE_APP_SHORT_NAME,
          description: 'Wyjazdy grupy: plan, informacje i checklisty w jednym miejscu.',
          lang: 'pl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: SPLASH_BG,
          theme_color: SPLASH_BG,
          icons: [
            { src: `${iconDir}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${iconDir}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${iconDir}/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: `${iconDir}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: { enabled: false, type: 'module' },
      }),
    ],
  };
});
