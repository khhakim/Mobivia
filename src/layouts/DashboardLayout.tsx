import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Home, ClipboardList, TrendingUp, Dumbbell, User, LogOut, Video } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function DashboardLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { signOut, profile } = useAuth();

    const navLinks = [
        { name: "Home", path: "/dashboard/home", icon: Home },
        { name: "Assessment", path: "/dashboard/assessment", icon: ClipboardList },
        { name: "Telehealth", path: "/dashboard/telehealth", icon: Video },
        { name: "Progress", path: "/dashboard/progress", icon: TrendingUp },
        { name: "Exercises", path: "/dashboard/exercises", icon: Dumbbell },
        { name: "Profile", path: "/dashboard/profile", icon: User },
    ];

    return (
        <div className="h-screen w-full bg-[#f2f2f7] flex font-sans text-slate-900 overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex h-full flex-shrink-0">
                <div className="p-6 flex items-center space-x-3">
                    <div className="w-8 h-8 flex items-center justify-center overflow-hidden rounded-full shadow-sm">
                        <img src="/logo.png" alt="Mobivia Logo" className="w-full h-full object-cover" />
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

                <div className="p-4 border-t border-slate-100 flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                                {profile?.full_name?.substring(0, 2).toUpperCase() || 'P'}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-800">{profile?.full_name || 'Patient'}</p>
                                <p className="text-xs text-slate-500">Age {profile?.age || '--'}</p>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                await signOut();
                                navigate('/login');
                            }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Log Out"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                    <div className="text-[10px] text-slate-400 text-center font-medium opacity-60">
                        &copy; 2026 Mobivia. All rights reserved.
                    </div>
                </div>
            </aside>

            {/* Main Content Dashboard */}
            <div className="flex-1 h-full overflow-y-auto relative w-full">
                <main className="px-4 md:px-8 py-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
