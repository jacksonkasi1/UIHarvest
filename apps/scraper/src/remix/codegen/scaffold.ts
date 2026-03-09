// ** import types
import type { RemixSpec, GeneratedFile } from "../types.js";

// ════════════════════════════════════════════════════
// PROJECT SCAFFOLD GENERATOR
// ════════════════════════════════════════════════════
// Generates the base Vite + React + Tailwind + shadcn project files.

/**
 * HSL approximation from hex string.
 */
function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0% 50%";

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Generate the package.json for the scaffold.
 */
function generatePackageJson(spec: RemixSpec): string {
  return JSON.stringify(
    {
      name: spec.brand.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.1.0",
        "react-dom": "^19.1.0",
        "class-variance-authority": "^0.7.1",
        clsx: "^2.1.1",
        "tailwind-merge": "^3.0.2",
        "lucide-react": "^0.468.0",
        "@radix-ui/react-slot": "^1.1.1",
      },
      devDependencies: {
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        "@vitejs/plugin-react": "^4.5.0",
        autoprefixer: "^10.4.21",
        postcss: "^8.5.3",
        tailwindcss: "^3.4.17",
        typescript: "^5.8.3",
        vite: "^6.3.5",
      },
    },
    null,
    2
  );
}

/**
 * Generate tailwind.config.ts with brand tokens.
 */
function generateTailwindConfig(spec: RemixSpec): string {
  const headingFont = spec.brand.typography.find((t) => t.role === "heading");
  const bodyFont = spec.brand.typography.find((t) => t.role === "body");

  return `import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        heading: [${headingFont ? `"${headingFont.family}"` : '"Inter"'}, "sans-serif"],
        body: [${bodyFont ? `"${bodyFont.family}"` : '"Inter"'}, "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionTimingFunction: {
        brand: "${spec.principles.motionStyle.easing}",
      },
      transitionDuration: {
        brand: "${spec.principles.motionStyle.duration}",
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

/**
 * Generate index.css with CSS custom properties from brand.
 */
function generateIndexCss(spec: RemixSpec): string {
  const primary = spec.brand.colors.find((c) => c.role === "primary");
  const secondary = spec.brand.colors.find((c) => c.role === "secondary") ?? spec.brand.colors.find((c) => c.role === "accent");
  const accent = spec.brand.colors.find((c) => c.role === "accent") ?? secondary;
  const bg = spec.brand.colors.find((c) => c.role === "background") ?? spec.brand.colors.find((c) => c.role === "surface");
  const text = spec.brand.colors.find((c) => c.role === "text");
  const muted = spec.brand.colors.find((c) => c.role === "muted");
  const border = spec.brand.colors.find((c) => c.role === "border");

  const hsl = (color: { hex: string } | undefined, fallback: string) =>
    color ? hexToHsl(color.hex) : fallback;

  // Build Google Fonts import
  const googleFonts = spec.brand.typography
    .filter((t) => t.source === "google")
    .map((t) => {
      const weights = t.weights.join(";");
      return `${t.family.replace(/\s/g, "+")}:wght@${weights}`;
    });

  const fontImport = googleFonts.length > 0
    ? `@import url('https://fonts.googleapis.com/css2?${googleFonts.map((f) => `family=${f}`).join("&")}&display=swap');\n\n`
    : "";

  return `${fontImport}@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: ${hsl(bg, "0 0% 100%")};
    --foreground: ${hsl(text, "0 0% 3.9%")};
    --card: ${hsl(bg, "0 0% 100%")};
    --card-foreground: ${hsl(text, "0 0% 3.9%")};
    --primary: ${hsl(primary, "221 83% 53%")};
    --primary-foreground: 0 0% 98%;
    --secondary: ${hsl(secondary, "210 40% 96%")};
    --secondary-foreground: ${hsl(text, "0 0% 9%")};
    --accent: ${hsl(accent, "210 40% 96%")};
    --accent-foreground: ${hsl(text, "0 0% 9%")};
    --muted: ${hsl(muted, "210 40% 96%")};
    --muted-foreground: 0 0% 45%;
    --border: ${hsl(border, "214 32% 91%")};
    --ring: ${hsl(primary, "221 83% 53%")};
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: ${hsl(primary, "221 83% 53%")};
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --border: 0 0% 14.9%;
    --ring: ${hsl(primary, "221 83% 53%")};
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-body antialiased;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply font-heading;
  }
}
`;
}

/**
 * Generate vite.config.ts
 */
function generateViteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
`;
}

/**
 * Generate tsconfig.json
 */
function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        isolatedModules: true,
        moduleDetection: "force",
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noFallthroughCasesInSwitch: true,
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
        },
      },
      include: ["src"],
    },
    null,
    2
  );
}

/**
 * Generate components.json for shadcn
 */
function generateComponentsJson(): string {
  return JSON.stringify(
    {
      $schema: "https://ui.shadcn.com/schema.json",
      style: "new-york",
      rsc: false,
      tsx: true,
      tailwind: {
        config: "tailwind.config.ts",
        css: "src/index.css",
        baseColor: "neutral",
        cssVariables: true,
      },
      aliases: {
        components: "@/components",
        utils: "@/lib/utils",
        ui: "@/components/ui",
        lib: "@/lib",
      },
    },
    null,
    2
  );
}

/**
 * Generate postcss.config.js
 */
function generatePostcssConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}


/**
 * Generate src/lib/utils.ts (shadcn cn utility)
 */
function generateUtils(): string {
  return `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;
}

// ════════════════════════════════════════════════════
// SHADCN UI COMPONENTS
// ════════════════════════════════════════════════════

function generateButtonComponent(): string {
  return `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-500/90",
        outline: "border border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`;
}

function generateCardComponent(): string {
  return `import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl border bg-card text-card-foreground shadow", className)} {...props} />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
`;
}

function generateBadgeComponent(): string {
  return `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-red-500 text-white shadow hover:bg-red-500/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
`;
}

function generateInputComponent(): string {
  return `import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
`;
}

function generateSeparatorComponent(): string {
  return `import * as React from "react";
import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? "none" : "separator"}
      aria-orientation={!decorative ? orientation : undefined}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = "Separator";

export { Separator };
`;
}

/**
 * Generate index.html
 */
function generateIndexHtml(spec: RemixSpec): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${spec.brand.name}</title>
    <meta name="description" content="${spec.brand.metaDescription || spec.brand.name}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

// ════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════

/**
 * Generate all scaffold files for the Vite project.
 */
export function generateScaffold(spec: RemixSpec): GeneratedFile[] {
  return [
    { path: "package.json", content: generatePackageJson(spec) },
    { path: "vite.config.ts", content: generateViteConfig() },
    { path: "tailwind.config.ts", content: generateTailwindConfig(spec) },
    { path: "tsconfig.json", content: generateTsConfig() },
    { path: "components.json", content: generateComponentsJson() },
    { path: "postcss.config.js", content: generatePostcssConfig() },
    { path: "index.html", content: generateIndexHtml(spec) },
    { path: "src/index.css", content: generateIndexCss(spec) },
    { path: "src/lib/utils.ts", content: generateUtils() },
    // shadcn UI components
    { path: "src/components/ui/button.tsx", content: generateButtonComponent() },
    { path: "src/components/ui/card.tsx", content: generateCardComponent() },
    { path: "src/components/ui/badge.tsx", content: generateBadgeComponent() },
    { path: "src/components/ui/input.tsx", content: generateInputComponent() },
    { path: "src/components/ui/separator.tsx", content: generateSeparatorComponent() },
    {
      path: "src/main.tsx",
      content: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
    },
  ];
}

