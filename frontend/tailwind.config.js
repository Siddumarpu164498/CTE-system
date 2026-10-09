/** @type {import('tailwindcss').Config} */

// Every color the UI uses resolves to a CSS variable (see src/index.css), so light and dark
// themes are swapped by toggling the `dark` class on <html> rather than by per-component variants.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name) =>
  Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]));

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        slate: scale("slate"),
        red: scale("red"),
        amber: scale("amber"),
        emerald: scale("emerald"),
        accent: scale("accent"),
        surface: "rgb(var(--surface) / <alpha-value>)",
        canvas: "rgb(var(--canvas) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 3px rgb(var(--shadow) / 0.08)",
        lift: "0 10px 30px -12px rgb(var(--shadow) / 0.25), 0 4px 10px -6px rgb(var(--shadow) / 0.12)",
        glow: "0 0 0 4px rgb(var(--accent-500) / 0.15)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        "progress-stripes": { from: { backgroundPosition: "1rem 0" }, to: { backgroundPosition: "0 0" } },
      },
      animation: {
        "fade-up": "fade-up 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) backwards",
        "fade-in": "fade-in 0.25s ease-out backwards",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.2, 0.7, 0.2, 1) backwards",
        "scale-in": "scale-in 0.25s cubic-bezier(0.2, 0.7, 0.2, 1) backwards",
        shimmer: "shimmer 1.6s linear infinite",
        "progress-stripes": "progress-stripes 0.8s linear infinite",
      },
    },
  },
  plugins: [],
};
