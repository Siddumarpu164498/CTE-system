/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#eef4ff",
          100: "#dbe7fe",
          200: "#bfd3fe",
          500: "#3b6fd8",
          600: "#2754b8",
          700: "#1f4396",
          800: "#1d3a7a",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
