import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Save, AlertTriangle, CheckCircle } from 'lucide-react';

export default function AccountSettings() {
    const { session } = useAuth();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (session?.user?.email) {
            setEmail(session.user.email);
        }
    }, [session]);

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setLoading(true);

        try {
            if (!session?.user?.email) throw new Error('No user found');
            if (email === session.user.email) {
                setLoading(false);
                return;
            }

            const { error } = await supabase.auth.updateUser({ email: email });

            if (error) {
                throw error;
            }

            setMessage({
                type: 'success',
                text: 'Email update triggered. Please check both your old and new email addresses to confirm the change.'
            });

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Error updating email address' });
            // Revert the email back
            if (session?.user?.email) setEmail(session.user.email);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-6 md:p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Account Settings</h2>

            {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                    {message.type === 'success' ? <CheckCircle className="shrink-0 mt-0.5" size={18} /> : <AlertTriangle className="shrink-0 mt-0.5" size={18} />}
                    <span className="text-sm font-medium leading-relaxed">{message.text}</span>
                </div>
            )}

            <form onSubmit={handleUpdateEmail} className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 focus:bg-white focus:border-[#3b5bdb] focus:ring-4 focus:ring-[#3b5bdb]/10 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400 rounded-xl"
                        required
                    />
                    <p className="mt-2 text-xs text-slate-500">
                        Changing your email address may require confirmation via a link sent to both your old and new inboxes, depending on your Supabase security settings.
                    </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                        type="submit"
                        disabled={loading || email === session?.user?.email}
                        className="flex items-center gap-2 bg-[#3b5bdb] hover:bg-[#2f4bc2] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
                    >
                        {loading ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <>
                                <Save size={18} />
                                Update Email
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
