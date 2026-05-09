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
        // Brand palette derived from the tokenwave logo cyan gradient
        // (icon top: ~#22D3EE → bottom: ~#0E7490). Aligns with Tailwind's
        // built-in cyan family so utilities like cyan-50 stay visually
        // consistent with the brand-* tokens.
        brand: {
          DEFAULT: '#06B6D4',
          deep:    '#0E7490',
          light:   '#ECFEFF',
          50:  '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
          950: '#083344',
        },
        // Text / ink
        ink: {
          DEFAULT:   '#1A1A1A',
          secondary: '#4A4A4A',
          muted:     '#8A8A8A',
          inverse:   '#FFFFFF',
        },
        // Surface / background
        surface: {
          DEFAULT:   '#FFFFFF',
          secondary: '#F7F7F8',
          tertiary:  '#EBEBED',
          inverse:   '#1A1A1A',
        },
        // Border
        border: {
          DEFAULT: '#E5E7EB',
          strong:  '#D1D5DB',
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
        sm:      '4px',
        DEFAULT: '6px',
        md:      '6px',
        lg:      '8px',
        xl:      '12px',
        '2xl':   '16px',
        full:    '9999px',
      },
      boxShadow: {
        card:     '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        dropdown: '0 4px 16px 0 rgb(0 0 0 / 0.10)',
        modal:    '0 20px 60px 0 rgb(0 0 0 / 0.14)',
        focus:    '0 0 0 3px rgb(6 182 212 / 0.25)',
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
