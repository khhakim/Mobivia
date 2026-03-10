import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
    User, Mail, Phone, MapPin, Award, Flame, Calendar, Activity,
    Bell, Lock, HelpCircle, ChevronRight, Star, Shield, LogOut, Pencil, Check
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import AccountSettings from "../components/AccountSettings";

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

const ToggleOption = ({ title, description, defaultChecked }: { title: string, description: string, defaultChecked?: boolean }) => {
    const [checked, setChecked] = useState(defaultChecked || false);
    return (
        <div className="bg-slate-50/70 border border-slate-100 rounded-3xl p-5 flex items-center justify-between gap-4">
            <div>
                <p className="text-lg font-bold text-slate-800">{title}</p>
                <p className="text-sm text-slate-500 mt-1">{description}</p>
            </div>
            <button
                onClick={() => setChecked(!checked)}
                className={`w-16 h-9 rounded-full flex items-center p-1 cursor-pointer transition-colors duration-300 flex-shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}
            >
                <div className={`w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center transform transition-transform duration-300 ${checked ? 'translate-x-7' : 'translate-x-0'}`}>
                    {checked && <Check size={16} className="text-emerald-500" strokeWidth={4} />}
                </div>
            </button>
        </div>
    );
};

export default function Profile() {
    const navigate = useNavigate();
    const { signOut, profile, user } = useAuth();
    const [editing, setEditing] = useState(false);
    const [activeModal, setActiveModal] = useState<string | null>(null);

    // We try to pull from `profile`, otherwise provide empty defaults
    const [name, setName] = useState(profile?.full_name || "");
    const [age, setAge] = useState<number | "">(profile?.age ?? "");
    const [phone, setPhone] = useState(profile?.phone || "");
    const [location, setLocation] = useState(profile?.location || "");

    const [draftName, setDraftName] = useState(name);
    const [draftAge, setDraftAge] = useState<number | "">(age);
    const [draftPhone, setDraftPhone] = useState(phone);
    const [draftLocation, setDraftLocation] = useState(location);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Sync state when profile loads (async after mount)
    useEffect(() => {
        if (profile) {
            setName(profile.full_name || "");
            setDraftName(profile.full_name || "");
            setAge(profile.age ?? "");
            setDraftAge(profile.age ?? "");
            setPhone(profile.phone || "");
            setDraftPhone(profile.phone || "");
            setLocation(profile.location || "");
            setDraftLocation(profile.location || "");
        }
    }, [profile]);

    const saveEdit = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: draftName,
                    age: draftAge === "" ? null : Number(draftAge),
                    phone: draftPhone || null,
                    location: draftLocation || null,
                })
                .eq('id', user.id);

            if (error) throw error;

            // Commit draft values to display state
            setName(draftName);
            setAge(draftAge);
            setPhone(draftPhone);
            setLocation(draftLocation);
            setEditing(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
        } catch (error) {
            console.error('Failed to update profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const cancelEdit = () => {
        setDraftName(name);
        setDraftAge(age);
        setDraftPhone(phone);
        setDraftLocation(location);
        setEditing(false);
    };

    const renderModalContent = () => {
        switch (activeModal) {
            case "Notifications":
                return (
                    <div className="space-y-4">
                        <ToggleOption title="Assessment Reminders" description="Get notified when it's time for your check-in." defaultChecked={true} />
                        <ToggleOption title="Progress Alerts" description="Receive updates on your weekly milestones." defaultChecked={true} />
                    </div>
                );
            case "Privacy & Security":
                return (
                    <div className="space-y-4">
                        <ToggleOption title="Two-Factor Authentication" description="Add an extra layer of security to your account." defaultChecked={false} />
                        <ToggleOption title="Data Sharing" description="Allow anonymous usage data to improve the app." defaultChecked={true} />
                        <button className="w-full mt-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl transition-colors">
                            Change Password
                        </button>
                    </div>
                );
            case "Medical Consent":
                return (
                    <div className="space-y-4">
                        <ToggleOption title="Share Data with Primary Doctor" description="Automatically share assessment results." defaultChecked={true} />
                        <ToggleOption title="Emergency Contact Access" description="Allow emergency contacts to view your status." defaultChecked={false} />
                    </div>
                );
            case "Help & FAQ":
                return (
                    <div className="space-y-3">
                        {["How to perform an assessment", "Understanding your progress score", "Updating profile information"].map((faq, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors">
                                <p className="text-sm font-semibold text-slate-700">{faq}</p>
                                <ChevronRight size={16} className="text-slate-400" />
                            </div>
                        ))}
                        <button className="w-full mt-2 py-3 bg-sky-50 text-sky-600 font-semibold rounded-2xl hover:bg-sky-100 transition-colors">
                            Contact Support
                        </button>
                    </div>
                );
            case "Rate Mobivia":
                return (
                    <div className="flex flex-col items-center text-center space-y-4 py-4">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star key={star} size={32} className="text-amber-400 fill-amber-400 cursor-pointer hover:scale-110 transition-transform" />
                            ))}
                        </div>
                        <p className="text-sm text-slate-500">Tap a star to rate your experience.</p>
                        <textarea className="w-full mt-4 p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" rows={3} placeholder="Tell us more about your experience..." />
                        <button className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-2xl transition-colors" onClick={() => setActiveModal(null)}>
                            Submit Feedback
                        </button>
                    </div>
                );
            default:
                return null;
        }
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
                                    <span className="text-sm leading-none select-none">✕</span> Cancel
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-4">
                        {[
                            { icon: <User size={16} />, label: "Full Name", value: name || "Not set", draft: draftName, setter: setDraftName, key: "name", placeholder: "e.g. John Doe", type: "text" },
                            { icon: <Mail size={16} />, label: "Email", value: user?.email, draft: null, setter: null, key: "email", type: "text" },
                            { icon: <Phone size={16} />, label: "Phone", value: phone || "Not set", draft: draftPhone, setter: setDraftPhone, key: "phone", placeholder: "e.g. +60 12-345", type: "tel" },
                            { icon: <MapPin size={16} />, label: "Location", value: location || "Not set", draft: draftLocation, setter: setDraftLocation, key: "location", placeholder: "e.g. Kuala Lumpur", type: "text" },
                        ].map(field => (
                            <div key={field.key} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50">
                                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-500 shadow-sm flex-shrink-0 mt-0.5">
                                    {field.icon}
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-400 font-medium mb-0.5">{field.label}</p>
                                    {editing && field.setter ? (
                                        <input
                                            type={field.type}
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

                        {/* Age field — separate because it's a number */}
                        <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50">
                            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-500 shadow-sm flex-shrink-0 mt-0.5">
                                <Calendar size={16} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-400 font-medium mb-0.5">Age</p>
                                {editing ? (
                                    <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        className="w-full text-sm font-semibold text-slate-700 bg-white border border-sky-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-300"
                                        value={draftAge}
                                        onChange={e => setDraftAge(e.target.value === "" ? "" : Number(e.target.value))}
                                        placeholder="e.g. 35"
                                    />
                                ) : (
                                    <p className="text-sm font-semibold text-slate-700">{age !== "" ? `${age} years old` : "Not set"}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Save success flash */}
                    {saveSuccess && (
                        <div className="mt-4 flex items-center gap-2 text-emerald-600 text-sm font-semibold bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 animate-in fade-in slide-in-from-bottom-2">
                            <Check size={16} strokeWidth={3} /> Profile saved successfully!
                        </div>
                    )}

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

            <AccountSettings />

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
                                        onClick={() => setActiveModal(item.label)}
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

            {/* Modal Overlay */}
            {activeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setActiveModal(null)} />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-200 z-10 flex flex-col">
                        <div className="relative p-8 pt-10">
                            <button
                                onClick={() => setActiveModal(null)}
                                className="absolute -top-4 -right-4 w-12 h-12 bg-rose-500 hover:bg-rose-600 rounded-full flex items-center justify-center text-white shadow-xl hover:shadow-rose-300 hover:scale-110 transition-all z-10 active:scale-95"
                                title="Close"
                            >
                                <span className="text-xl font-black leading-none select-none">✕</span>
                            </button>

                            <h2 className="text-2xl font-bold text-slate-800 text-center mb-8">{activeModal}</h2>

                            {renderModalContent()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
