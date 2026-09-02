/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        gold: {
          DEFAULT: "var(--gold, #2C6FBD)",
          light: "var(--gold-light, #60A3E6)",
          dark: "#1E4E8C",
          dim: "rgba(44, 111, 189, 0.14)",
        },
        ink: {
          DEFAULT: "#0B0E23",
          2: "#151C3A",
          soft: "#2A3352",
        },
        cream: {
          DEFAULT: "#F7F8FC",
          dark: "#ECEEF7",
        },
        slate: {
          DEFAULT: "#1A2340",
          muted: "#6B7290",
          line: "#E3E6F0",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "#2F9E5B",
          bg: "#E7F5EC",
        },
        danger: {
          DEFAULT: "#C24545",
          bg: "#FBEAEA",
        },
        warn: {
          DEFAULT: "#B8860B",
          bg: "#FBF2DC",
        },
      },
      borderRadius: {
        lg: "var(--radius, 12px)",
        md: "calc(var(--radius, 12px) - 2px)",
        sm: "calc(var(--radius, 12px) - 4px)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Golos Text", "sans-serif"],
        body: ["var(--font-body)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        premium: "0 10px 30px -10px rgba(11, 14, 35, 0.15)",
        card: "0 4px 20px -2px rgba(11, 14, 35, 0.06)",
        glow: "0 0 20px rgba(44, 111, 189, 0.25)",
      },
    },
  },
  plugins: [],
};
