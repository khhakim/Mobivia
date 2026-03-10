import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri, calculatePostureJS } from "../lib/postureEngine";
import type { PostureResult } from "../lib/postureEngine";
import { Dumbbell, PhoneCall, Play, Pause, XCircle, Send } from "lucide-react";
import type { Landmark } from "../components/VisionEngine";

// Lazy load the heavy ML vision engine so it doesn't block the UI thread during tab switching
const VisionEngine = lazy(() => import("../components/VisionEngine"));
import Peer, { MediaConnection } from "peerjs";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

const ASSESSMENT_STEPS = [
    { id: 1, title: 'Standing Naturally', subtitle: 'Evaluates vertical alignment and shoulder symmetry.', videoUrl: 'https://cdn.pixabay.com/video/2021/08/21/85806-591583566_tiny.mp4' },
    { id: 2, title: 'Sitting Upright', subtitle: 'Evaluates hip/knee flexion angles and spine verticality.', videoUrl: 'https://cdn.pixabay.com/video/2016/09/21/5424-183786524_tiny.mp4' },
    { id: 3, title: 'Forward Reach', subtitle: 'Evaluates shoulder flexion and elbow extension.', videoUrl: 'https://cdn.pixabay.com/video/2020/05/18/40058-422846983_tiny.mp4' },
    { id: 4, title: 'Hands Overhead', subtitle: 'Evaluates full arm extension vertically.', videoUrl: 'https://cdn.pixabay.com/video/2019/11/07/28807-372175926_tiny.mp4' },
    { id: 5, title: 'Side Bends', subtitle: 'Evaluates maximum lateral spine deviation.', videoUrl: 'https://cdn.pixabay.com/video/2021/08/21/85806-591583566_tiny.mp4' },
    { id: 6, title: 'Partial Squat', subtitle: 'Evaluates knee/hip angles and squat depth.', videoUrl: 'https://cdn.pixabay.com/video/2022/10/24/136195-764024317_tiny.mp4' },
    { id: 7, title: 'Return to Neutral', subtitle: 'Return to standing evaluation criteria.', videoUrl: 'https://cdn.pixabay.com/video/2021/08/21/85806-591583566_tiny.mp4' }
];

