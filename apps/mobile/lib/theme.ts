/**
 * Neubrutalism design tokens shared across the mobile app: thick ink
 * borders, hard offset shadows, and the maroon / navy / orange palette.
 * Kept in one file so every screen's StyleSheet pulls the same values
 * instead of re-declaring hex literals.
 */

export const colors = {
  ink: "#171310",
  cream: "#fbf4e8",
  white: "#ffffff",

  maroon50: "#fbebec",
  maroon100: "#f4c9cc",
  maroon600: "#731c29",
  maroon700: "#5c1620",
  maroon800: "#451018",

  navy50: "#eef1f8",
  navy100: "#ccd6ea",
  navy600: "#182a51",
  navy700: "#13213f",
  navy800: "#0d182d",
  navy900: "#080f1c",

  orange50: "#fff4e6",
  orange100: "#ffe4bf",
  orange500: "#f97316",
  orange600: "#ea6a0a",
  orange700: "#c2470a",
  orange800: "#9a3412",
  orange900: "#7c2d12",
} as const;

export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extrabold: "Poppins_800ExtraBold",
} as const;

/** Hard offset shadow: crisp on iOS; falls back to a standard Android elevation shadow (no offset control on that platform). */
export function brutalShadow(size: 2 | 3 | 4 = 3) {
  return {
    shadowColor: colors.ink,
    shadowOffset: { width: size, height: size },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: size + 1,
  };
}

export const borders = {
  thick: 3,
  radius: 12,
};
