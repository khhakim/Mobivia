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
    const [alertStatus, setAlertStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [copied, setCopied] = useState(false);
    const [pendingSession, setPendingSession] = useState<any>(null);
    const [isJoiningCall, setIsJoiningCall] = useState(false);

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

    // Listen for incoming Telehealth Sessions from Doctors
    useEffect(() => {
        if (!profile?.id || profile.role !== 'Patient') return;

        const checkPendingSessions = async () => {
            const { data, error } = await supabase
                .from('telehealth_sessions')
                .select('*')
                .eq('patient_id', profile.id)
                .eq('status', 'pending')
                .maybeSingle();

            if (!error && data) {
                setPendingSession(data);
            }
        };

        checkPendingSessions();

        const channel = supabase.channel(`patient_sessions_${profile.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'telehealth_sessions', filter: `patient_id=eq.${profile.id}` },
                (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        if (payload.new.status === 'pending') {
                            setPendingSession(payload.new);
                        } else if (payload.new.status === 'cancelled' || payload.new.status === 'completed') {
                            setPendingSession(null);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile]);


    // Define what happens when patient clicks "Connect" on a doctor
    const alertDoctor = async (doctorId: string) => {
        if (!doctorId || !peerId || !profile) return;

        setAlertStatus('sending');

        // Step 1: Remove any stale session between this exact pair
        await supabase
            .from('telehealth_sessions')
            .delete()
            .eq('doctor_id', doctorId)
            .eq('patient_id', profile.id)
            .in('status', ['pending', 'cancelled', 'completed']);

        // Step 2: Insert a fresh pending session with the current peer ID
        const { error: insertError } = await supabase
            .from('telehealth_sessions')
            .insert({
                doctor_id: doctorId,
                patient_id: profile.id,
                patient_peer_id: peerId,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Alert Doctor failed:', insertError);
            setAlertStatus('idle');
        } else {
            setAlertStatus('sent');
            setTimeout(() => setAlertStatus('idle'), 3000);
        }
    };

    const joinTelehealthSession = async () => {
        if (!pendingSession || !peerId) return;
        setIsJoiningCall(true);
        const { error: joinError } = await supabase
            .from('telehealth_sessions')
            .update({
                patient_peer_id: peerId,
                status: 'accepted'
            })
            .eq('id', pendingSession.id);

        if (joinError) {
            console.error("Failed to join session:", joinError);
        } else {
            setPendingSession(null);
            setActiveSessionId(pendingSession.id);
        }
        setIsJoiningCall(false);
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
                    {telehealthStatus === 'connected' ? (
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
                    ) : pendingSession ? (
                        <div className="text-center py-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Doctor Ready</h3>
                            <p className="text-sm text-slate-500 mb-6">Your doctor has requested to join your session.</p>
                            <button
                                onClick={joinTelehealthSession}
                                disabled={isJoiningCall || !peerId}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                            >
                                {isJoiningCall ? 'Connecting...' : 'Join Call'}
                            </button>
                        </div>
                    ) : (
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
                                                onClick={() => alertDoctor(doc.id)}
                                                disabled={!peerId || alertStatus === 'sending'}
                                                className="mt-3 w-full py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {alertStatus === 'sending' ? 'Alerting...' : 'Alert Doctor'}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Overlay for Alert Status so TS doesn't narrow the union incorrectly in an else-if block */}
                            {(alertStatus === 'sending' || alertStatus === 'sent') && (
                                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-[2rem] z-10 flex flex-col items-center justify-center p-6 text-center border border-slate-200 shadow-sm">
                                    <div className="w-16 h-16 bg-sky-100 rounded-full flex flex-col items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={28} className="text-sky-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-2">Doctor Alerted</h3>
                                    <p className="text-sm text-slate-500">Waiting for them to connect to your session.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}
