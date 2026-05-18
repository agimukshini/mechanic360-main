/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#111827',
        secondary: '#4b5563',
        accent: '#3b82f6',
        danger: '#ef4444',
        warning: '#f59e0b',
        success: '#10b981',
        surface: '#ffffff',
        background: '#f3f4f6',
        border: '#e5e7eb',
        workshop: {
          charcoal: '#111827',
          blue: '#3b82f6',
          cyan: '#0891b2',
          gray: '#f3f4f6',
        },
        brand: {
          primary: '#3b82f6',
          'primary-dark': '#2563eb',
        },
        'brand-primary': '#3b82f6',
        'brand-primary-dark': '#2563eb',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        float: '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
}
