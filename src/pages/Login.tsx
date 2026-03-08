import { useNavigate } from "react-router-dom";
import { User, Stethoscope } from "lucide-react";

export default function Login() {
    const navigate = useNavigate();

    const handleSelectRole = (role: 'Doctor' | 'Patient') => {
        localStorage.setItem('mobivia_role', role);
        if (role === 'Doctor') {
            navigate('/doctor-dashboard');
        } else {
            navigate('/dashboard/home');
        }
    };

    return (
        <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center font-sans">
            <div className="bg-white p-10 rounded-[2rem] shadow-xl max-w-lg w-full text-center border border-slate-100">
                <div className="w-16 h-16 rounded-xl bg-sky-500 flex items-center justify-center mx-auto text-white font-bold text-3xl shadow-sm mb-6">
                    M
                </div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to Mobivia</h1>
                <p className="text-slate-500 mb-10">Please select your role to continue. This will configure your WebRTC and assessment tools.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => handleSelectRole('Patient')}
                        className="flex flex-col items-center p-6 bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 rounded-2xl transition-all group"
                    >
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                            <User size={32} className="text-slate-600 group-hover:text-sky-500 transition-colors" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">User / Patient</h3>
                        <p className="text-sm text-slate-500 mt-2">I am here to perform my mobility assessment.</p>
                    </button>

                    <button
                        onClick={() => handleSelectRole('Doctor')}
                        className="flex flex-col items-center p-6 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-2xl transition-all group"
                    >
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                            <Stethoscope size={32} className="text-slate-600 group-hover:text-emerald-500 transition-colors" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">Doctor</h3>
                        <p className="text-sm text-slate-500 mt-2">I am here to review and guide the assessment.</p>
                    </button>
                </div>
            </div>
        </div>
    );
}
