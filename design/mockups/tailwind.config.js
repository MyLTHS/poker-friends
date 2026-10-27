/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)', muted: 'var(--muted)', canvas: 'var(--canvas)',
        panel: 'var(--panel)', panel2: 'var(--panel-2)', line: 'var(--line)',
        felt: 'var(--felt)', accent: 'var(--accent)', accent2: 'var(--accent-2)', danger: 'var(--danger)'
      },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)' },
      borderRadius: { ui: 'var(--radius)' },
      boxShadow: { soft: 'var(--shadow)' }
    }
  },
  plugins: []
}
