import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "oklch(0.985 0.006 210)",
        foreground: "oklch(0.22 0.018 220)",
        muted: "oklch(0.94 0.01 210)",
        "muted-foreground": "oklch(0.47 0.02 220)",
        border: "oklch(0.86 0.012 210)",
        primary: "oklch(0.52 0.08 195)",
        "primary-foreground": "oklch(0.985 0.006 210)",
        accent: "oklch(0.88 0.045 80)",
        danger: "oklch(0.58 0.12 25)",
        success: "oklch(0.56 0.09 145)",
        warning: "oklch(0.69 0.1 85)"
      },
      boxShadow: {
        soft: "0 12px 36px rgba(58, 80, 92, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
