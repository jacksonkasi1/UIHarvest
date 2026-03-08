import { useState, useEffect, useRef } from "react";
import {
    Search,
    Home,
    Star,
    Plus,
    Terminal,
    GlobeLock,
    Trash2,
    Blocks,
    ChevronDown,
    Paperclip,
    ArrowUp,
    Zap,
    Gift
} from "lucide-react";

interface JobMeta {
    id: string;
    status: string;
    phase: string;
    createdAt: number;
    updatedAt: number;
    referenceUrl?: string;
    targetUrl?: string;
    initialPrompt?: string;
}

interface DashboardViewProps {
    onNavigate: (mode: 'explorer' | 'landing' | 'remix-landing' | 'remix-studio', data?: any) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
    const [prompt, setPrompt] = useState("");
    const [jobs, setJobs] = useState<JobMeta[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const fetchJobs = async () => {
        try {
            setLoadingJobs(true);
            const res = await fetch("/api/jobs");
            if (res.ok) {
                const data = await res.json();
                setJobs(data.jobs || []);
            }
        } catch (err) {
            console.error("Failed to fetch jobs", err);
        } finally {
            setLoadingJobs(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 400)}px`;
        }
    }, [prompt]);

    const handleStartAIStudio = () => {
        if (!prompt.trim()) return;
        onNavigate('remix-studio', { initialPrompt: prompt });
    };

    const handleResumeJob = (jobId: string) => {
        onNavigate('remix-studio', { jobId });
    };

    const handleDeleteJob = async (e: React.MouseEvent, jobId: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this project?")) return;
        try {
            await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
            fetchJobs();
        } catch (err) {
            console.error("Failed to delete job", err);
        }
    };

    return (
        <div className="flex h-screen w-full bg-[#FAFAF9] text-gray-900 font-sans overflow-hidden selection:bg-black/10">
            {/* Left Sidebar */}
            <div className="relative z-20 w-[240px] bg-[#FAFAF9] flex flex-col justify-between border-r border-gray-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div>
                    {/* Brand */}
                    <div className="h-16 flex items-center px-4 mt-2 mb-2">
                        <div className="flex items-center gap-2 cursor-pointer w-full bg-white border border-gray-200 hover:border-gray-300 transition-colors rounded-xl px-3 py-2 shadow-sm">
                            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center">
                                <Blocks className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-gray-800 font-medium text-[13px] flex-1">Harvest's Workspace</span>
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>

                    {/* Main Nav */}
                    <div className="space-y-0.5 px-3">
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-gray-900 bg-gray-100 rounded-lg font-medium transition-all">
                            <Home className="w-4 h-4 text-gray-700" /> Home
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-100/50 rounded-lg transition-all">
                            <Search className="w-4 h-4 text-gray-400" /> Search
                        </button>

                        <div className="mt-8 mb-2 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Projects</div>

                        <button className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-100/50 rounded-lg transition-all">
                            <Blocks className="w-4 h-4 text-gray-400" /> All projects
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-100/50 rounded-lg transition-all">
                            <Star className="w-4 h-4 text-gray-400" /> Starred
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-2">
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex-1">
                            <div className="text-[12px] font-medium text-gray-800">Share UI Harvest</div>
                            <div className="text-[11px] text-gray-500">Get 10 credits each</div>
                        </div>
                        <Gift className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex-1">
                            <div className="text-[12px] font-medium text-gray-800">Upgrade to Pro</div>
                            <div className="text-[11px] text-gray-500">Unlock more benefits</div>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
                {/* Abstract magical background gradient (Lovable style - Bright & Vibrant) */}
                <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#fdfcff]">
                    {/* Top blue/cyan */}
                    <div className="absolute top-[-10%] left-[0%] w-[60%] h-[60%] bg-[#3b82f6] mix-blend-multiply blur-[120px] rounded-full opacity-40 animate-pulse duration-[8000ms]" />
                    {/* Top right soft white/blue */}
                    <div className="absolute top-[-10%] right-[-10%] w-[70%] h-[70%] bg-[#e0f2fe] mix-blend-multiply blur-[100px] rounded-full opacity-80" />
                    {/* Bottom left vibrant pink */}
                    <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-[#ff2a85] mix-blend-multiply blur-[140px] rounded-full opacity-60" />
                    {/* Bottom right fiery orange/red */}
                    <div className="absolute bottom-[-10%] right-[0%] w-[60%] h-[60%] bg-[#ef4444] mix-blend-multiply blur-[140px] rounded-full opacity-50" />
                </div>

                <div className="relative z-10 w-full max-w-4xl mx-auto px-8 pt-[15vh] pb-32 flex flex-col items-center">

                    {/* Fun badge */}
                    <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/40 shadow-sm text-[13px] font-medium text-gray-700 cursor-pointer hover:bg-white/80 transition-all">
                        <Gift className="w-4 h-4 text-pink-500" />
                        <span>Build something amazing</span>
                        <span className="text-gray-400">→</span>
                    </div>

                    <h1 className="text-[3.5rem] font-semibold mb-12 tracking-tight text-gray-900 text-center">
                        Time to ship, Maker
                    </h1>

                    {/* Central Prompt Box - Lovable Light Style */}
                    <div className="w-full max-w-2xl bg-white/80 backdrop-blur-2xl border border-white rounded-[2rem] shadow-[0_8px_40px_rgba(0,0,0,0.06)] px-4 py-4 focus-within:bg-white focus-within:shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-all duration-300 flex flex-col">
                        <textarea
                            ref={textareaRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Ask UI Harvest to create a landing page for my..."
                            className="w-full bg-transparent border-none text-[15px] resize-none min-h-[48px] text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 px-2 py-1 leading-relaxed overflow-y-auto"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleStartAIStudio();
                                }
                            }}
                        />

                        <div className="flex items-center justify-between px-2 pt-3 mt-auto">
                            <div className="flex items-center gap-1.5">
                                <button className="flex items-center justify-center h-8 w-8 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors">
                                    <Plus className="w-4 h-4" />
                                </button>
                                <button className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors font-medium border border-gray-200 bg-white shadow-sm">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    <span>Attach</span>
                                </button>
                                <button className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors font-medium border border-gray-200 bg-white shadow-sm">
                                    <Blocks className="w-3.5 h-3.5" />
                                    <span>Theme</span>
                                    <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="text-[12px] text-gray-600 font-medium px-2 py-1 hidden sm:flex items-center gap-1.5">
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    Chat
                                </div>
                                <button
                                    onClick={handleStartAIStudio}
                                    disabled={!prompt.trim()}
                                    className="h-8 w-8 bg-gray-900 text-white hover:bg-black hover:scale-105 active:scale-95 rounded-full transition-all flex items-center justify-center disabled:opacity-20 disabled:hover:scale-100 shadow-[0_2px_10px_rgba(0,0,0,0.1)] disabled:shadow-none"
                                >
                                    <ArrowUp className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom White Container: Templates & Recents */}
                    <div className="w-full mt-24 max-w-5xl bg-[#fafaf9] border border-gray-200 rounded-t-[2.5rem] p-10 min-h-[500px] shadow-[0_-10px_40px_rgba(0,0,0,0.02)]">

                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
                                    Templates
                                </div>
                                <div className="px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
                                    Recent Projects
                                </div>
                            </h3>
                            <button className="text-[13px] text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1">
                                Browse all <span>→</span>
                            </button>
                        </div>

                        {loadingJobs ? (
                            <div className="text-gray-500 text-sm py-12 flex items-center justify-center gap-3">
                                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                                Loading your workspace...
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="bg-white border text-gray-500 border-gray-200 rounded-[2rem] p-16 flex flex-col items-center justify-center text-center shadow-sm">
                                <Blocks className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-gray-800 font-medium mb-1">No previous projects found.</p>
                                <p className="text-sm">Your creations will appear here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {jobs.map(job => (
                                    <div
                                        key={job.id}
                                        onClick={() => handleResumeJob(job.id)}
                                        className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md rounded-[1.5rem] p-6 cursor-pointer transition-all duration-300 group flex flex-col h-full shadow-sm"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="font-mono text-[10px] text-gray-500 truncate mr-2 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                                {job.id.substring(0, 8)}...
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteJob(e, job.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all transform hover:scale-110"
                                                title="Delete Project"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <h4 className="text-gray-900 font-medium text-[15px] leading-relaxed line-clamp-2 mb-8 flex-1">
                                            {job.initialPrompt ? `"${job.initialPrompt}"` : (job.referenceUrl || "Empty Project")}
                                        </h4>
                                        <div className="flex items-center justify-between mt-auto">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${job.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500 border border-amber-500/20'}`} />
                                                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                                                    {job.status}
                                                </span>
                                            </div>
                                            <span className="text-[11px] text-gray-400 font-medium">
                                                {new Date(job.updatedAt || job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Explore tools inside the white section */}
                        <div className="mt-16 pt-8 border-t border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-[0.15em] mb-6">
                                Developer Tools
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div
                                    onClick={() => onNavigate('remix-landing')}
                                    className="group relative overflow-hidden bg-white border border-gray-200 hover:border-gray-300 rounded-[1.5rem] p-6 cursor-pointer transition-all duration-300 hover:shadow-md"
                                >
                                    <div className="relative z-10 flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-110 group-hover:bg-purple-100 transition-all duration-300 shrink-0">
                                            <GlobeLock className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-gray-900 font-medium mb-1 text-base">Scrap & Remix</h3>
                                            <p className="text-[13px] text-gray-500 leading-relaxed">Extract design tokens and react components from an existing URL to start building.</p>
                                        </div>
                                    </div>
                                </div>

                                <div
                                    onClick={() => onNavigate('landing')}
                                    className="group relative overflow-hidden bg-white border border-gray-200 hover:border-gray-300 rounded-[1.5rem] p-6 cursor-pointer transition-all duration-300 hover:shadow-md"
                                >
                                    <div className="relative z-10 flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300 shrink-0">
                                            <Terminal className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-gray-900 font-medium mb-1 text-base">Legacy Explorer</h3>
                                            <p className="text-[13px] text-gray-500 leading-relaxed">Browse components and design systems locally by rendering the target code.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}

// Ensure MessageCircle is correctly imported or fallback
function MessageCircle(props: any) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
    )
}
