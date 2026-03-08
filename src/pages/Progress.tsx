import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { TrendingUp, Award, Calendar, Activity, ChevronRight, Flame, Target, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

// Keep weekly data mocked for now as it requires complex daily aggregation we don't have yet
const weeklyData = [
    { day: "Mon", flexibility: 70, strength: 60, balance: 75 },
    { day: "Tue", flexibility: 75, strength: 65, balance: 72 },
    { day: "Wed", flexibility: 72, strength: 68, balance: 78 },
    { day: "Thu", flexibility: 80, strength: 72, balance: 80 },
    { day: "Fri", flexibility: 85, strength: 78, balance: 83 },
    { day: "Sat", flexibility: 82, strength: 80, balance: 85 },
    { day: "Sun", flexibility: 88, strength: 82, balance: 87 },
];

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div>
            <div className="flex justify-between items-center mb-2">
                <span className="text-slate-600 font-medium text-sm">{label}</span>
                <span className="font-bold text-slate-800 text-sm">{value}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                    className={`h-3 rounded-full ${color} transition-all duration-700`}
                    style={{ width: `${value}%` }}
                />
            </div>
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-slate-100 shadow-xl rounded-2xl p-3">
                <p className="text-slate-500 text-xs mb-1">{label}</p>
                <p className="text-indigo-600 font-bold text-lg">{payload[0].value}</p>
                <p className="text-slate-400 text-xs">Mobility Score</p>
            </div>
        );
    }
    return null;
};

