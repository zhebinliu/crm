import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // ── Tokenwave Design System color tokens ──────────────────────────
        brand: {
          DEFAULT: '#FF8D1A',
          deep:    '#D96400',
          light:   '#FFF4E6',
          50:  '#FFF4E6',
          100: '#FFE4BC',
          200: '#FFD08F',
          300: '#FFBB62',
          400: '#FFA83A',
          500: '#FF8D1A',
          600: '#E87800',
          700: '#D96400',
          800: '#B54F00',
          900: '#8C3C00',
          950: '#5C2700',
        },
        // Text / ink
        ink: {
          DEFAULT:   '#1A1D2E',
          secondary: '#6B7280',
          muted:     '#9CA3AF',
          inverse:   '#FFFFFF',
        },
        // Surface / background
        surface: {
          DEFAULT:   '#FFFFFF',
          secondary: '#F5F6FA',
          tertiary:  '#ECEDF2',
          inverse:   '#1A1D2E',
        },
        // Border
        border: {
          DEFAULT: '#E8E9EE',
          strong:  '#D0D3DE',
        },
        // Semantic status colors (for badges)
        success: {
          DEFAULT: '#10B981',
          light:   '#D1FAE5',
          text:    '#065F46',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light:   '#FEF3C7',
          text:    '#92400E',
        },
        danger: {
          DEFAULT: '#EF4444',
          light:   '#FEE2E2',
          text:    '#991B1B',
        },
        info: {
          DEFAULT: '#3B82F6',
          light:   '#DBEAFE',
          text:    '#1E40AF',
        },
        purple: {
          DEFAULT: '#8B5CF6',
          light:   '#EDE9FE',
          text:    '#5B21B6',
        },
      },
      borderRadius: {
        sm:      '6px',
        DEFAULT: '10px',
        md:      '10px',
        lg:      '14px',
        xl:      '18px',
        '2xl':   '24px',
        full:    '9999px',
      },
      boxShadow: {
        card:     '0 1px 4px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        dropdown: '0 4px 20px 0 rgb(0 0 0 / 0.10)',
        modal:    '0 24px 64px 0 rgb(0 0 0 / 0.14)',
        focus:    '0 0 0 3px rgb(255 141 26 / 0.25)',
      },
      fontSize: {
        '2xs': ['11.5px', { lineHeight: '1.6' }],
        xs:    ['12px',   { lineHeight: '1.6' }],
        sm:    ['13px',   { lineHeight: '1.6' }],
        base:  ['14px',   { lineHeight: '1.6' }],
        md:    ['15px',   { lineHeight: '1.5' }],
        lg:    ['16px',   { lineHeight: '1.5' }],
        xl:    ['18px',   { lineHeight: '1.4' }],
        '2xl': ['24px',   { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
};
export default config;
