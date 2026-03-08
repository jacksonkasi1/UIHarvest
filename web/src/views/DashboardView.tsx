import { useState, useEffect } from "react";
import {
    Search,
    Home,
    Star,
    Plus,
    Terminal,
    GlobeLock,
    Trash2,
    Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

    const handleStartAIStudio = () => {
        if (!prompt.trim()) return;
        // We pass the initial prompt to the Studio view via navigation data
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
        <div className="flex h-screen w-full bg-[#1A1A1A] text-white font-sans overflow-hidden">
            {/* Left Sidebar */}
            <div className="w-[280px] bg-[#121212] flex flex-col justify-between border-r border-[#2A2A2A]">
                <div>
                    {/* Brand */}
                    <div className="h-16 flex items-center px-6">
                        <div className="flex items-center gap-2 cursor-pointer font-bold text-xl tracking-tight">
                            <span className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-transparent bg-clip-text">UI</span>
                            <span>Harvest</span>
                        </div>
                    </div>

                    {/* Main Nav */}
                    <div className="space-y-1 px-3">
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white bg-[#2A2A2A] rounded-md font-medium">
                            <Home className="w-4 h-4" /> Home
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#888] hover:text-white hover:bg-[#1E1E1E] rounded-md transition-colors">
                            <Search className="w-4 h-4" /> Search
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#888] hover:text-white hover:bg-[#1E1E1E] rounded-md transition-colors">
                            <Star className="w-4 h-4" /> Resources
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative flex flex-col overflow-y-auto">
                {/* Abstract magical background gradient (Lovable style) */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[0%] left-[-10%] w-[60%] h-[60%] bg-blue-600/20 blur-[120px] rounded-full mix-blend-screen" />
                    <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen" />
                    <div className="absolute bottom-[-20%] left-[20%] w-[70%] h-[70%] bg-pink-600/20 blur-[140px] rounded-full mix-blend-screen" />
                </div>

                {/* Center Prompt Area */}
                <div className="relative z-10 flex flex-col items-center justify-center px-6 min-h-[70vh]">
                    <h1 className="text-4xl font-medium mb-12 tracking-tight">
                        Ready to build, Mahy?
                    </h1>

                    <div className="w-full max-w-3xl bg-[#242424] border border-[#3A3A3A] rounded-2xl shadow-2xl p-1 pb-2 focus-within:border-[#555] focus-within:ring-1 focus-within:ring-[#555] transition-all duration-300">
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Ask UIHarvest to create a web app that..."
                            className="w-full bg-transparent border-none text-lg resize-none min-h-[80px] text-white placeholder:text-[#666] focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleStartAIStudio();
                                }
                            }}
                        />

                        <div className="flex items-center justify-between px-3 pt-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#888] hover:text-white hover:bg-[#333] rounded-full">
                                <Plus className="w-5 h-5" />
                            </Button>

                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-[#666] font-mono mr-2 bg-[#1A1A1A] px-2 py-1 rounded border border-[#333]">
                                    ⏎ Enter
                                </span>
                                <Button
                                    onClick={handleStartAIStudio}
                                    disabled={!prompt.trim()}
                                    className="h-8 w-8 bg-[#444] text-white hover:bg-white hover:text-black rounded-full transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-4 h-4" style={{ transform: 'rotate(45deg)' }} />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Action Cards Grid */}
                    <div className="grid grid-cols-2 max-w-3xl w-full gap-4 mt-8">
                        <div
                            onClick={() => onNavigate('remix-landing')}
                            className="bg-[#242424]/80 backdrop-blur-md border border-[#3A3A3A] hover:border-[#555] rounded-xl p-5 cursor-pointer transition-all hover:bg-[#2A2A2A]/80 flex items-start gap-4 group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                                <GlobeLock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-white font-medium mb-1">Scrap & Remix</h3>
                                <p className="text-sm text-[#888]">Extract design tokens and components from an existing URL to start building.</p>
                            </div>
                        </div>

                        <div
                            onClick={() => onNavigate('landing')}
                            className="bg-[#242424]/80 backdrop-blur-md border border-[#3A3A3A] hover:border-[#555] rounded-xl p-5 cursor-pointer transition-all hover:bg-[#2A2A2A]/80 flex items-start gap-4 group"
                        >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                                <Terminal className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-white font-medium mb-1">Legacy Explorer</h3>
                                <p className="text-sm text-[#888]">Browse components and design systems by extracting a target URL.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Projects Section */}
                <div className="relative z-10 w-full max-w-4xl mx-auto px-6 pb-20 mt-4">
                    <h3 className="text-xl font-medium mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[#888]" /> Recent Projects
                    </h3>

                    {loadingJobs ? (
                        <div className="text-[#888] text-sm py-4">Loading projects...</div>
                    ) : jobs.length === 0 ? (
                        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-8 text-center text-[#888]">
                            No previous projects found. Start building above!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {jobs.map(job => (
                                <div
                                    key={job.id}
                                    onClick={() => handleResumeJob(job.id)}
                                    className="bg-[#242424]/80 backdrop-blur-md border border-[#3A3A3A] group hover:border-[#555] rounded-xl p-4 cursor-pointer transition-all"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-mono text-xs text-[#888] truncate mr-2">
                                            {job.id}
                                        </div>
                                        <button
                                            onClick={(e) => handleDeleteJob(e, job.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                                            title="Delete Project"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <h4 className="text-white font-medium text-sm line-clamp-2 mb-2 min-h-[40px]">
                                        {job.initialPrompt || job.referenceUrl || "Empty Project"}
                                    </h4>
                                    <div className="flex items-center justify-between text-xs mt-3">
                                        <span className={`px-2 py-0.5 rounded-full ${job.status === 'done' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                            {job.status}
                                        </span>
                                        <span className="text-[#666]">
                                            {new Date(job.updatedAt || job.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
