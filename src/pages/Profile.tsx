import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
    User, Mail, Phone, MapPin, Award, Flame, Calendar, Activity,
    Bell, Lock, HelpCircle, ChevronRight, Star, Shield, LogOut, Pencil, X, Check
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const badges = [
    { icon: <Flame size={18} />, label: "7-Day Streak", color: "bg-orange-100 text-orange-500 border-orange-200" },
    { icon: <Award size={18} />, label: "First Assessment", color: "bg-indigo-100 text-indigo-500 border-indigo-200" },
    { icon: <Star size={18} />, label: "Score 80+", color: "bg-amber-100 text-amber-500 border-amber-200" },
    { icon: <Shield size={18} />, label: "Balance Master", color: "bg-emerald-100 text-emerald-500 border-emerald-200" },
    { icon: <Activity size={18} />, label: "Active Warrior", color: "bg-sky-100 text-sky-500 border-sky-200" },
    { icon: <Calendar size={18} />, label: "30-Day Member", color: "bg-violet-100 text-violet-500 border-violet-200" },
];

const conditions = ["Mild Arthritis", "Post-Knee Surgery", "Lower Back Stiffness"];

const settingsSections = [
    {
        title: "Account",
        items: [
            { icon: <Bell size={18} />, label: "Notifications", sub: "Assessment reminders, progress alerts" },
            { icon: <Lock size={18} />, label: "Privacy & Security", sub: "Password, data sharing settings" },
            { icon: <Shield size={18} />, label: "Medical Consent", sub: "Manage data permissions for your doctor" },
        ],
    },
    {
        title: "Support",
        items: [
            { icon: <HelpCircle size={18} />, label: "Help & FAQ", sub: "Tutorials, how-to guides" },
            { icon: <Star size={18} />, label: "Rate Mobivia", sub: "Share your experience" },
        ],
    },
];

