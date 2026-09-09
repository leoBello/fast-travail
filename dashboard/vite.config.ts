/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    css: true,
    // Sans démontage automatique entre deux tests, deux rendus du même
    // composant laissent deux copies dans le document : `getByText`/
    // `getByRole` deviennent ambigus et échouent sur un « found multiple
    // elements » qui n'a rien à voir avec la règle testée — mesuré sur
    // `Tooltip.test.tsx` en écrivant cette tâche.
    setupFiles: ['./src/test-setup.ts'],
  },
});
