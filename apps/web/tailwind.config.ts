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
      /*
       * Skeuomorphism pass (same maroon/navy/orange/ink/cream palette as
       * the Neubrutalism build): these keys keep their original "brutal"
       * names on purpose -- every page composes them by hand
       * (`border-3 border-ink shadow-brutal-sm`), so retexturing the
       * *values* here reskins the whole app without touching call sites.
       * Renaming would mean re-editing every one of those call sites for
       * zero visual gain.
       */
      boxShadow: {
        // Soft ambient + directional shadow with a glossy top highlight,
        // replacing the old hard 0-blur offset shadow.
        brutal: "0 2px 4px rgba(23,19,16,0.18), 0 6px 14px rgba(23,19,16,0.16), inset 0 1px 0 rgba(255,255,255,0.55)",
        "brutal-sm": "0 1px 2px rgba(23,19,16,0.16), 0 2px 5px rgba(23,19,16,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
        "brutal-lg": "0 4px 8px rgba(23,19,16,0.20), 0 12px 28px rgba(23,19,16,0.18), inset 0 1px 0 rgba(255,255,255,0.6)",
        "brutal-orange": "0 2px 4px rgba(194,71,10,0.35), 0 6px 14px rgba(194,71,10,0.25)",
        // Pressed-in look for a button's active state -- the inverse of
        // "brutal": shadow turns inward instead of casting outward.
        "brutal-inset": "inset 0 2px 5px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.12)",
        // A visible colored glow for :focus, now that shadow-brutal-sm on
        // its own reads too soft to double as a focus ring.
        focus: "0 0 0 3px rgba(140,35,50,0.35)",
      },
      borderWidth: {
        // Thick flat ink borders were the Neubrutalism signature;
        // skeuomorphism signals depth with shadow + gradient instead, so
        // this now renders as a hairline edge everywhere `border-3` is
        // already used.
        3: "1px",
      },
    },
  },
  plugins: [],
};

export default config;