export default function Profile() {
    const navigate = useNavigate();
    const { signOut, profile, user } = useAuth();
    const [editing, setEditing] = useState(false);

    // We try to pull from `profile`, otherwise provide empty defaults
    const [name, setName] = useState(profile?.full_name || "");
    const [phone, setPhone] = useState(""); // Optionally we could add `phone` to profile db schema in the future
    const [location, setLocation] = useState("");

    const [draftName, setDraftName] = useState(name);
    const [draftPhone, setDraftPhone] = useState(phone);
    const [draftLocation, setDraftLocation] = useState(location);
    const [isSaving, setIsSaving] = useState(false);

    // Sync state if profile loads slightly after component mounts
    useEffect(() => {
        if (profile) {
            setName(profile.full_name || "");
            setDraftName(profile.full_name || "");
        }
    }, [profile]);

    const saveEdit = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: draftName })
                .eq('id', user.id);

            if (error) throw error;

            // Only update local state if the db updated successfully
            setName(draftName);
            setPhone(draftPhone);
            setLocation(draftLocation);
            setEditing(false);
        } catch (error) {
            console.error('Failed to update profile:', error);
            // Optionally could add a toast/error banner here
        } finally {
            setIsSaving(false);
        }
    };

    const cancelEdit = () => {
        setDraftName(name);
        setDraftPhone(phone);
        setDraftLocation(location);
        setEditing(false);
    };

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header */}
            <header>
                <p className="text-sky-600 font-medium mb-1 tracking-wide uppercase text-sm">Your Account</p>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">My Profile</h1>
                <p className="text-slate-500 mt-2 text-lg">Manage your information and preferences.</p>
            </header>

            {/* Profile Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-400 text-white shadow-[0_8px_30px_rgb(14,165,233,0.25)]">
                <div className="absolute top-0 right-0 -translate-y-10 translate-x-1/3 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl" />
                <div className="relative p-7 md:p-9 flex flex-col md:flex-row items-center gap-6">
                    {/* Avatar */}
                    <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 flex-shrink-0">
                        <User size={48} className="text-white" />
                    </div>
                    {/* Info */}
                    <div className="flex-1 text-center md:text-left">
                        <h2 className="text-2xl font-bold">{name || "Your Name"}</h2>
                        <p className="text-indigo-100 mt-1 flex items-center justify-center md:justify-start gap-1.5">
                            <Mail size={14} /> {user?.email}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
                            {conditions.map(c => (
                                <span key={c} className="bg-white/20 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                                    {c}
                                </span>
                            ))}
                        </div>
                    </div>
                    {/* Edit Button */}
                    <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-2xl text-sm font-semibold transition-all border border-white/30 flex-shrink-0"
                    >
                        <Pencil size={14} /> Edit Profile
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { icon: <Flame size={20} />, label: "Current Streak", value: "12 Days", color: "bg-orange-50 text-orange-500 border-orange-100" },
                    { icon: <Activity size={20} />, label: "Assessments Done", value: "24", color: "bg-sky-50 text-sky-500 border-sky-100" },
                    { icon: <Award size={20} />, label: "Badges Earned", value: "6 / 10", color: "bg-indigo-50 text-indigo-500 border-indigo-100" },
                    { icon: <Star size={20} />, label: "Best Score", value: "88 pts", color: "bg-amber-50 text-amber-500 border-amber-100" },
                ].map(s => (
                    <div key={s.label} className={`bg-white rounded-3xl p-5 shadow-sm border ${s.color.split(" ")[2]} flex flex-col gap-3 hover:shadow-md transition-shadow`}>
                        <div className={`w-10 h-10 rounded-2xl ${s.color.split(" ").slice(0, 2).join(" ")} flex items-center justify-center`}>
                            {s.icon}
                        </div>
                        <div>
                            <p className="text-slate-500 text-xs font-medium">{s.label}</p>
                            <p className="text-xl font-bold text-slate-800 mt-0.5">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Personal Details */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-bold text-slate-800">Personal Information</h3>
                        {!editing ? (
                            <button onClick={() => setEditing(true)} className="text-sky-500 text-sm font-semibold hover:text-sky-700 flex items-center gap-1">
                                <Pencil size={14} /> Edit
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={saveEdit}
                                    disabled={isSaving}
                                    className="flex items-center gap-1 text-emerald-600 text-sm font-semibold hover:text-emerald-700 disabled:opacity-50"
                                >
                                    <Check size={14} /> {isSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                    onClick={cancelEdit}
                                    disabled={isSaving}
                                    className="flex items-center gap-1 text-slate-400 text-sm font-semibold hover:text-slate-600 disabled:opacity-50"
                                >
                                    <X size={14} /> Cancel
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-4">
                        {[
                            { icon: <User size={16} />, label: "Full Name", value: name, draft: draftName, setter: setDraftName, key: "name", placeholder: "e.g. John Doe" },
                            { icon: <Mail size={16} />, label: "Email", value: user?.email, draft: null, setter: null, key: "email" },
                            { icon: <Phone size={16} />, label: "Phone", value: phone || "Not set", draft: draftPhone, setter: setDraftPhone, key: "phone", placeholder: "e.g. +60 12-345" },
                            { icon: <MapPin size={16} />, label: "Location", value: location || "Not set", draft: draftLocation, setter: setDraftLocation, key: "location", placeholder: "e.g. Kuala Lumpur" },
                        ].map(field => (
                            <div key={field.key} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50">
                                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-500 shadow-sm flex-shrink-0 mt-0.5">
                                    {field.icon}
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-400 font-medium mb-0.5">{field.label}</p>
                                    {editing && field.setter ? (
                                        <input
                                            className="w-full text-sm font-semibold text-slate-700 bg-white border border-sky-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-300"
                                            value={field.draft ?? ""}
                                            onChange={e => field.setter!(e.target.value)}
                                            placeholder={field.placeholder}
                                        />
                                    ) : (
                                        <p className="text-sm font-semibold text-slate-700">{field.value}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Medical Info */}
                    <div className="mt-5 pt-5 border-t border-slate-100">
                        <p className="text-xs text-slate-400 font-medium mb-3">Medical Conditions</p>
                        <div className="flex flex-wrap gap-2">
                            {conditions.map(c => (
                                <span key={c} className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-xs font-semibold px-3 py-1.5 rounded-full">{c}</span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Badges */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Achievements</h3>
                    <p className="text-slate-400 text-sm mb-5">Milestones you've unlocked</p>
                    <div className="grid grid-cols-3 gap-3">
                        {badges.map(b => (
                            <div key={b.label} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${b.color} hover:scale-105 transition-transform cursor-default`}>
                                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                    {b.icon}
                                </div>
                                <p className="text-xs font-semibold text-center leading-tight">{b.label}</p>
                            </div>
                        ))}
                        {/* Locked badges */}
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-dashed border-slate-200 opacity-40">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <Lock size={16} className="text-slate-400" />
                                </div>
                                <p className="text-xs font-semibold text-slate-400 text-center">Locked</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Settings */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Settings</h3>
                <div className="space-y-8">
                    {settingsSections.map(section => (
                        <div key={section.title}>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{section.title}</p>
                            <div className="space-y-2">
                                {section.items.map(item => (
                                    <button
                                        key={item.label}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors group text-left"
                                    >
                                        <div className="w-10 h-10 rounded-2xl bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center text-slate-500 group-hover:text-indigo-500 transition-colors flex-shrink-0">
                                            {item.icon}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-700">{item.label}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{item.sub}</p>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Log Out */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <button
                        onClick={async () => {
                            await signOut();
                            navigate('/login');
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-rose-50 transition-colors group text-left"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-500 flex-shrink-0">
                            <LogOut size={18} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-rose-600">Sign Out</p>
                            <p className="text-xs text-slate-400 mt-0.5">Securely sign out of your account</p>
                        </div>
                        <ChevronRight size={18} className="text-rose-300 group-hover:text-rose-500 transition-colors" />
                    </button>
                </div>
            </div>
        </div>
    );
}
