import type { Config } from 'tailwindcss';

/**
 * Custom palette -- deliberately not Tailwind's default blue/indigo.
 * `brand` (violet) is the primary accent; `gold` highlights signal/alpha
 * moments; `long`/`short` are semantic direction colors, distinct from
 * Tailwind's default green-500/red-500 so they read as this app's own
 * rather than generic Tailwind defaults.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0B0D14',
          elevated: '#12141F',
          floating: '#1A1D2B',
        },
        brand: {
          50: '#F1EEFE',
          100: '#E1DAFC',
          200: '#C3B6FA',
          300: '#A591F5',
          400: '#8A6FEE',
          500: '#6C4CE0',
          600: '#5636C4',
          700: '#42299C',
          800: '#301D73',
          900: '#20144F',
        },
        gold: {
          400: '#F8BB52',
          500: '#F5A623',
          600: '#D4880F',
        },
        long: {
          DEFAULT: '#2DD4A0',
          muted: '#173B31',
        },
        short: {
          DEFAULT: '#FF5C7A',
          muted: '#3B1B24',
        },
        ink: {
          primary: '#F2F1F7',
          secondary: '#B4B2C6',
          muted: '#726F8C',
        },
        border: {
          subtle: '#242739',
          DEFAULT: '#2E3247',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tight: '-0.03em',
      },
      lineHeight: {
        relaxed: '1.7',
      },
      boxShadow: {
        elevated: '0 1px 2px 0 rgba(0,0,0,0.4), 0 4px 12px -2px rgba(108,76,224,0.08)',
        floating: '0 4px 8px -2px rgba(0,0,0,0.5), 0 12px 32px -8px rgba(108,76,224,0.16)',
        'glow-brand': '0 0 0 1px rgba(108,76,224,0.4), 0 0 24px -4px rgba(108,76,224,0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-left': { from: { opacity: '0', transform: 'translateX(-12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
