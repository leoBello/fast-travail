import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Un seul fichier HTML autonome : scripts, styles et polices embarqués, pour que la maquette
// s'envoie et s'ouvre sans serveur ni connexion.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: { dedupe: ['react', 'react-dom', 'motion'] },
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false },
});
