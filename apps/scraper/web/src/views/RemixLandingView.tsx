// ** import core packages
import { useState } from "react"
import { Wand2, Globe, Palette, ArrowRight, Sparkles } from "lucide-react"

// ** import components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ════════════════════════════════════════════════════
// REMIX LANDING VIEW
// ════════════════════════════════════════════════════

interface RemixLandingProps {
    onStartRemix: (referenceUrl: string, targetUrl: string) => void
    onBack: () => void
}

export function RemixLandingView({ onStartRemix, onBack }: RemixLandingProps) {
    const [referenceUrl, setReferenceUrl] = useState("")
    const [targetUrl, setTargetUrl] = useState("")
    const [error, setError] = useState("")

    const handleStart = () => {
        setError("")

        // Validate URLs
        try {
            new URL(referenceUrl)
        } catch {
            setError("Please enter a valid reference site URL")
            return
        }

        if (targetUrl) {
            try {
                new URL(targetUrl)
            } catch {
                setError("Please enter a valid target site URL")
                return
            }
        }

        onStartRemix(referenceUrl, targetUrl)
    }

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background overflow-hidden">
            {/* Background decoration */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
                <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-500/5 blur-3xl" />
            </div>

            <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-8 px-6">
                {/* Header */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                        <Wand2 className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Remix a Website
                    </h1>
                    <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
                        Take design principles from a reference site and apply them to rebuild your site
                        with the same brand identity. Powered by AI code generation.
                    </p>
                </div>

                {/* Input form */}
                <div className="w-full space-y-6 rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
                    {/* Reference URL */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Inspire from (Design Reference)
                        </Label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="https://asana.com"
                                value={referenceUrl}
                                onChange={(e) => setReferenceUrl(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This site's layout, components, and design patterns will be used as inspiration.
                        </p>
                    </div>

                    {/* Target URL */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                            <Palette className="h-4 w-4 text-violet-500" />
                            Remake (Your Brand)
                        </Label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="https://yoursite.com (or leave empty for brand-only mode)"
                                value={targetUrl}
                                onChange={(e) => setTargetUrl(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Your site's brand identity (colors, fonts, logo) will be preserved in the remix.
                        </p>
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <Button
                        className="w-full gap-2"
                        size="lg"
                        onClick={handleStart}
                        disabled={!referenceUrl}
                    >
                        Start Remix
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>

                {/* Back link */}
                <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={onBack}
                >
                    ← Back to Explore
                </button>

                {/* Tech stack badge */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                    <span>Generates:</span>
                    <span className="rounded bg-muted/50 px-1.5 py-0.5">React</span>
                    <span className="rounded bg-muted/50 px-1.5 py-0.5">Vite</span>
                    <span className="rounded bg-muted/50 px-1.5 py-0.5">TypeScript</span>
                    <span className="rounded bg-muted/50 px-1.5 py-0.5">Tailwind</span>
                    <span className="rounded bg-muted/50 px-1.5 py-0.5">shadcn/ui</span>
                </div>
            </div>
        </div>
    )
}
