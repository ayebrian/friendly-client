import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { securityHeaders } from './scripts/security-headers.ts';

// Paint the selected theme while app assets download, using the shared palette.
function initialTheme() {
  return {
    name: 'initial-theme',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        const source = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
        const declarations = (selector: string) => {
          const block = source.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1];
          if (!block) throw new Error(`Missing theme palette: ${selector}`);
          return [
            ...block.matchAll(
              /(--(?:background|foreground|card|secondary|color-canvas)):\s*([^;]+);/g,
            ),
          ]
            .map((match) => `${match[1]}:${match[2]};`)
            .join('');
        };
        const light = declarations(':root');
        const dark = declarations('\\.dark');
        const canvas = source.match(/--secondary:\s*([^;]+);/)?.[1];
        if (!canvas) throw new Error('Missing initial canvas color');
        const css = `:root{${light}background:var(--color-canvas);color:var(--foreground);color-scheme:light}
          .dark{${dark}color-scheme:dark}
          @media(prefers-color-scheme:dark){:root:not(.light):not(.dark){${dark}color-scheme:dark}}
          body{margin:0;background:var(--color-canvas)}`;
        return html
          .replace('<!-- initial-theme-styles -->', `<style id="initial-theme">${css}</style>`)
          .replace('%INITIAL_THEME_COLOR%', canvas);
      },
    },
  };
}

export default defineConfig({
  plugins: [initialTheme(), react(), tailwindcss(), securityHeaders()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
