import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Stethoscope } from 'lucide-react';
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
    const navigate = useNavigate();
    const { session, profile, isLoading } = useAuth();

    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [age, setAge] = useState('');
    const [doctorId, setDoctorId] = useState('');
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
                            age: role === 'Patient' && age ? parseInt(age) : null,
                            doctor_id: role === 'Doctor' ? doctorId : null,
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
        return <div className="min-h-screen flex items-center justify-center bg-white font-sans text-slate-500">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-white flex font-sans leading-normal">
            {/* Left Panel - Branding */}
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-[#3b5bdb] via-[#2f4bc2] to-[#1c30a6] text-white p-16 flex-col justify-between">
                {/* Decorative background lines/curves */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <svg className="absolute w-[200%] h-[200%] -top-[50%] -left-[50%]" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d="M 0 100 Q 50 20 100 100" fill="none" stroke="white" strokeWidth="0.1" className="opacity-30" />
                        <path d="M 10 100 Q 60 10 100 90" fill="none" stroke="white" strokeWidth="0.1" className="opacity-40" />
                        <path d="M 20 100 Q 70 0 100 80" fill="none" stroke="white" strokeWidth="0.1" className="opacity-50" />
                        <path d="M 30 100 Q 80 -10 100 70" fill="none" stroke="white" strokeWidth="0.1" className="opacity-60" />
                    </svg>
                </div>

                <div className="relative z-10 flex flex-col items-start text-left pt-12">
                    <img src="/logo.png" alt="Mobivia Logo" className="w-24 h-24 mb-16 object-cover rounded-full shadow-md" />

                    <h1 className="text-6xl font-bold leading-tight mb-6 tracking-tight">
                        Hello<br />
                        Mobivia! <span className="inline-block animate-wave">👋🏻</span>
                    </h1>

                    <p className="text-blue-100 text-xl font-light max-w-md leading-relaxed">
                        Smarter mobility screening powered by AI. Mobivia analyzes posture, reconstructs patient movement in 3D, and helps doctors detect mobility decline early.
                    </p>
                </div>

                <div className="relative z-10 text-blue-200/80 text-sm font-medium tracking-wide">
                    &copy; 2026 Mobivia. All rights reserved.
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full lg:w-[45%] flex flex-col relative overflow-y-auto">
                {/* Branding for mobile/top right */}
                <div className="absolute top-8 left-8 lg:left-16 font-bold text-xl tracking-tight text-slate-900 hidden sm:block">
                    Mobivia
                </div>

                <div className="flex-1 flex flex-col justify-center px-6 sm:px-16 lg:px-20 xl:px-28 py-12">
                    <div className="w-full max-w-md mx-auto">
                        <h2 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight text-left">
                            {isLogin ? 'Welcome Back!' : 'Create an Account'}
                        </h2>
                        <p className="text-sm text-slate-500 mb-8 leading-relaxed text-left">
                            {isLogin ? 'Please enter your details to sign in.' : 'Please fill in your details to get started.'}
                        </p>

                        {errorMsg && (
                            <div className={`${errorMsg.includes('successful') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'} p-4 rounded-xl text-sm mb-6 text-left border`}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {!isLogin && (
                                <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-1">
                                        <input
                                            type="text"
                                            required
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Full Name"
                                            className="w-full px-4 py-4 bg-white border border-slate-200 focus:bg-white focus:border-[#3b5bdb] focus:ring-4 focus:ring-[#3b5bdb]/10 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal rounded-xl"
                                        />
                                    </div>
                                    {role === 'Patient' ? (
                                        <div className="space-y-1">
                                            <input
                                                type="number"
                                                value={age}
                                                onChange={(e) => setAge(e.target.value)}
                                                placeholder="Age"
                                                min="0"
                                                max="120"
                                                required
                                                className="w-full px-4 py-4 bg-white border border-slate-200 focus:bg-white focus:border-[#3b5bdb] focus:ring-4 focus:ring-[#3b5bdb]/10 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal rounded-xl"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <input
                                                type="text"
                                                value={doctorId}
                                                onChange={(e) => {
                                                    // Only allow numbers, max 4 digits
                                                    const val = e.target.value.replace(/\D/g, '');
                                                    if (val.length <= 4) setDoctorId(val);
                                                }}
                                                placeholder="Doctor ID (4 digits)"
                                                maxLength={4}
                                                pattern="\d{4}"
                                                required
                                                className="w-full px-4 py-4 bg-white border border-slate-200 focus:bg-white focus:border-[#3b5bdb] focus:ring-4 focus:ring-[#3b5bdb]/10 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal rounded-xl"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-1">
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={!isLogin ? "Email Address" : "patient@mobivia.com"}
                                    className="w-full px-4 py-4 bg-white border border-slate-200 focus:bg-white focus:border-[#3b5bdb] focus:ring-4 focus:ring-[#3b5bdb]/10 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal rounded-xl"
                                />
                            </div>

                            <div className="space-y-1">
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full px-4 py-4 bg-white border border-slate-200 focus:bg-white focus:border-[#3b5bdb] focus:ring-4 focus:ring-[#3b5bdb]/10 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal rounded-xl"
                                />
                            </div>

                            {!isLogin && (
                                <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">I am a</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRole('Patient')}
                                            className={`flex items-center justify-center space-x-2 py-3.5 border rounded-xl font-bold transition-all cursor-pointer ${role === 'Patient' ? 'bg-[#3b5bdb] border-[#3b5bdb] text-white shadow-md ring-2 ring-[#3b5bdb]/30 ring-offset-1 scale-[1.02]' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}
                                        >
                                            <User size={18} className={role === 'Patient' ? 'text-white' : 'text-slate-400'} />
                                            <span>Patient</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRole('Doctor')}
                                            className={`flex items-center justify-center space-x-2 py-3.5 border rounded-xl font-bold transition-all cursor-pointer ${role === 'Doctor' ? 'bg-[#3b5bdb] border-[#3b5bdb] text-white shadow-md ring-2 ring-[#3b5bdb]/30 ring-offset-1 scale-[1.02]' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}
                                        >
                                            <Stethoscope size={18} className={role === 'Doctor' ? 'text-white' : 'text-slate-400'} />
                                            <span>Doctor</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-[#3b5bdb] hover:bg-[#2f4bc2] text-white py-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-70 disabled:hover:translate-y-0 flex justify-center items-center"
                                >
                                    {loading ? (
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : isLogin ? 'Login Now' : 'Create Account'}
                                </button>
                            </div>

                        </form>

                        <div className="mt-8 text-center pt-2 flex flex-col gap-4">
                            {isLogin && (
                                <p className="text-sm text-slate-500">
                                    Forget password? <a href="#" className="font-bold text-slate-900 hover:text-indigo-600 transition-colors">Click here</a>
                                </p>
                            )}
                            <p className="text-sm text-slate-500">
                                {isLogin ? (
                                    <>Don't have an account? <button type="button" onClick={() => setIsLogin(false)} className="font-bold text-slate-900 hover:text-indigo-600 transition-colors ml-1">Sign up</button></>
                                ) : (
                                    <>Already have an account? <button type="button" onClick={() => setIsLogin(true)} className="font-bold text-slate-900 hover:text-indigo-600 transition-colors ml-1">Login</button></>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            {/* Persistent Copyright Tag */}
            <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none z-20">
                <p className="text-[10px] text-slate-400 font-medium opacity-60">
                    &copy; 2026 Mobivia. All rights reserved.
                </p>
            </div>
        </div>
    );
}

