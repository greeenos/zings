import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
          extrusion: "hsl(var(--primary-extrusion))",
          // Green that is legible as text and icons on surfaces.
          strong: "hsl(var(--primary-strong))",
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
        star: {
          DEFAULT: "hsl(var(--star))",
          soft: "hsl(var(--star-soft))",
        },
        today: {
          DEFAULT: "hsl(var(--today))",
          soft: "hsl(var(--today-soft))",
        },
        "primary-soft": "hsl(var(--primary-soft))",
        // Status colours (design system §14): today is blue, upcoming purple,
        // due soon amber, overdue red ("today" token, kept for history).
        upcoming: "hsl(var(--upcoming))",
        "due-soon": "hsl(var(--due-soon))",
        success: "hsl(var(--success))",
        info: "hsl(var(--info))",
        icon: "hsl(var(--icon))",
        divider: "hsl(var(--divider))",
        faint: "hsl(var(--text-muted))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      transitionTimingFunction: {
        zings: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
        xl: "14px",
        "2xl": "16px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
