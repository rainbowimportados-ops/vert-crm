import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
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
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          dark: "hsl(var(--primary-dark))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        // Régua de preços: o par claro/escuro é aplicado com `dark:` em
        // src/lib/price-bands.ts, por isso lê os primitivos direto.
        "success-strong": "hsl(var(--verde-700))",
        "success-strong-dark": "hsl(var(--verde-450))",
        "info-dark": "hsl(var(--azul-300))",
        // Vocabulário novo do design system (MASTER.md §1), sobre os mesmos
        // tokens: canvas é o fundo do app, surface é onde o conteúdo mora.
        canvas: "hsl(var(--background))",
        surface: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "border-strong": "hsl(var(--border-strong))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
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
      // Movimento — os utilitários leem os tokens de index.css (:root).
      // `ease-out`/`ease-in`/`ease-in-out` sobrescrevem de propósito as curvas
      // embutidas do Tailwind: as do CSS não têm força suficiente, e assim todo
      // `ease-out` já escrito no projeto passa a usar a curva da casa.
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
        "exit-fast": "var(--duration-exit-fast)",
        "exit-base": "var(--duration-exit-base)",
        "exit-slow": "var(--duration-exit-slow)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
        surface: "var(--ease-surface)",
      },
      // Raio 4 · 6 · 8, e oito é o teto. `xl` e acima são rebaixados para o
      // teto de propósito: 301 usos de rounded-2xl no código passam a
      // respeitar o limite sem que cada tela precise ser tocada. `full`
      // continua sendo círculo (avatar, selo).
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius)",
        "2xl": "var(--radius)",
        "3xl": "var(--radius)",
      },
      fontFamily: {
        // Uma família para toda a operação, auto-hospedada (importada em
        // src/main.tsx). Antes, `-apple-system` vinha primeiro e a Jakarta
        // nunca era carregada: cada sistema operacional via uma fonte.
        sans: [
          "Plus Jakarta Sans Variable",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        // Só o logotipo. Nenhum título, tabela, botão ou campo usa serifa.
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.98)" },
        },
        "page-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "check-in": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "60%": { opacity: "1", transform: "scale(1.15)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down var(--duration-base) var(--ease-out)",
        "accordion-up": "accordion-up var(--duration-exit-base) var(--ease-in)",
        "fade-in": "fade-in var(--duration-base) var(--ease-out)",
        "slide-in": "slide-in var(--duration-base) var(--ease-out)",
        "scale-in": "scale-in var(--duration-base) var(--ease-out)",
        "scale-out": "scale-out var(--duration-exit-base) var(--ease-in)",
        "page-in": "page-in var(--duration-base) var(--ease-out)",
        shimmer: "shimmer 1.6s var(--ease-in-out) infinite",
        "check-in": "check-in var(--duration-slow) var(--ease-out)",
      },
      boxShadow: {
        "elevation-sm": "var(--shadow-sm)",
        "elevation-md": "var(--shadow-md)",
        "elevation-lg": "var(--shadow-lg)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