export default function Assessment() {
    const [result, setResult] = useState<PostureResult | null>(null);
    const resultRef = useRef<PostureResult | null>(null);
    useEffect(() => { resultRef.current = result; }, [result]);

    const [, setScores] = useState<number[]>([]);
    const [finalScore, setFinalScore] = useState<number | null>(null);
    const [isPaused, setIsPaused] = useState<boolean>(false);

    const [error, setError] = useState<string | null>(null);

    // Defer vision engine mounting to keep tab animations perfectly smooth
    const [mountEngine, setMountEngine] = useState(false);
    useEffect(() => {
        // Wait 300ms after tab mount before hitting the main thread with WASM/Camera loading
        const t = setTimeout(() => setMountEngine(true), 300);
        return () => clearTimeout(t);
    }, []);

    // Guided Sequence State
    const [sequenceMode, setSequenceMode] = useState<boolean>(false);
    const [activeStep, setActiveStep] = useState<number>(1);
    const [timer, setTimer] = useState<number>(0);
    const [phase, setPhase] = useState<'idle' | 'prepare' | 'capture' | 'complete'>('idle');

    // Doctor Alerting State
    const [doctors, setDoctors] = useState<any[]>([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
    const [alertStatus, setAlertStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

    const { profile } = useAuth();
    const patientIdRef = useRef<string>('');
    const [pendingSession, setPendingSession] = useState<any>(null);
    const [isJoiningCall, setIsJoiningCall] = useState(false);

    useEffect(() => {
        if (profile?.id) {
            patientIdRef.current = profile.id;
        }
    }, [profile]);

    const timerRef = useRef<number | null>(null);
    const frameBatchRef = useRef<{ timestampMs: number, landmarks: Landmark[] }[]>([]);
    const allFramesRef = useRef<{ step_id: number, frames_data: any[] }[]>([]);

    // WebRTC Telehealth State
    const [peerId, setPeerId] = useState<string>('');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerInstance = useRef<Peer | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    // Keep stream ref up to date for the Peer event callbacks
    useEffect(() => {
        localStreamRef.current = localStream;
    }, [localStream]);

    // Initialize PeerJS ONCE
    useEffect(() => {
        const peer = new Peer();

        peer.on('open', (id) => {
            setPeerId(id);
        });

        peer.on('call', (call: MediaConnection) => {
            // Auto-answer the call if we have our vision stream ready
            if (localStreamRef.current) {
                call.answer(localStreamRef.current);
                call.on('stream', (remoteStream) => {
                    setRemoteStream(remoteStream);
                });
                call.on('close', () => {
                    setRemoteStream(null);
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

    // 0.5 Listen for Doctor Telehealth Sessions
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
                    console.log("Telehealth session update:", payload);
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

    // Fetch doctors for the manual "Send to Doctor" dropdown
    useEffect(() => {
        const fetchDoctors = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'Doctor');
            if (data && data.length > 0) {
                setDoctors(data);
                setSelectedDoctorId(data[0].id);
            }
        };
        fetchDoctors();
    }, []);

    const alertDoctor = async () => {
        if (!selectedDoctorId || !peerId || !profile) {
            console.warn('alertDoctor missing required data:', { selectedDoctorId, peerId, profileId: profile?.id });
            return;
        }
        setAlertStatus('sending');

        // Step 1: Remove any stale session between this exact pair
        await supabase
            .from('telehealth_sessions')
            .delete()
            .eq('doctor_id', selectedDoctorId)
            .eq('patient_id', profile.id)
            .in('status', ['pending', 'cancelled', 'completed']);

        // Step 2: Insert a fresh pending session with the current peer ID
        const { data: newSession, error: insertError } = await supabase
            .from('telehealth_sessions')
            .insert({
                doctor_id: selectedDoctorId,
                patient_id: profile.id,
                patient_peer_id: peerId,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Alert Doctor failed – Supabase error:', insertError);
            setAlertStatus('idle');
        } else {
            console.log('Telehealth session created successfully:', newSession);
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
            setError("Failed to connect to the doctor. Please try again.");
        } else {
            setPendingSession(null); // Hide button after joining
        }
        setIsJoiningCall(false);
    };

    // Attach remote stream to video element when it arrives
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // 1. Timer countdown effect
    useEffect(() => {
        if (!sequenceMode || phase === 'idle' || phase === 'complete' || isPaused) return;

        timerRef.current = window.setInterval(() => {
            setTimer((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [sequenceMode, phase, isPaused]);

    // 2. Phase transition effect
    useEffect(() => {
        if (!sequenceMode || phase === 'idle' || phase === 'complete' || isPaused) return;
        if (timer > 0) return; // Only transition when timer hits 0

        // Timer hit 0, transition phase
        if (phase === 'prepare') {
            setPhase('capture');
            setTimer(5); // 5 seconds to capture peak posture
        } else if (phase === 'capture') {
            setScores(prevScores => {
                const newScores = [...prevScores, resultRef.current?.score || 0];

                if (frameBatchRef.current.length > 0) {
                    allFramesRef.current.push({
                        step_id: activeStep,
                        frames_data: [...frameBatchRef.current]
                    });
                    frameBatchRef.current = [];
                }

                if (activeStep === 7) {
                    const avg = newScores.reduce((a, b) => a + b, 0) / 7;
                    setFinalScore(avg);

                    const riskLevel = avg >= 80 ? "Low" : avg >= 50 ? "Moderate" : "High";

                    const aid = crypto.randomUUID();

                    if (patientIdRef.current) {
                        supabase.from("assessments").insert([{
                            id: aid,
                            patient_id: patientIdRef.current,
                            overall_score: avg,
                            risk_level: riskLevel,
                            status: 'completed'
                        }]).then(({ error }) => {
                            if (error) console.error("Failed to insert assessment", error);
                            else {
                                if (allFramesRef.current.length > 0) {
                                    const framesToInsert = allFramesRef.current.map(f => ({
                                        assessment_id: aid,
                                        step_id: f.step_id,
                                        frames_data: f.frames_data
                                    }));
                                    supabase.from('assessment_frames').insert(framesToInsert).then(({ error: err2 }) => {
                                        if (err2) console.error("Failed to insert frames", err2);
                                    });
                                }
                            }
                        });
                    }
                }
                return newScores;
            });

            if (activeStep < 7) {
                setPhase('prepare');
                setResult(null); // Clear previous result
                setActiveStep(s => s + 1);
                setTimer(15); // 15 seconds to prepare for next step
            } else {
                setPhase('complete');
                setSequenceMode(false);
                setTimer(0);
            }
        }
    }, [timer, sequenceMode, phase, activeStep, isPaused]);

    // Hook this callback into VisionEngine so we stream live frames into Rust
    const handlePoseDetected = useCallback(async (landmarks: Landmark[]) => {
        // Only process logic if we are actively capturing, OR if not in sequence mode
        if (sequenceMode && (phase !== 'capture' || isPaused)) return;

        // To ensure we don't accidentally send the wrong step due to closure capture, use a ref or depend strictly on activeStep.
        const currentStep = activeStep;

        try {
            if (landmarks.length < 33) return;

            let postureResult: PostureResult;

            if (isTauri()) {
                // Desktop: use the high-performance Rust backend via IPC
                postureResult = await invoke<PostureResult>("calculate_posture", {
                    landmarks,
                    stepId: currentStep
                });
            } else {
                // Browser: use the TypeScript mirror of the same algorithm
                postureResult = calculatePostureJS(landmarks, currentStep);
            }

            setResult(postureResult);

            if (sequenceMode && phase === 'capture') {
                frameBatchRef.current.push({
                    timestampMs: Date.now(),
                    landmarks: landmarks
                });
            }
        } catch (e: any) {
            console.error("Posture Engine Error: ", e);
            setError(e.toString());
        }
    }, [activeStep, sequenceMode, phase]);

    const startSequence = () => {
        setActiveStep(1);
        setResult(null);
        setScores([]);
        setFinalScore(null);
        setSequenceMode(true);
        setIsPaused(false);
        setPhase('prepare');
        setTimer(15); // 15 secs to prep for step 1
        frameBatchRef.current = [];
        allFramesRef.current = [];
    };

    const cancelSequence = () => {
        setSequenceMode(false);
        setPhase('idle');
        setIsPaused(false);
        setTimer(0);
        setScores([]);
        setResult(null);
        setActiveStep(1);
        frameBatchRef.current = [];
        allFramesRef.current = [];
    };
    // We don't need the mock test button anymore since the camera streams data!

    return (
        <>
            {/* Left Column: Posture Overlay and Metrics */}
            <section className="flex-1 space-y-6 lg:max-w-[calc(100%-432px)]">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Mobivia AI Core</p>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Guided Assessment</h2>

                        {/* Telehealth Status Badge */}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            {peerId ? (
                                <span className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                                    <PhoneCall size={12} className="mr-1.5" />
                                    Telehealth ID: <b className="ml-1 tracking-wider">{peerId}</b>
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-500 shadow-sm">
                                    Generating ID...
                                </span>
                            )}

                            {/* Manual Alert Doctor UI */}
                            {peerId && doctors.length > 0 && !remoteStream && (
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                                    <select
                                        value={selectedDoctorId}
                                        onChange={(e) => setSelectedDoctorId(e.target.value)}
                                        className="text-xs bg-transparent border-none focus:ring-0 text-slate-600 font-medium py-1 pl-2 pr-6"
                                    >
                                        {doctors.map(d => (
                                            <option key={d.id} value={d.id}>Dr. {d.full_name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={alertDoctor}
                                        disabled={alertStatus !== 'idle'}
                                        className={`flex items-center px-3 py-1.5 rounded text-xs font-bold text-white transition-colors ${alertStatus === 'sent' ? 'bg-emerald-500' : 'bg-sky-500 hover:bg-sky-600'}`}
                                    >
                                        {alertStatus === 'sending' ? (
                                            <span className="animate-pulse">Sending...</span>
                                        ) : alertStatus === 'sent' ? (
                                            <span>Sent!</span>
                                        ) : (
                                            <>
                                                <Send size={12} className="mr-1.5" />
                                                Alert Doctor
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {pendingSession && !remoteStream && (
                                <button
                                    onClick={joinTelehealthSession}
                                    disabled={isJoiningCall || !peerId}
                                    className="animate-in fade-in slide-in-from-bottom-2 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md transition-colors disabled:opacity-50"
                                >
                                    <PhoneCall size={14} className="mr-2 animate-pulse" />
                                    {isJoiningCall ? 'Connecting...' : "Join Doctor's Call"}
                                </button>
                            )}

                            {remoteStream && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 animate-pulse">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></div>
                                    Doctor Connected
                                </span>
                            )}
                        </div>
                    </div>

                    {!sequenceMode && phase !== 'complete' && (
                        <button
                            onClick={startSequence}
                            className="px-6 py-3 bg-[#3b5bdb] border border-[#3b5bdb] text-white rounded-[1.25rem] font-bold hover:bg-[#2f4bc2] transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center space-x-2"
                        >
                            <Dumbbell size={18} />
                            <span>Start Live Sequence</span>
                        </button>
                    )}

                    {sequenceMode && phase !== 'complete' && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => setIsPaused(!isPaused)}
                                className={`px-5 py-2.5 rounded-full font-bold transition-all shadow-sm flex items-center space-x-2 ${isPaused ? 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            >
                                {isPaused ? <Play size={16} className="fill-current" /> : <Pause size={16} className="fill-current" />}
                                <span>{isPaused ? 'Resume' : 'Pause'}</span>
                            </button>
                            <button
                                onClick={cancelSequence}
                                className="px-5 py-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-full font-bold hover:bg-rose-100 transition-colors shadow-sm flex items-center space-x-2"
                            >
                                <XCircle size={16} />
                                <span>Cancel</span>
                            </button>
                        </div>
                    )}

                    {phase === 'complete' && (
                        <div className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-full font-bold shadow-sm flex items-center space-x-2">
                            <span>Assessment Complete! Avg: {finalScore !== null ? Math.round(finalScore) : '--'}</span>
                        </div>
                    )}
                </header>

                {/* Reference Video Block (Only Active in Sequence Mode) */}
                {sequenceMode && (
                    <div className="bg-sky-50 rounded-[2rem] p-6 shadow-sm border border-sky-100 flex gap-6 items-center flex-col sm:flex-row shadow-inner">
                        <div className="w-48 h-32 bg-slate-200 rounded-xl overflow-hidden shadow-md flex-shrink-0 relative">
                            <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-white z-10">REF</div>
                            <video
                                key={ASSESSMENT_STEPS[activeStep - 1].videoUrl}
                                src={ASSESSMENT_STEPS[activeStep - 1].videoUrl}
                                className="w-full h-full object-cover"
                                autoPlay
                                loop
                                muted
                                playsInline
                            />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="text-sky-600 font-bold text-xs uppercase tracking-wider">Up Next</span>
                                    <h3 className="text-xl font-bold text-slate-900 mt-1">Step {activeStep}: {ASSESSMENT_STEPS[activeStep - 1].title}</h3>
                                    <p className="text-slate-600 text-sm mt-1">{ASSESSMENT_STEPS[activeStep - 1].subtitle}</p>
                                </div>

                                {/* Dynamic Timer Ring */}
                                <div className="relative w-16 h-16 flex items-center justify-center bg-white rounded-full shadow-sm border border-slate-100">
                                    <svg className="w-14 h-14 transform -rotate-90 absolute">
                                        <circle cx="28" cy="28" r="24" className="stroke-slate-100" strokeWidth="4" fill="none" />
                                        <circle
                                            cx="28" cy="28" r="24"
                                            className={`transition-all duration-1000 ease-linear ${phase === 'prepare' ? 'stroke-amber-400' : 'stroke-red-500'}`}
                                            strokeWidth="4" fill="none"
                                            strokeDasharray="150"
                                            strokeDashoffset={150 - (150 * timer) / (phase === 'prepare' ? 15 : 5)}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <span className={`text-xl font-bold z-10 ${phase === 'prepare' ? 'text-amber-500' : 'text-red-500 animate-pulse'}`}>{timer}</span>
                                </div>
                            </div>

                            <div className={`mt-4 px-4 py-2 inline-block rounded-full text-sm font-bold ${phase === 'prepare' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                                {phase === 'prepare' ? 'Get into position...' : 'Capturing Data... Hold Still!'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Vison Engine / Camera Card */}
                <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100 relative group">
                    {!sequenceMode && (
                        <div className="mt-2 mb-4 px-4 flex justify-between items-end">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Step {activeStep}: {ASSESSMENT_STEPS[activeStep - 1].title}</h3>
                                <p className="text-slate-500 text-sm mt-1">Free Practice Mode</p>
                            </div>
                        </div>
                    )}
                    {mountEngine ? (
                        <Suspense fallback={
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm z-20 rounded-[2rem]">
                                <div className="text-center space-y-4">
                                    <div className="w-12 h-12 border-4 border-t-sky-500 border-slate-200 rounded-full animate-spin mx-auto text-sky-500"></div>
                                    <p className="text-sky-700 font-bold animate-pulse text-sm tracking-wider uppercase">Loading Vision Engine...</p>
                                </div>
                            </div>
                        }>
                            <VisionEngine
                                onPoseDetected={handlePoseDetected}
                                onStreamAllocated={(stream) => setLocalStream(stream)}
                            />
                        </Suspense>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm z-20 rounded-[2rem]">
                            <div className="text-center space-y-4">
                                <div className="w-12 h-12 border-4 border-t-sky-500 border-slate-200 rounded-full animate-spin mx-auto text-sky-500"></div>
                                <p className="text-sky-700 font-bold animate-pulse text-sm tracking-wider uppercase">Preparing Camera...</p>
                            </div>
                        </div>
                    )}

                    {/* Telehealth Overlaid Doctor Video */}
                    {remoteStream && (
                        <div className="absolute top-4 right-4 w-48 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-white/50 z-50">
                            <span className="absolute top-1 left-2 text-[10px] font-bold text-white z-10 drop-shadow-md">Doctor View</span>
                            <video
                                ref={remoteVideoRef}
                                className="w-full h-full object-cover"
                                autoPlay
                                playsInline
                            ></video>
                        </div>
                    )}
                </div>

                {/* 7-Step Assessment Grid */}
                <div className="mt-8">
                    <h3 className="text-xl font-bold text-slate-900 mb-6 font-sans">The Seven-Step Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                        {ASSESSMENT_STEPS.map((step) => {
                            const isActive = step.id === activeStep;
                            return (
                                <div
                                    key={step.id}
                                    onClick={() => {
                                        if (sequenceMode) return; // Prevent clicking during sequence
                                        setActiveStep(step.id);
                                        setResult(null);
                                    }}
                                    className={`rounded-[1.25rem] p-6 border relative overflow-hidden flex flex-col justify-between transition-all ${isActive ? 'bg-sky-50 outline outline-2 outline-sky-500 border-transparent shadow-sm' : 'bg-white border-slate-100 hover:shadow-md hover:-translate-y-0.5'} ${sequenceMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    {isActive && <div className="absolute -top-6 -right-6 w-24 h-24 bg-sky-100 rounded-full opacity-50"></div>}
                                    <div className="relative z-10 mb-4">
                                        <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-sky-600' : 'text-slate-400'}`}>Step {step.id}</span>
                                        <h4 className={`text-lg font-bold mt-1 ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{step.title}</h4>
                                    </div>
                                    <p className={`text-sm line-clamp-2 mt-auto ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                                        {isActive ? step.subtitle : "Click to initiate this assessment step."}
                                    </p>
                                </div>
                            );
                        })}

                    </div>
                </div>
            </section>

            {/* Right Column: Analytics & Scoring */}
            <section className="w-full lg:w-[400px] space-y-6 mt-20 lg:mt-0 flex-shrink-0">

                {/* Main Score Card */}
                <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center relative overflow-hidden">
                    <h3 className="text-slate-500 font-semibold tracking-wider text-xs uppercase mb-6 z-10">{phase === 'complete' ? 'Final Score' : 'Mobility Score'}</h3>

                    <div className="relative w-48 h-48 flex items-center justify-center z-10">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="96" cy="96" r="80" className="stroke-slate-100" strokeWidth="16" fill="none" />
                            <circle
                                cx="96"
                                cy="96"
                                r="80"
                                className="stroke-emerald-400 transition-all duration-1000 ease-out"
                                strokeWidth="16"
                                fill="none"
                                strokeDasharray="502"
                                strokeDashoffset={
                                    phase === 'complete' && finalScore !== null
                                        ? 502 - (502 * finalScore) / 100
                                        : result ? 502 - (502 * result.score) / 100
                                            : 502
                                }
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-6xl font-bold text-slate-800 tracking-tighter">
                                {phase === 'complete' && finalScore !== null
                                    ? Math.round(finalScore)
                                    : result ? Math.round(result.score) : "--"}
                            </span>
                            <span className="text-sm font-semibold text-emerald-500 mt-1">
                                {phase === 'complete' && finalScore !== null
                                    ? (finalScore > 80 ? "Optimal" : "Review Needed")
                                    : result ? (result.score > 80 ? "Optimal" : "Good") : "Scanning"}
                            </span>
                        </div>
                    </div>

                    <div className={`mt-8 px-4 py-1.5 rounded-full text-sm font-bold flex items-center space-x-2 ${(phase === 'complete' || result) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${(phase === 'complete' || result) ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                        <span>{phase === 'complete' ? 'Assessment Finished' : result ? (result.passed ? 'Low Risk' : 'Deviations Detected') : 'Waiting for Data...'}</span>
                    </div>

                    <p className="text-xs text-slate-400 mt-6 font-medium">Session UUID: Tauri IPC Engine</p>
                </div>

                {/* Assessment Real-Time Metrics */}
                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-600 text-sm shadow-sm">
                        <b>Engine Fault:</b> {error}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                    {result ? result.metrics.map((metric, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-slate-800 font-bold mb-1">{metric.label}</span>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-md w-max ${metric.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {metric.passed ? 'Optimal' : 'Deviation'}
                                </span>
                            </div>
                            <div className="text-right flex flex-col">
                                <span className={`text-2xl font-bold tracking-tight ${metric.passed ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {metric.value.toFixed(1)}{metric.unit}
                                </span>
                            </div>
                        </div>
                    )) : (
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-center text-slate-400 text-sm font-medium">
                            Step specific metrics will stream here automatically.
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
