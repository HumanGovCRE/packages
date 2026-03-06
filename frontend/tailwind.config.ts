import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        human: {
          900: "#0d1117",
          800: "#161b22",
          700: "#21262d",
          accent: "#238636",
          globe: "#1f6feb",
          orb: "#388bfd",
        },
      },
    },
  },
  plugins: [],
};
export default config;
