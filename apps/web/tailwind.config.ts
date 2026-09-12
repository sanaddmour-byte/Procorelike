import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171310",
        cream: "#fbf4e8",
        maroon: {
          50: "#fbebec",
          100: "#f4c9cc",
          300: "#c46672",
          500: "#8a2332",
          600: "#731c29",
          700: "#5c1620",
          800: "#451018",
          900: "#2e0a10",
        },
        navy: {
          50: "#eef1f8",
          100: "#ccd6ea",
          300: "#6f88b8",
          500: "#1f3564",
          600: "#182a51",
          700: "#13213f",
          800: "#0d182d",
          900: "#080f1c",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        brutal: "4px 4px 0 0 #171310",
        "brutal-sm": "2px 2px 0 0 #171310",
        "brutal-lg": "7px 7px 0 0 #171310",
        "brutal-orange": "4px 4px 0 0 #c2470a",
      },
      borderWidth: {
        3: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
