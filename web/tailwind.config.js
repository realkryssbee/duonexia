// Configuration Tailwind CSS v3 — l'interface est épurée : palette slate
// par défaut + accents par état (statuts, alertes). Pas de design system
// maison : outil interne à deux personnes.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
