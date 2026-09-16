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
       * "Modern Construction Workspace" pass: these keys keep their
       * original "brutal" names from the Neubrutalism/Skeuomorphism
       * builds on purpose -- every page composes them by hand
       * (`border-3 border-ink shadow-brutal-sm`), so retexturing the
       * *values* here reskins the whole app without touching call sites.
       * Renaming would mean re-editing every one of those call sites for
       * zero visual gain.
       *
       * This pass dials the prior skeuomorphic treatment down ~35%:
       * shorter blur radii, lower opacities, a thinner glossy highlight.
       * The tactile "raised panel" / "pressed button" concept survives
       * (per the design brief -- "keep the tactile concept but make it
       * subtle"), it's just quieter, so panels read as calm surfaces with
       * real hierarchy instead of a glossy demo.
       */
      boxShadow: {
        brutal: "0 1px 2px rgba(23,19,16,0.12), 0 3px 8px rgba(23,19,16,0.10), inset 0 1px 0 rgba(255,255,255,0.35)",
        "brutal-sm": "0 1px 1px rgba(23,19,16,0.10), 0 1px 3px rgba(23,19,16,0.08), inset 0 1px 0 rgba(255,255,255,0.3)",
        "brutal-lg": "0 2px 5px rgba(23,19,16,0.14), 0 6px 16px rgba(23,19,16,0.12), inset 0 1px 0 rgba(255,255,255,0.4)",
        "brutal-orange": "0 1px 2px rgba(194,71,10,0.22), 0 3px 8px rgba(194,71,10,0.16)",
        // Pressed-in look for a button's active state -- the inverse of
        // "brutal": shadow turns inward instead of casting outward. Kept
        // deliberately close to full strength -- "obvious but restrained"
        // press feedback is exactly the one skeuomorphic cue the brief
        // asks to keep, not soften.
        "brutal-inset": "inset 0 1px 4px rgba(0,0,0,0.28), inset 0 -1px 0 rgba(255,255,255,0.10)",
        // A visible colored glow for :focus -- unchanged in strength.
        // Accessibility focus rings are the one place this pass doesn't
        // reduce anything, since a fainter ring is a real a11y regression,
        // not a decoration to trim.
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
