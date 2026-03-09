import { Palette, Layout, Type, Zap, Wand2 } from "lucide-react"

const SUGGESTION_CHIPS = [
    { label: "Change colors", icon: Palette, prompt: "Change the primary color to a warm coral and adjust the overall color palette to feel more inviting" },
    { label: "Add a footer", icon: Layout, prompt: "Add a beautiful footer section with links, social media icons, and a newsletter signup" },
    { label: "Better typography", icon: Type, prompt: "Improve the typography hierarchy — make headings bolder, add better letter-spacing and line-height" },
    { label: "Add animations", icon: Zap, prompt: "Add subtle entrance animations and hover effects to make the page feel more alive" },
    { label: "Dark Mode", icon: Wand2, prompt: "Switch to a dark theme with rich, deep backgrounds and bright accent colors" }
]

export function WelcomeHero({
    containerReady,
    isBootingContainer,
    onSuggestionClick
}: {
    containerReady: boolean
    isBootingContainer: boolean
    onSuggestionClick: (prompt: string) => void
}) {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 pt-2 px-1 pb-4">
            <div className="space-y-3">
                <div className="font-semibold text-foreground text-base">
                    {containerReady ? "Your remix is live! 🎉" : isBootingContainer ? "Code generated!" : "Your remix is ready!"}
                </div>
                <div className="text-[14px] text-muted-foreground leading-relaxed max-w-[90%]">
                    {containerReady
                        ? "I'll create a stunning workspace inspired by clean, modern design principles. Chat with me about anything, or ask me to make changes — colors, layout, sections, typography, animations."
                        : isBootingContainer
                            ? "Starting the live preview environment… I'll be ready in just a moment."
                            : "Ask me to make changes — I can modify anything."}
                </div>
            </div>

            {/* Suggestion chips */}
            {containerReady && (
                <div className="pt-2 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-200">
                    <p className="text-[12px] text-foreground font-semibold mb-3">Features for V1:</p>
                    <div className="flex flex-col gap-1.5 relative z-0">
                        {SUGGESTION_CHIPS.map((chip) => (
                            <button
                                key={chip.label}
                                className="flex items-center gap-3 w-full text-left text-[13px] text-muted-foreground hover:text-foreground group py-1.5 rounded-md hover:bg-muted/50 px-2 -ml-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => onSuggestionClick(chip.prompt)}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground transition-colors" />
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
