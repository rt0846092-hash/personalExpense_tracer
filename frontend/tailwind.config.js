/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        blue: { light: '#eff6ff', mid: '#bfdbfe', DEFAULT: '#2563eb' },
        green: { light: '#ecfdf5', DEFAULT: '#059669' },
        red: { light: '#fef2f2', DEFAULT: '#dc2626' },
        amber: { light: '#fef3c7', DEFAULT: '#d97706' },
        nepal: { light: '#f0f3fe', DEFAULT: '#2563eb' },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.04)',
        cardMd: '0 4px 12px rgba(0,0,0,.09)',
      },
      borderRadius: {
        card: '10px',
        cardLg: '14px',
      },
    },
  },
  plugins: [],
}
