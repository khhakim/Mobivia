import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { PhoneCall, Copy, CheckCircle } from "lucide-react";
import type { Landmark } from "../components/VisionEngine";
import Peer, { MediaConnection } from "peerjs";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

// Lazy load the heavy ML vision engine
const VisionEngine = lazy(() => import("../components/VisionEngine"));

export default function PatientTelehealth() {
    const { profile } = useAuth();
    const [peerId, setPeerId] = useState<string>('');
    const [doctors, setDoctors] = useState<any[]>([]);
    const [telehealthStatus, setTelehealthStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerInstance = useRef<Peer | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    // Keep stream ref up to date
    useEffect(() => {
        localStreamRef.current = localStream;
    }, [localStream]);

    // Defer vision engine mounting for smooth tab transitions
    const [mountEngine, setMountEngine] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMountEngine(true), 300);
        return () => clearTimeout(t);
    }, []);

    // 1. Fetch available doctors
    useEffect(() => {
        const fetchDoctors = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'Doctor');
            if (error) console.error("Error fetching doctors:", error);
            if (data) setDoctors(data);
        };
        fetchDoctors();
    }, []);

    // 2. Initialize PeerJS ONCE
    useEffect(() => {
        const peer = new Peer();

        peer.on('open', (id) => {
            setPeerId(id);
        });

        peer.on('call', (call: MediaConnection) => {
            // Auto-answer the call if we have our vision stream ready
            if (localStreamRef.current) {
                call.answer(localStreamRef.current);
                call.on('stream', (rStream) => {
                    setRemoteStream(rStream);
                    setTelehealthStatus('connected');
                });
                call.on('close', () => {
                    setRemoteStream(null);
                    setTelehealthStatus('idle');
                });
            } else {
                console.warn('Received call but local stream is not ready.');
            }
        });

        peerInstance.current = peer;

        return () => {
            peer.destroy();
        };
    }, []);

    // Attach remote stream to video element when it arrives
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);


    // Define what happens when patient clicks "Connect" on a doctor
    const connectToDoctor = async (doctorId: string) => {
        if (!profile?.id || !peerId) return;

        setTelehealthStatus('calling');

        // Upsert a pending session
        const { data, error } = await supabase
            .from('telehealth_sessions')
            .upsert({
                doctor_id: doctorId,
                patient_id: profile.id,
                patient_peer_id: peerId,
                status: 'pending'
            }, { onConflict: 'doctor_id,patient_id' })
            .select()
            .single();

        if (error) {
            console.error("Failed to initiate connection:", error);
            setTelehealthStatus('idle');
            return;
        }

        if (data) {
            setActiveSessionId(data.id);

            // Listen for the doctor changing the status to connected/completed
            const channel = supabase.channel(`session_${data.id}`)
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'telehealth_sessions', filter: `id=eq.${data.id}` },
                    (payload) => {
                        console.log("Doctor session update:", payload.new);
                        if (payload.new.status === 'cancelled' || payload.new.status === 'completed') {
                            setTelehealthStatus('idle');
                            setActiveSessionId(null);
                        }
                        // If doctor connects via PeerJS, the peer.on('call') event handles the UI state switch to 'connected'.
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    };

    const endCall = async () => {
        if (activeSessionId) {
            await supabase
                .from('telehealth_sessions')
                .update({ status: 'completed' })
                .eq('id', activeSessionId);
            setActiveSessionId(null);
        }
        setRemoteStream(null);
        setTelehealthStatus('idle');
    };

    // Callback for VisionEngine updates (we just need the local stream for PeerJS)
    const handlePoseDetected = useCallback(async (_landmarks: Landmark[]) => {
        // We can just leave this idle, or log biomechanical metrics if wanted.
        // The camera view draws the skeleton overlay natively inside VisionEngine.
    }, []);

    return (
        <div className="flex flex-col xl:flex-row gap-8 w-full h-full pb-8">
            <section className="flex-1 space-y-6">
                <header className="mb-6">
                    <p className="text-slate-500 text-sm font-medium">Mobivia AI Core</p>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Telehealth Consult</h2>
                    <p className="text-slate-600 mt-2">Connect with your physical therapist for a live video consultation while our biomechanical AI engine analyzes your pose in real-time.</p>
                </header>

                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">Patient Camera (You)</h3>
                    <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden shadow-inner relative max-w-4xl">
                        {mountEngine && (
                            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">Loading Vision Engine AI...</div>}>
                                <VisionEngine
                                    onPoseDetected={handlePoseDetected}
                                    onStreamAllocated={(stream: MediaStream) => setLocalStream(stream)}
                                />
                            </Suspense>
                        )}

                        <button
                            onClick={() => {
                                if (peerId) {
                                    navigator.clipboard.writeText(peerId);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }
                            }}
                            className="absolute top-4 left-4 bg-sky-500/90 hover:bg-sky-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold backdrop-blur flex items-center shadow-lg transition-all active:scale-95 cursor-pointer"
                        >
                            {peerId ? (
                                <>
                                    {copied ? <CheckCircle size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
                                    {copied ? "ID Copied!" : `Copy ID: ${peerId.substring(0, 8)}...`}
                                </>
                            ) : 'Initializing Peer...'}
                        </button>
                    </div>
                </div>
            </section>

            <aside className="w-full xl:w-96 space-y-6 flex-shrink-0 animate-in slide-in-from-right-8 duration-500">
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 sticky top-10">
                    {telehealthStatus === 'idle' ? (
                        <>
                            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                                <PhoneCall className="mr-2 text-sky-500" size={20} />
                                Available Doctors
                            </h3>
                            <div className="space-y-3">
                                {doctors.length === 0 ? (
                                    <p className="text-sm text-slate-500 italic">No doctors available.</p>
                                ) : (
                                    doctors.map((doc) => (
                                        <div key={doc.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-sky-200 transition-colors">
                                            <p className="font-bold text-slate-800">Dr. {doc.full_name}</p>
                                            <button
                                                onClick={() => connectToDoctor(doc.id)}
                                                disabled={!peerId}
                                                className="mt-3 w-full py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                Connect Call
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    ) : telehealthStatus === 'calling' ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                <PhoneCall className="text-amber-600" size={28} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Calling...</h3>
                            <p className="text-slate-500 text-sm mt-1">Waiting for doctor to answer</p>

                            <button
                                onClick={endCall}
                                className="mt-6 w-full py-2.5 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-colors"
                            >
                                Cancel Call
                            </button>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            <h3 className="text-lg font-bold text-emerald-600 mb-4 flex items-center">
                                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-2 animate-pulse" />
                                Live Consultation
                            </h3>

                            <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-inner w-full mb-6">
                                <video
                                    ref={remoteVideoRef}
                                    className="w-full h-full object-cover"
                                    autoPlay
                                    playsInline
                                />
                            </div>

                            <button
                                onClick={endCall}
                                className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-colors mt-auto shadow-md"
                            >
                                End Consultation
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}
