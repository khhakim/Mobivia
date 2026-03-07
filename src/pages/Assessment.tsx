import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dumbbell, PhoneCall } from "lucide-react";
import VisionEngine, { Landmark } from "../components/VisionEngine";
import Peer, { MediaConnection } from "peerjs";

interface Metric {
    label: string;
    value: number;
    unit: string;
    passed: boolean;
}

interface PostureResult {
    metrics: Metric[];
    passed: boolean;
    score: number;
}

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

    const [error, setError] = useState<string | null>(null);

    // Guided Sequence State
    const [sequenceMode, setSequenceMode] = useState<boolean>(false);
    const [activeStep, setActiveStep] = useState<number>(1);
    const [timer, setTimer] = useState<number>(0);
    const [phase, setPhase] = useState<'idle' | 'prepare' | 'capture' | 'complete'>('idle');

    const timerRef = useRef<number | null>(null);

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

    // Attach remote stream to video element when it arrives
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Auto-advance logic for the guided sequence
    useEffect(() => {
        if (!sequenceMode || phase === 'idle' || phase === 'complete') return;

        timerRef.current = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) {
                    // Timer hit 0, transition phase
                    clearInterval(timerRef.current!);

                    if (phase === 'prepare') {
                        setPhase('capture');
                        return 5; // 5 seconds to capture peak posture
                    } else if (phase === 'capture') {
                        setScores(prevScores => {
                            const newScores = [...prevScores, resultRef.current?.score || 0];
                            if (activeStep === 7) {
                                const avg = newScores.reduce((a, b) => a + b, 0) / 7;
                                setFinalScore(avg);
                            }
                            return newScores;
                        });

                        if (activeStep < 7) {
                            setPhase('prepare');
                            setResult(null); // Clear previous result
                            setActiveStep(s => s + 1); // Delay step increment explicitly
                            return 15; // 15 seconds to prepare for next step
                        } else {
                            setPhase('complete');
                            setSequenceMode(false);
                            return 0;
                        }
                    }
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [sequenceMode, phase]); // Removed activeStep from dependency to prevent re-triggering the interval mid-countdown

    // Hook this callback into VisionEngine so we stream live frames into Rust
    const handlePoseDetected = useCallback(async (landmarks: Landmark[]) => {
        // Only process logic if we are actively capturing, OR if not in sequence mode
        if (sequenceMode && phase !== 'capture') return;

        // To ensure we don't accidentally send the wrong step due to closure capture, use a ref or depend strictly on activeStep.
        const currentStep = activeStep;

        try {
            if (landmarks.length < 33) return;

            const postureResult: PostureResult = await invoke("calculate_posture", {
                landmarks,
                stepId: currentStep
            });
            setResult(postureResult);
        } catch (e: any) {
            console.error("Rust Invocation Error: ", e);
            setError(e.toString());
        }
    }, [activeStep, sequenceMode, phase]);

    const startSequence = () => {
        setActiveStep(1);
        setResult(null);
        setScores([]);
        setFinalScore(null);
        setSequenceMode(true);
        setPhase('prepare');
        setTimer(15); // 15 secs to prep for step 1
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
                        <div className="mt-2 flex items-center space-x-2">
                            {peerId ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    <PhoneCall size={12} className="mr-1.5" />
                                    Telehealth ID: <b className="ml-1 tracking-wider">{peerId}</b>
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500">
                                    Generating ID...
                                </span>
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
                            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-colors shadow-md flex items-center space-x-2"
                        >
                            <Dumbbell size={18} />
                            <span>Start Live Sequence</span>
                        </button>
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
                    <VisionEngine
                        onPoseDetected={handlePoseDetected}
                        onStreamAllocated={(stream) => setLocalStream(stream)}
                    />

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
                                    className={`rounded-2xl p-5 border relative overflow-hidden flex flex-col justify-between transition-all ${isActive ? 'bg-sky-50 border-sky-100 shadow-sm' : 'bg-white border-slate-100 hover:shadow-md'} ${sequenceMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
                        <b>Connection Fault:</b> {error}
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
