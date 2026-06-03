/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eff8ff",
          100: "#dbeefe",
          200: "#bfe2fe",
          300: "#93cffd",
          400: "#60b2fa",
          500: "#3b92f6",
          600: "#2474eb",
          700: "#1c5dd8",
          800: "#1d4daf",
          900: "#1d438a",
          950: "#162b54",
        },
        ink: {
          900: "#0a0f1d",
          800: "#0f1626",
          700: "#161f33",
          600: "#1f2a42",
          500: "#2b3a57",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(59,146,246,.15), 0 20px 60px -20px rgba(36,116,235,.45)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.04) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up .6s cubic-bezier(.21,1,.21,1) both",
      },
    },
  },
  plugins: [],
};