export default function Progress() {
    const { user } = useAuth();
    const [mobilityData, setMobilityData] = useState<any[]>([]);
    const [recentAssessments, setRecentAssessments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const loadProgress = async () => {
            try {
                const { data, error } = await supabase
                    .from('assessments')
                    .select('*')
                    .eq('patient_id', user.id)
                    .order('created_at', { ascending: true }); // Ascending for chart

                if (error) throw error;

                if (data && data.length > 0) {
                    // 1. Process chart data (Aggregate by month or just take sequence)
                    const mData = data.map((a: any) => {
                        const date = new Date(a.created_at);
                        const month = date.toLocaleString('default', { month: 'short' });
                        return { month: `${month} ${date.getDate()}`, score: a.overall_score || 0 };
                    });
                    setMobilityData(mData);

                    // 2. Process recent assessments list (Descending order)
                    const descendingData = [...data].reverse().slice(0, 3);

                    const rData = descendingData.map((a: any, index: number) => {
                        const date = new Date(a.created_at);
                        const prevScore = index < descendingData.length - 1 ? descendingData[index + 1].overall_score : a.overall_score;
                        const diff = a.overall_score - prevScore;
                        const trend = diff > 0 ? `+${diff}` : `${diff}`;

                        let status = "Fair";
                        let color = "text-amber-500";
                        if (a.overall_score >= 80) { status = "Great"; color = "text-emerald-500"; }
                        else if (a.overall_score >= 60) { status = "Good"; color = "text-sky-500"; }

                        return {
                            date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                            score: a.overall_score,
                            trend: trend,
                            status: status,
                            color: color,
                            details: [`Risk Level: ${a.risk_level || 'Unknown'}`], // Add more dynamic details later
                        };
                    });
                    setRecentAssessments(rData);
                }
            } catch (error) {
                console.error("Error loading progress:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadProgress();
    }, [user]);

    const latestAssessment = recentAssessments.length > 0 ? recentAssessments[0] : null;
    const currentScore = latestAssessment ? latestAssessment.score : 0;
    const totalAssessments = mobilityData.length;

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">Loading progress data...</div>;
    }

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header */}
            <header>
                <p className="text-sky-600 font-medium mb-1 tracking-wide uppercase text-sm">Your Journey</p>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Progress Report</h1>
                <p className="text-slate-500 mt-2 text-lg">Track your mobility improvements over time.</p>
            </header>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { icon: <Flame size={20} />, label: "Current Streak", value: "Active", sub: "Keep it up!", color: "bg-orange-50 text-orange-500", border: "border-orange-100" },
                    { icon: <Target size={20} />, label: "Current Score", value: `${currentScore} / 100`, sub: latestAssessment ? `${latestAssessment.trend} pts` : "No data", color: "bg-sky-50 text-sky-500", border: "border-sky-100" },
                    { icon: <Calendar size={20} />, label: "Assessments", value: `${totalAssessments} Total`, sub: "Recording progress", color: "bg-indigo-50 text-indigo-500", border: "border-indigo-100" },
                    { icon: <Award size={20} />, label: "Badges Earned", value: "6 Badges", sub: "Great job!", color: "bg-emerald-50 text-emerald-500", border: "border-emerald-100" },
                ].map((stat) => (
                    <div key={stat.label} className={`bg-white rounded-3xl p-5 shadow-sm border ${stat.border} flex flex-col gap-3 hover:shadow-md transition-shadow`}>
                        <div className={`w-10 h-10 rounded-2xl ${stat.color} flex items-center justify-center`}>
                            {stat.icon}
                        </div>
                        <div>
                            <p className="text-slate-500 text-xs font-medium">{stat.label}</p>
                            <p className="text-xl font-bold text-slate-800 mt-0.5">{stat.value}</p>
                            <p className="text-emerald-500 text-xs font-medium mt-0.5">{stat.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobility Score Chart */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="text-sky-500" />
                            Mobility Score Over Time
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">Last 7 months of assessments</p>
                    </div>
                    <div className="bg-emerald-50 text-emerald-600 text-sm font-bold px-3 py-1.5 rounded-full border border-emerald-100">
                        +26 pts ↑
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                    {mobilityData.length > 0 ? (
                        <AreaChart data={mobilityData}>
                            <defs>
                                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis domain={[50, 100]} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} fill="url(#scoreGrad)" dot={{ r: 5, fill: "#6366f1", stroke: "white", strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        </AreaChart>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400">
                            Complete an assessment to see your chart!
                        </div>
                    )}
                </ResponsiveContainer>
            </div>

            {/* Weekly Breakdown + Metric Bars */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Multi-metric Chart */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                        <Zap className="text-amber-500" />
                        This Week's Breakdown
                    </h3>
                    <p className="text-slate-400 text-sm mb-5">Flexibility · Strength · Balance</p>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={weeklyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis domain={[50, 100]} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }} />
                            <Line type="monotone" dataKey="flexibility" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="strength" stroke="#818cf8" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="balance" stroke="#34d399" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-4">
                        {[{ color: "bg-sky-400", label: "Flexibility" }, { color: "bg-indigo-400", label: "Strength" }, { color: "bg-emerald-400", label: "Balance" }].map(l => (
                            <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                <span className={`w-3 h-3 rounded-full ${l.color}`} />
                                {l.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Current Metrics */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                            <Activity className="text-indigo-500" />
                            Current Metrics
                        </h3>
                        <p className="text-slate-400 text-sm mb-6">Based on your latest assessment</p>
                    </div>
                    <div className="flex flex-col gap-5">
                        <MetricBar label="Flexibility" value={88} color="bg-gradient-to-r from-sky-400 to-sky-500" />
                        <MetricBar label="Strength" value={74} color="bg-gradient-to-r from-indigo-400 to-indigo-500" />
                        <MetricBar label="Balance" value={81} color="bg-gradient-to-r from-emerald-400 to-emerald-500" />
                        <MetricBar label="Posture" value={79} color="bg-gradient-to-r from-amber-400 to-orange-400" />
                        <MetricBar label="Overall Mobility" value={88} color="bg-gradient-to-r from-violet-400 to-indigo-500" />
                    </div>
                </div>
            </div>

            {/* Recent Assessments */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
                    <Calendar className="text-indigo-500" />
                    Recent Assessment History
                </h3>
                <div className="flex flex-col gap-4">
                    {recentAssessments.length > 0 ? recentAssessments.map((a) => (
                        <div key={a.date} className="flex items-start gap-5 p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer group">
                            <div className="flex-shrink-0 text-center">
                                <p className={`text-3xl font-black ${a.color}`}>{a.score}</p>
                                <p className={`text-xs font-bold ${a.color}`}>{a.trend} pts</p>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="font-bold text-slate-800">{a.date}</p>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white border ${a.color} border-current`}>{a.status}</span>
                                </div>
                                <ul className="space-y-1">
                                    {a.details.map((d: string) => (
                                        <li key={d} className="text-slate-500 text-sm flex items-start gap-2">
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0 mt-1" />
                        </div>
                    )) : (
                        <div className="text-center py-8 text-slate-400">No assessments completed yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
