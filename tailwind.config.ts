import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        surface: "#111111",
        foreground: "#F5F5F5",
        muted: "#929292",
        subtle: "#6B6B6B",
        border: "rgba(255,255,255,0.08)",
        accent: "#C8FF00",
        positive: "#C8FF00",
        negative: "#E57373",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      maxWidth: {
        site: "1360px",
        prose: "640px",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
