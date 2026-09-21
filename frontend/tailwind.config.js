/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // One palette for the whole dashboard: surfaces, then a single hue per
        // metric so a colour means the same thing on every chart and card.
        surface: {
          950: '#0a0f1a',
          900: '#0f1626',
          800: '#151e33',
          700: '#1d2842',
          600: '#2a3554',
        },
        metric: {
          revenue: '#38bdf8',
          orders: '#a78bfa',
          signups: '#34d399',
          users: '#fbbf24',
          danger: '#f87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'flash-in': {
          '0%': { backgroundColor: 'rgba(56, 189, 248, 0.16)', transform: 'translateY(-4px)' },
          '100%': { backgroundColor: 'transparent', transform: 'translateY(0)' },
        },
      },
      animation: {
        'flash-in': 'flash-in 900ms ease-out',
      },
    },
  },
  plugins: [],
};
