// ** import core packages
import { useState } from "react"
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react"

// ════════════════════════════════════════════════════
// PASSWORD VIEW
//
// Shown when SITE_PASSWORD is configured on the server.
// Blocks the entire UI until the user enters the correct password.
// ════════════════════════════════════════════════════

interface PasswordViewProps {
    onAuthenticated: () => void
}

export function PasswordView({ onAuthenticated }: PasswordViewProps) {
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            })

            if (res.ok) {
                onAuthenticated()
            } else {
                setError("Incorrect password")
                setPassword("")
            }
        } catch {
            setError("Could not reach the server")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background relative overflow-hidden">
            {/* Atmospheric background */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.07]"
                    style={{
                        background: "radial-gradient(circle, var(--color-primary), transparent 70%)",
                    }}
                />
                <div
                    className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.05]"
                    style={{
                        background: "radial-gradient(circle, var(--color-chart-2), transparent 70%)",
                    }}
                />
            </div>

            <div className="relative z-10 w-full max-w-sm px-6">
                {/* Lock icon */}
                <div className="flex justify-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Lock className="w-7 h-7 text-primary" />
                    </div>
                </div>

                {/* Title */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">UIHarvest</h1>
                    <p className="text-sm text-muted-foreground mt-2">Enter the access password to continue</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            autoFocus
                            className="w-full h-12 px-4 pr-12 text-sm bg-card border border-border rounded-xl
                         text-foreground placeholder:text-muted-foreground/50
                         focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50
                         transition-all duration-200"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs text-destructive text-center animate-in fade-in slide-in-from-top-1 duration-200">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={!password || loading}
                        className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-sm font-semibold
                       flex items-center justify-center gap-2
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 active:scale-[0.98]"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        ) : (
                            <>
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
