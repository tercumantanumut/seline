import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			// Terminal theme colors
  			terminal: {
  				cream: 'hsl(var(--terminal-cream) / <alpha-value>)',
  				'cream-dark': 'hsl(var(--terminal-cream-dark) / <alpha-value>)',
  				dark: 'hsl(var(--terminal-dark) / <alpha-value>)',
  				bg: 'hsl(var(--terminal-bg) / <alpha-value>)',
  				green: 'hsl(var(--terminal-green) / <alpha-value>)',
  				amber: 'hsl(var(--terminal-amber) / <alpha-value>)',
  				text: 'hsl(var(--terminal-text) / <alpha-value>)',
  				muted: 'hsl(var(--terminal-muted) / <alpha-value>)',
  				border: 'hsl(var(--terminal-border) / <alpha-value>)',
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		animation: {
  			blink: 'blink 1s step-end infinite',
  			'text-shine': 'text-shine 3s ease-in-out infinite',
  		},
  		keyframes: {
  			blink: {
  				'0%, 100%': { opacity: '1' },
  				'50%': { opacity: '0' },
  			},
  			'text-shine': {
  				'0%': { backgroundPosition: '200% center' },
  				'100%': { backgroundPosition: '-200% center' },
  			},
  		},
  		boxShadow: {
  			'glow-green': '0 0 8px rgba(194, 113, 79, 0.5)',
  			'glow-amber': '0 0 8px rgba(255, 176, 0, 0.5)',
  		},
  		fontFamily: {
  			sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  			mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
