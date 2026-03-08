import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Stethoscope } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
    const navigate = useNavigate();
    const { session, profile, isLoading } = useAuth();

    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [role, setRole] = useState<'Doctor' | 'Patient'>('Patient');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (session && profile) {
            if (profile.role === 'Doctor') {
                navigate('/doctor-dashboard');
            } else {
                navigate('/dashboard/home');
            }
        }
    }, [session, profile, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            } else {
                const { error, data } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            role: role,
                        }
                    }
                });
                if (error) throw error;

                // If it successfully created but session is null, email confirmation might be on.
                // Or if we just successfully sign up, let's notify the user and switch to login view.
                setErrorMsg(data.session ? '' : 'Registration successful! If you have email confirmation enabled, please check your inbox. Otherwise, you can now log in.');
                setIsLogin(true);
            }
        } catch (error: any) {
            setErrorMsg(error.message || 'An error occurred during authentication.');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-[#f2f2f7]">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center font-sans p-4">
            <div className="bg-white p-10 rounded-[2rem] shadow-xl max-w-lg w-full text-center border border-slate-100">
                <div className="w-16 h-16 rounded-xl bg-sky-500 flex items-center justify-center mx-auto text-white font-bold text-3xl shadow-sm mb-6">
                    M
                </div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to Mobivia</h1>
                <p className="text-slate-500 mb-8">
                    {isLogin ? 'Sign in to your account' : 'Create a new account'}
                </p>

                {errorMsg && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-6 text-left border border-red-100">
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                    {!isLogin && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">I am a</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setRole('Patient')}
                                        className={`flex items-center justify-center space-x-2 py-3 border rounded-xl font-medium transition-all ${role === 'Patient' ? 'bg-sky-500 border-sky-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <User size={18} />
                                        <span>Patient</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRole('Doctor')}
                                        className={`flex items-center justify-center space-x-2 py-3 border rounded-xl font-medium transition-all ${role === 'Doctor' ? 'bg-emerald-500 border-emerald-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <Stethoscope size={18} />
                                        <span>Doctor</span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    placeholder="John Doe"
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 mt-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-70 flex justify-center"
                    >
                        {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-sm text-slate-500">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="font-bold text-sky-600 hover:text-sky-700"
                        >
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
