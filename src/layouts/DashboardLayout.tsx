import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, ClipboardList, TrendingUp, Dumbbell, User, LogOut } from "lucide-react";

export default function DashboardLayout() {
    const location = useLocation();

    const navLinks = [
        { name: "Home", path: "/dashboard/home", icon: Home },
        { name: "Assessment", path: "/dashboard/assessment", icon: ClipboardList },
        { name: "Progress", path: "/dashboard/progress", icon: TrendingUp },
        { name: "Exercises", path: "/dashboard/exercises", icon: Dumbbell },
        { name: "Profile", path: "/dashboard/profile", icon: User },
    ];

    return (
        <div className="min-h-screen bg-[#f2f2f7] flex font-sans text-slate-900">
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
                <div className="p-6 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded bg-sky-500 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                        M
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-800">Mobivia</span>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.path;
                        return (
                            <Link
                                key={link.name}
                                to={link.path}
                                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-colors ${isActive
                                    ? "bg-[#e8f0fe] text-sky-600"
                                    : "text-slate-500 hover:bg-slate-50"
                                    }`}
                            >
                                <Icon size={20} />
                                <span>{link.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                            MT
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-800">Margaret T.</p>
                            <p className="text-xs text-slate-500">Age 72</p>
                        </div>
                    </div>
                    <Link
                        to="/login"
                        onClick={() => localStorage.removeItem('mobivia_role')}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Log Out"
                    >
                        <LogOut size={18} />
                    </Link>
                </div>
            </aside>

            {/* Main Content Dashboard */}
            <main className="flex-1 px-8 py-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 overflow-y-auto w-full">
                <Outlet />
            </main>
        </div>
    );
}
