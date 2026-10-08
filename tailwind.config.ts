import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8ff',
          100: '#d9f0ff',
          200: '#bfe6ff',
          300: '#8dd4ff',
          400: '#53b9ff',
          500: '#2196f3',
          600: '#1073d8',
          700: '#115bad',
          800: '#154d8c',
          900: '#183f73',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,197,94,.3), 0 10px 40px rgba(34,197,94,.18)',
      },
    },
  },
  plugins: [],
};

export default config;
