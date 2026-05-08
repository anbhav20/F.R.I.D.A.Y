/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        orange: {
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
        },
        amber: {
          400: "#FBBF24",
          500: "#F59E0B",
        },
      },
      backgroundOpacity: {
        12: "0.12",
        15: "0.15",
      },
    },
  },
  plugins: [],
};