import { Link } from "react-router-dom";
import { PlayCircle, Activity, CalendarCheck, TrendingUp, Award, Clock } from "lucide-react";

export default function Home() {
    // Current date logic for dynamic greeting
    const date = new Date();
    const hour = date.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const formattedDate = date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    });

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <p className="text-sky-600 font-medium mb-1 tracking-wide uppercase text-sm">{formattedDate}</p>
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
                        {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-indigo-600">Margaret</span>
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg">
                        Ready to improve your mobility today?
                    </p>
                </div>
            </header>

            {/* Primary Action Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-sky-500 to-sky-400 text-white shadow-[0_8px_30px_rgb(14,165,233,0.3)]">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-96 h-96 bg-white opacity-10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/4 w-64 h-64 bg-indigo-900 opacity-20 rounded-full blur-2xl"></div>

                <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex-1">
                        <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-medium mb-4">
                            <Activity size={16} />
                            <span>Daily Goal Pending</span>
                        </div>
                        <h2 className="text-3xl font-bold mb-3">Daily Mobility Assessment</h2>
                        <p className="text-indigo-50 text-lg max-w-xl">
                            Complete your 5-minute video analysis to track your posture and balance progress.
                        </p>
                    </div>
                    <Link
                        to="/dashboard/assessment"
                        className="group flex items-center space-x-3 bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold text-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                    >
                        <span>Start Now</span>
                        <PlayCircle size={24} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </div>

            {/* Dashboard grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Weekly Progress Card */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="text-sky-500" />
                            Weekly Progress
                        </h3>
                        <Link to="/dashboard/progress" className="text-sm font-medium text-sky-600 hover:text-sky-700">View Detailed Report &rarr;</Link>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-600 font-medium">Activity Goal</span>
                            <span className="text-sky-600 font-bold">3 / 5 Days</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-4 mb-8 overflow-hidden">
                            <div className="bg-gradient-to-r from-sky-400 to-indigo-500 h-4 rounded-full w-[60%] relative">
                                <div className="absolute right-0 top-0 bottom-0 w-8 bg-white/20 blur-sm animate-pulse"></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <p className="text-slate-500 text-sm mb-1">Mobility Score</p>
                                <p className="text-2xl font-bold text-slate-800">82</p>
                                <p className="text-emerald-500 text-xs font-medium mt-1">+3 from last week</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <p className="text-slate-500 text-sm mb-1">Balance</p>
                                <p className="text-2xl font-bold text-slate-800">Good</p>
                                <p className="text-emerald-500 text-xs font-medium mt-1">Stable</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <p className="text-slate-500 text-sm mb-1">Next Milestone</p>
                                <p className="text-2xl font-bold text-slate-800">Level 4</p>
                                <p className="text-sky-500 text-xs font-medium mt-1">2 assess. left</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Upcoming Activities */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <CalendarCheck className="text-indigo-500" />
                        Today's Schedule
                    </h3>

                    <div className="space-y-4 flex-1">
                        {/* Task 1 */}
                        <div className="flex items-start space-x-4 p-4 rounded-2xl bg-[#e8f0fe] border border-sky-100">
                            <div className="bg-white p-2 rounded-xl text-sky-500 shadow-sm">
                                <Activity size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Daily Setup Assessment</p>
                                <p className="text-sky-600 text-xs font-medium mt-1 flex items-center gap-1">
                                    <Clock size={12} /> Pending
                                </p>
                            </div>
                        </div>

                        {/* Task 2 */}
                        <div className="flex items-start space-x-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <div className="bg-slate-100 p-2 rounded-xl text-slate-500 shadow-sm">
                                <Award size={20} />
                            </div>
                            <div className="opacity-70">
                                <p className="font-bold text-slate-800 text-sm line-through">Morning Stretches</p>
                                <p className="text-emerald-500 text-xs font-medium mt-1">Completed at 8:30 AM</p>
                            </div>
                        </div>

                        {/* Task 3 */}
                        <div className="flex items-start space-x-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 cursor-pointer">
                            <div className="bg-indigo-50 p-2 rounded-xl text-indigo-500 shadow-sm">
                                <CalendarCheck size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Review Results</p>
                                <p className="text-slate-500 text-xs font-medium mt-1">Available after assessment</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

