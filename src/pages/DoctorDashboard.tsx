import { useState, useRef, useEffect, useCallback, Suspense, Component } from 'react';
import {
    Users, Activity, FileText, Settings, Video, Download, CheckCircle, AlertTriangle, XCircle, LogOut, Play, Pause, Info, Phone, Inbox
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AccountSettings from '../components/AccountSettings';
import { Landmark } from "../components/VisionEngine";
import { LineChart, Line as RechartsLine, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, useGLTF, Line as ThreeLine, Html } from '@react-three/drei';
import * as THREE from 'three';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { invoke } from '@tauri-apps/api/core';

// Error boundary to prevent Three.js/Canvas crashes from blanking the whole page
class ThreeErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err: any) { console.error('3D Engine error:', err); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full flex items-center justify-center bg-slate-100">
                    <div className="text-center p-6">
                        <p className="text-slate-500 font-medium">3D viewer unavailable</p>
                        <p className="text-slate-400 text-sm mt-1">WebGL may not be supported on this device.</p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

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

const ASSESSMENT_STEPS_META = [
    { id: 1, title: 'Standing Naturally', subtitle: 'Baseline posture', summary: 'Good spinal alignment. Mild forward head.' },
    { id: 2, title: 'Sitting Upright', subtitle: 'Spine verticality', summary: '15° forward spinal tilt detected.' },
    { id: 3, title: 'Forward Reach', subtitle: 'Shoulder symmetry', summary: 'Reduced reach in left shoulder.' },
    { id: 4, title: 'Hands Overhead', subtitle: 'Arm elevation', summary: 'Restricted right arm elevation (110°).' },
    { id: 5, title: 'Side Bends', subtitle: 'Lateral flexibility', summary: 'Asymmetric bending favoring right side.' },
    { id: 6, title: 'Partial Squat', subtitle: 'Knee/hip angles', summary: 'Good stability. Mild knee valgus.' },
    { id: 7, title: 'Return to Neutral', subtitle: 'Balance recovery', summary: 'Stable recovery.' }
];

const getStepRisk = (score: number) => {
    if (score >= 80) return 'low';
    if (score >= 50) return 'moderate';
    return 'high';
};

// Reusable Metric Bar Component
const MetricBar = ({ label, value, optimal, unit }: { label: string, value: number, optimal: number, unit: string }) => {
    // Simple risk calculation relative to optimal
    const diff = Math.abs(value - optimal);
    const percentDiff = diff / optimal;

    let riskColor = "bg-emerald-500";
    let textColor = "text-emerald-700";
    let bgColor = "bg-emerald-50";

    if (percentDiff > 0.3) {
        riskColor = "bg-red-500";
        textColor = "text-red-700";
        bgColor = "bg-red-50";
    } else if (percentDiff > 0.15) {
        riskColor = "bg-amber-500";
        textColor = "text-amber-700";
        bgColor = "bg-amber-50";
    }

    // Cap width at 100% for display
    const widthPercentage = Math.min(100, Math.max(0, (value / (optimal * 1.5)) * 100));

    return (
        <div className="mb-4">
            <div className="flex justify-between items-end mb-1">
                <span className="text-sm font-semibold text-slate-700">{label}</span>
                <span className="text-xs font-bold text-slate-900">{value}{unit}</span>
            </div>
            <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${riskColor}`}
                    style={{ width: `${widthPercentage}%` }}
                />
                {/* Optimal Marker */}
                <div
                    className="absolute top-0 h-full w-1 bg-slate-900 opacity-20 z-10 rounded-full"
                    style={{ left: `${(optimal / (optimal * 1.5)) * 100}%` }}
                    title={`Optimal: ${optimal}${unit}`}
                />
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-400">Target: {optimal}{unit}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${bgColor} ${textColor}`}>
                    {percentDiff > 0.3 ? 'Deviation' : percentDiff > 0.15 ? 'Monitoring' : 'Optimal'}
                </span>
            </div>
        </div>
    );
};

// Custom 3D Human Model with Biomechanical Mapping
const CustomModel = ({ landmarks, showAngles, showAxis }: { landmarks?: Landmark[] | null, showAngles?: boolean, showAxis?: boolean }) => {
    // Load the custom low-poly model from the public folder
    const { scene } = useGLTF('/human_model.glb');

    const initialLocalQuats = useRef<Record<string, THREE.Quaternion>>({});

    // In a real application, landmarks would be streamed via WebRTC or global state from VisionEngine
    // Here we implement the bone mapping logic to run on every 3D frame.
    useFrame(({ clock }) => {
        // One-time initialization of T-pose local quaternions
        if (Object.keys(initialLocalQuats.current).length === 0) {
            scene.traverse((obj) => {
                initialLocalQuats.current[obj.name] = obj.quaternion.clone();
            });
        }

        const getBone = (name: string) =>
            scene.getObjectByName(`mixamorig:${name}`) ||
            scene.getObjectByName(`mixamorig${name}`) ||
            scene.getObjectByName(name);

        const bonesToTrack = [
            { name: 'LeftUpLeg', child: 'LeftLeg', startIdx: 23, endIdx: 25 },
            { name: 'LeftLeg', child: 'LeftFoot', startIdx: 25, endIdx: 27 },
            { name: 'RightUpLeg', child: 'RightLeg', startIdx: 24, endIdx: 26 },
            { name: 'RightLeg', child: 'RightFoot', startIdx: 26, endIdx: 28 },
            { name: 'LeftArm', child: 'LeftForeArm', startIdx: 11, endIdx: 13 },
            { name: 'LeftForeArm', child: 'LeftHand', startIdx: 13, endIdx: 15 },
            { name: 'RightArm', child: 'RightForeArm', startIdx: 12, endIdx: 14 },
            { name: 'RightForeArm', child: 'RightHand', startIdx: 14, endIdx: 16 },
        ];

        // If we have live tracking data from the patient camera!
        if (landmarks && landmarks.length >= 33) {

            // Helper to convert MediaPipe coords to standard 3D scene space
            // Flips Y and Z to match Three.js coordinate system
            const getPoint = (i: number) => new THREE.Vector3(
                (landmarks[i].x - 0.5) * 2, // Fixed X inversion and applied scaling
                -(landmarks[i].y - 0.5) * 2,
                -landmarks[i].z * 2
            );

            // 1. Spine Mapping (Shoulders to Hips)
            const spine = getBone('Spine');
            const spineTop = getBone('Spine1') || getBone('Spine2') || getBone('Neck');
            if (spine && spineTop && initialLocalQuats.current[spine.name]) {
                const currentQuat = spine.quaternion.clone();
                spine.quaternion.copy(initialLocalQuats.current[spine.name]);
                spine.updateMatrixWorld(true);

                const p1 = new THREE.Vector3().setFromMatrixPosition(spine.matrixWorld);
                const p2 = new THREE.Vector3().setFromMatrixPosition(spineTop.matrixWorld);
                const dirCurrent = p2.sub(p1).normalize();

                const hipsMP = getPoint(23).add(getPoint(24)).multiplyScalar(0.5);
                const shouldersMP = getPoint(11).add(getPoint(12)).multiplyScalar(0.5);
                const targetVec = shouldersMP.sub(hipsMP);

                // Dampen the Z-axis for the spine to prevent excessive forward/backward leaning from 2D camera perspective
                targetVec.z *= 0.3;

                if (targetVec.lengthSq() > 0.0001) {
                    const dirTarget = targetVec.normalize();
                    const qDeltaWorld = new THREE.Quaternion().setFromUnitVectors(dirCurrent, dirTarget);
                    const parentQuat = new THREE.Quaternion();
                    if (spine.parent) spine.parent.getWorldQuaternion(parentQuat);
                    const qLocalDelta = parentQuat.clone().invert().multiply(qDeltaWorld).multiply(parentQuat);

                    spine.quaternion.premultiply(qLocalDelta);
                    const fullTargetLocal = spine.quaternion.clone();
                    spine.quaternion.copy(currentQuat).slerp(fullTargetLocal, 0.2);
                }
                spine.updateMatrixWorld(true);
            }

            // 2. Limbs Mapping
            bonesToTrack.forEach(cfg => {
                const b = getBone(cfg.name);
                const child = getBone(cfg.child);
                if (b && child && initialLocalQuats.current[b.name]) {
                    const currentQuat = b.quaternion.clone();
                    b.quaternion.copy(initialLocalQuats.current[b.name]);
                    b.updateMatrixWorld(true);

                    const p1 = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
                    const p2 = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
                    const dirCurrent = p2.sub(p1).normalize();

                    const mp1 = getPoint(cfg.startIdx);
                    const mp2 = getPoint(cfg.endIdx);
                    const targetVec = mp2.sub(mp1);

                    if (targetVec.lengthSq() > 0.0001) {
                        const dirTarget = targetVec.normalize();
                        const qDeltaWorld = new THREE.Quaternion().setFromUnitVectors(dirCurrent, dirTarget);

                        const parentQuat = new THREE.Quaternion();
                        if (b.parent) b.parent.getWorldQuaternion(parentQuat);
                        const qLocalDelta = parentQuat.clone().invert().multiply(qDeltaWorld).multiply(parentQuat);

                        b.quaternion.premultiply(qLocalDelta);
                        const fullTargetLocal = b.quaternion.clone();

                        b.quaternion.copy(currentQuat).slerp(fullTargetLocal, 0.2);
                    }
                    b.updateMatrixWorld(true);
                }
            });

        } else {
            // Idle animation if no patient tracking data is available yet
            const t = clock.getElapsedTime();
            const leftArm = getBone('LeftArm');
            if (leftArm && initialLocalQuats.current[leftArm.name]) {
                const currentQuat = leftArm.quaternion.clone();
                // Slerp from default initial resting pose
                const idleTarget = initialLocalQuats.current[leftArm.name].clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.sin(t) * 0.1)));
                leftArm.quaternion.copy(currentQuat).slerp(idleTarget, 0.05);
            }
        }
    });

    const [hipsPos, setHipsPos] = useState<THREE.Vector3>(new THREE.Vector3(0, 1, 0));

    useFrame(() => {
        if (showAxis && scene) {
            const hips = scene.getObjectByName('mixamorig:Hips') || scene.getObjectByName('mixamorigHips') || scene.getObjectByName('Hips');
            if (hips) {
                const pos = new THREE.Vector3();
                hips.getWorldPosition(pos);
                setHipsPos(pos);
            }
        }
    });

    // Scale and position might need adjustments depending on the model's export settings
    return (
        <group position={[0, -1, 0]}>
            <primitive object={scene} scale={[50, 50, 50]} position={[0, 0, 0]} />
            {showAxis && (
                <ThreeLine
                    points={[
                        [hipsPos.x, hipsPos.y - (-1), hipsPos.z], // Relative to the group which is at y=-1
                        [hipsPos.x, 0, hipsPos.z] // Floor level in local group coordinates
                    ]}
                    color="#ef4444"
                    lineWidth={3}
                    dashed={true}
                    dashSize={0.2}
                    gapSize={0.1}
                />
            )}
            {showAngles && (
                <Html position={[hipsPos.x, hipsPos.y + 1, hipsPos.z]} center>
                    <div className="bg-white/80 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-sky-700 whitespace-nowrap border border-sky-100 shadow-sm pointer-events-none">
                        Joint Diagnostics Active
                    </div>
                </Html>
            )}
        </group>
    );
};

// Preload the model
useGLTF.preload('/human_model.glb');


export default function DoctorDashboard() {
    const navigate = useNavigate();
    const { signOut } = useAuth();
    const [activeStep, setActiveStep] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [showAngles, setShowAngles] = useState(true);
    const [showAxis, setShowAxis] = useState(false);

    // Sidebar Navigation State
    const [activeTab, setActiveTab] = useState<'results' | 'directory' | 'reports' | 'settings' | 'inbox'>('results');

    // Toasts
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showReport, setShowReport] = useState(false);
    // Directory quick-view modal
    const [directoryPatient, setDirectoryPatient] = useState<typeof patients[0] | null>(null);
    // Settings toggles
    const [prefNotifications, setPrefNotifications] = useState(true);
    const [prefHighContrast, setPrefHighContrast] = useState(false);
    const [prefAutoSave, setPrefAutoSave] = useState(true);
    const [prefDataSharing, setPrefDataSharing] = useState(false);
    const [prefSoundAlerts, setPrefSoundAlerts] = useState(true);

    const { profile } = useAuth();
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const [pendingCalls, setPendingCalls] = useState<any[]>([]);

    // Listen for incoming Patient Telehealth calls
    useEffect(() => {
        if (!profile?.id || profile.role !== 'Doctor') return;

        const checkPendingCalls = async () => {
            const { data, error } = await supabase
                .from('telehealth_sessions')
                .select('*, patient:profiles!patient_id(full_name)')
                .eq('doctor_id', profile.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setPendingCalls(data);
                setIncomingCall(data[0] || null); // keep the latest for banner
            }
        };

        checkPendingCalls();

        const channel = supabase.channel(`doctor_incoming_${profile.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'telehealth_sessions', filter: `doctor_id=eq.${profile.id}` },
                (payload) => {
                    console.log("Incoming call update:", payload);
                    // Re-fetch the full list on any change
                    checkPendingCalls();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile]);

    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    }, []);

    const exportCsv = () => {
        // Mock CSV download behavior
        let csvContent = "data:text/csv;charset=utf-8,Date,Score\n";
        trendData.forEach(row => {
            csvContent += `${row.date},${row.score}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `patient_mobility_${displayPatient?.id.substring(0, 8) || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("CSV Exported Successfully");
    };

    // 3D Playback States
    const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
    const [framesData, setFramesData] = useState<Landmark[][]>([]);
    const [patientLandmarks, setPatientLandmarks] = useState<Landmark[] | null>(null);
    const [stepResults, setStepResults] = useState<Record<number, PostureResult>>({});

    // Fetch the latest assessment ID to get the frames
    const [latestAssessmentId, setLatestAssessmentId] = useState<string | null>(null);

    interface PatientSummary {
        id: string;
        name: string;
        age: number;
        latest_assessment: string | null;
        latest_score: number | null;
        latest_risk: string | null;
    }

    const [patients, setPatients] = useState<PatientSummary[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPatients = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select(`
                        id, 
                        full_name, 
                        age, 
                        assessments!patient_id (
                            id,
                            created_at,
                            overall_score,
                            risk_level,
                            status
                        )
                    `)
                    .eq('role', 'Patient');

                if (error) {
                    setFetchError(error.message);
                    throw error;
                }

                if (data) {
                    const fetched: PatientSummary[] = data.map(p => {
                        // Only consider completed assessments for the doctor to review
                        const completedAssessments = p.assessments?.filter((a: any) => a.status === 'completed') || [];
                        const sortedAssessments = completedAssessments.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                        const latest = sortedAssessments[0];
                        return {
                            id: p.id,
                            name: p.full_name || 'Unknown Patient',
                            age: p.age || 0,
                            latest_assessment_id: latest ? latest.id : null,
                            latest_assessment: latest ? new Date(latest.created_at).toISOString().split('T')[0] : null,
                            latest_score: latest ? Math.round(latest.overall_score) : null,
                            latest_risk: latest ? latest.risk_level : null
                        };
                    });

                    setPatients(fetched);
                    if (fetched.length > 0 && !selectedPatientId) {
                        setSelectedPatientId(fetched[0].id);
                    }
                }
            } catch (err: any) {
                console.error("Failed to load patients", err);
                if (!fetchError && err.message) {
                    setFetchError(err.message);
                }
            }
        };
        fetchPatients();
    }, []);

    const selectedPatient = patients.find(p => p.id === selectedPatientId);
    const displayPatient = selectedPatient || null;

    useEffect(() => {
        if (displayPatient && (displayPatient as any).latest_assessment_id !== latestAssessmentId) {
            setLatestAssessmentId((displayPatient as any).latest_assessment_id || null);
        }
    }, [displayPatient, latestAssessmentId]);

    const [trendData, setTrendData] = useState<{ date: string, score: number }[]>([]);

    useEffect(() => {
        if (!selectedPatientId) return;

        const fetchHistory = async () => {
            try {
                const { data, error } = await supabase
                    .from('assessments')
                    .select('created_at, overall_score')
                    .eq('patient_id', selectedPatientId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (data && data.length > 0) {
                    setTrendData(() => {
                        const history = data.map((h) => {
                            const date = new Date(h.created_at);
                            const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            return {
                                date: label,
                                score: Math.round(h.overall_score)
                            };
                        });

                        return history;
                    });
                }
            } catch (err) {
                console.error("Failed to load history from DB", err);
            }
        };
        fetchHistory();
    }, [selectedPatientId]);


    // Fetch all step metrics for the latest assessment
    useEffect(() => {
        if (!latestAssessmentId) {
            setStepResults({});
            return;
        }

        const fetchAllStepMetrics = async () => {
            try {
                const { data, error } = await supabase
                    .from('assessment_frames')
                    .select('step_id, frames_data')
                    .eq('assessment_id', latestAssessmentId);

                if (error) throw error;

                if (data) {
                    const results: Record<number, PostureResult> = {};
                    for (const row of data) {
                        const sId = row.step_id;
                        const rawFrames = row.frames_data as { timestampMs: number, landmarks: Landmark[] }[];
                        if (rawFrames.length > 0) {
                            try {
                                // Use the middle frame — most likely to represent
                                // the patient's settled, optimal pose for this step
                                const middleIdx = Math.floor(rawFrames.length / 2);
                                const postureResult: PostureResult = await invoke("calculate_posture", {
                                    landmarks: rawFrames[middleIdx].landmarks,
                                    stepId: sId
                                });
                                results[sId] = postureResult;
                            } catch (e) {
                                console.error(`Error calculating metrics for step ${sId}`, e);
                            }
                        }
                    }
                    setStepResults(results);
                }
            } catch (err) {
                console.error("Failed to load step metrics", err);
            }
        };

        fetchAllStepMetrics();
    }, [latestAssessmentId]);

    // Fetch frames when selectedPatientId, latestAssessmentId, or activeStep changes
    useEffect(() => {
        if (!latestAssessmentId) {
            setFramesData([]);
            setPatientLandmarks(null);
            setCurrentFrameIndex(0);
            setIsPlaying(false);
            return;
        }

        const fetchFramesForStep = async () => {
            try {
                // We use .limit(1) and .maybeSingle() if there's only one row per step
                const { data, error } = await supabase
                    .from('assessment_frames')
                    .select('frames_data')
                    .eq('assessment_id', latestAssessmentId)
                    .eq('step_id', activeStep)
                    .maybeSingle();

                if (error) {
                    console.error("Frame fetch error:", error);
                    return;
                }

                if (data && data.frames_data) {
                    // frames_data is stored as { timestampMs: number, landmarks: Landmark[] }[]
                    const rawFrames = data.frames_data as { timestampMs: number, landmarks: Landmark[] }[];
                    const parsedFrames = rawFrames.map(f => f.landmarks);
                    setFramesData(parsedFrames);
                    setCurrentFrameIndex(0);
                    if (parsedFrames.length > 0) {
                        setPatientLandmarks(parsedFrames[0]);
                    }
                } else {
                    setFramesData([]);
                    setPatientLandmarks(null);
                }
            } catch (e) {
                console.error("Error fetching frames", e);
            }
        };

        fetchFramesForStep();
    }, [latestAssessmentId, activeStep]);

    // Handle Playback Interval
    const playbackRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isPlaying && framesData.length > 0) {
            playbackRef.current = setInterval(() => {
                setCurrentFrameIndex(prev => {
                    const nextIndex = (prev + 1) % framesData.length;
                    setPatientLandmarks(framesData[nextIndex]);
                    return nextIndex;
                });
            }, 100); // 10fps playback approximation
        } else {
            if (playbackRef.current) clearInterval(playbackRef.current);
        }

        return () => {
            if (playbackRef.current) clearInterval(playbackRef.current);
        };
    }, [isPlaying, framesData]);

    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (framesData.length > 0) {
            setCurrentFrameIndex(val);
            setPatientLandmarks(framesData[val]);
            setIsPlaying(false);
        }
    };



    return (
        <div className="h-screen w-full bg-[#f8fafc] flex font-sans text-slate-900 overflow-hidden">

            {/* LEFT PANEL: Navigation & Patient Summary */}
            <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-screen flex-shrink-0 z-10 shadow-sm relative">
                <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
                    <div className="w-8 h-8 flex items-center justify-center overflow-hidden rounded-full shadow-sm">
                        <img src="/logo.png" alt="Mobivia Logo" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-800">Mobivia Clinical</span>
                </div>

                {/* Patient Summary Card */}
                <div className="m-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] p-5 shadow-sm hover:shadow-md hover:border-[#3b5bdb]/30 transition-all">
                    {displayPatient ? (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-lg border-2 border-white shadow-sm">
                                        {displayPatient.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 leading-tight">{displayPatient.name}</h3>
                                        <p className="text-xs text-slate-500">Age {displayPatient.age} • ID: {displayPatient.id.substring(0, 8)}</p>
                                    </div>
                                </div>

                                {/* Dropdown to select patient */}
                                <select
                                    className="bg-white border border-slate-200 text-xs rounded px-2 py-1 text-slate-700"
                                    value={selectedPatientId || ""}
                                    onChange={(e) => setSelectedPatientId(e.target.value)}
                                >
                                    {patients.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-white p-2 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Latest Score</span>
                                    {(() => {
                                        const sc = displayPatient.latest_score !== null ? Math.round(displayPatient.latest_score) : null;
                                        const cls = sc === null ? 'text-slate-400' : sc >= 75 ? 'text-emerald-600' : sc < 50 ? 'text-red-600' : 'text-amber-600';
                                        return <span className={`text-lg font-bold ${cls}`}>{sc !== null ? sc : '--'}/100</span>;
                                    })()}
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-slate-100">
                                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Risk Level</span>
                                    {(() => {
                                        const sc = displayPatient.latest_score !== null ? Math.round(displayPatient.latest_score) : null;
                                        const isLow = sc !== null && sc >= 75;
                                        const isHigh = sc !== null && sc < 50;
                                        const cls = isLow ? 'text-emerald-600' : isHigh ? 'text-red-600' : 'text-amber-600';
                                        const RiskIcon = isLow ? CheckCircle : AlertTriangle;
                                        return (
                                            <span className={`text-sm font-bold mt-1 flex items-center ${cls}`}>
                                                <RiskIcon size={14} className="mr-1" /> {displayPatient.latest_risk || 'N/A'}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="text-[10px] text-slate-400 flex justify-between items-center px-1">
                                <span>Assessed: {displayPatient.latest_assessment || 'Never'}</span>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <Users size={32} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-sm font-medium text-slate-500">No patients assigned</p>
                            {fetchError ? (
                                <p className="text-xs text-red-500 mt-2 p-2 bg-red-50 rounded border border-red-100 font-mono">Error: {fetchError}</p>
                            ) : (
                                <p className="text-xs text-slate-400 mt-1">Waiting for patients to register</p>
                            )}
                        </div>
                    )}
                </div>

                <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto pb-4">
                    <span className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Clinical Views</span>
                    <button
                        onClick={() => setActiveTab('results')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'results' ? 'bg-sky-50 text-sky-700 border border-sky-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                        <Activity size={18} />
                        <span className="text-sm">Assessment Results</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('directory')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'directory' ? 'bg-sky-50 text-sky-700 border border-sky-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                        <Users size={18} />
                        <span className="text-sm">Patient Directory</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'reports' ? 'bg-sky-50 text-sky-700 border border-sky-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                        <FileText size={18} />
                        <span className="text-sm">Mobility Reports</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('inbox')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'inbox' ? 'bg-sky-50 text-sky-700 border border-sky-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                        <Inbox size={18} />
                        <span className="text-sm">Telehealth Inbox</span>
                        {pendingCalls.length > 0 && (
                            <span className="ml-auto bg-sky-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                {pendingCalls.length}
                            </span>
                        )}
                    </button>

                    <span className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6 block">Actions</span>
                    <button
                        onClick={() => {
                            if (displayPatient?.id) {
                                navigate(`/doctor-telehealth/${displayPatient.id}`);
                            } else {
                                showToast("Please select a patient first to start a telehealth consultation.");
                            }
                        }}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${displayPatient ? 'text-slate-600 hover:bg-slate-50' : 'text-slate-400 opacity-60 cursor-not-allowed'}`}
                    >
                        <Video size={18} />
                        <span className="text-sm">Manual Telehealth</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'settings' ? 'bg-sky-50 text-sky-700 border border-sky-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                        <Settings size={18} />
                        <span className="text-sm">Settings</span>
                    </button>

                    <div className="mt-8 border-t border-slate-100 pt-4 px-3">
                        <button
                            onClick={async () => {
                                await signOut();
                                navigate('/login');
                            }}
                            className="w-full flex items-center space-x-3 py-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors px-3 group"
                        >
                            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                            <span className="text-sm">Log Out</span>
                        </button>
                    </div>
                </nav>
            </aside>

            {/* TAB CONTENT HANDLER */}
            {activeTab === 'directory' ? (
                <main className="flex-1 flex flex-col h-screen bg-slate-50 overflow-hidden relative">
                    {/* Incoming Call Toast Banner */}
                    {incomingCall && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
                            <div className="bg-sky-500 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center space-x-6 border border-sky-400">
                                <div className="flex items-center space-x-3">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                    </span>
                                    <div>
                                        <p className="font-bold text-sm">Incoming Telehealth Call</p>
                                        <p className="text-sky-100 text-xs mt-0.5">Patient Requesting Connection</p>
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => navigate(`/doctor-telehealth/${incomingCall.patient_id}`)}
                                        className="px-4 py-2 bg-white text-sky-600 font-bold rounded-xl shadow-sm text-sm hover:bg-sky-50 transition-colors"
                                    >
                                        Accept Call
                                    </button>
                                    <button
                                        onClick={async () => {
                                            await supabase.from('telehealth_sessions').update({ status: 'cancelled' }).eq('id', incomingCall.id);
                                            setIncomingCall(null);
                                        }}
                                        className="px-4 py-2 bg-sky-600 text-white font-medium rounded-xl hover:bg-sky-700 transition-colors text-sm"
                                    >
                                        Decline
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
                        <div>
                            <h1 className="text-lg font-bold text-slate-800">Patient Directory</h1>
                            <p className="text-xs text-slate-500">Select a patient to view their clinical analysis.</p>
                        </div>
                    </header>
                    <div className="p-8 max-w-5xl mx-auto w-full">
                        <div className="bg-white rounded-[1.25rem] shadow-sm hover:shadow-md transition-shadow border border-slate-200 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-bold uppercase tracking-wider">
                                        <th className="px-6 py-5">Patient Name</th>
                                        <th className="px-6 py-5">Age</th>
                                        <th className="px-6 py-5">Last Assessment</th>
                                        <th className="px-6 py-5">Latest Score</th>
                                        <th className="px-6 py-5">Risk Level</th>
                                        <th className="px-6 py-5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {patients.length > 0 ? patients.map(p => (
                                        <tr key={p.id} className={`border-b hover:bg-slate-50 transition-all group cursor-pointer ${incomingCall && incomingCall.patient_id === p.id ? 'bg-emerald-50/50 border-emerald-100' : 'border-slate-100'}`} onClick={() => { setSelectedPatientId(p.id); setActiveTab('results'); }}>
                                            <td className="px-6 py-5 font-semibold text-slate-800">
                                                <div className="flex items-center space-x-2">
                                                    <span>{p.name}</span>
                                                    {incomingCall && incomingCall.patient_id === p.id && (
                                                        <span className="flex h-2 w-2 relative">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="block text-[10px] text-slate-400 font-normal">ID: {p.id.substring(0, 8)}</span>
                                            </td>
                                            <td className="px-6 py-5 text-slate-600">{p.age}</td>
                                            <td className="px-6 py-5 text-slate-600">{p.latest_assessment || 'Never'}</td>
                                            <td className="px-6 py-5">
                                                {p.latest_score !== null ? (
                                                    <span className="font-bold text-sky-700">{Math.round(p.latest_score)}/100</span>
                                                ) : <span className="text-slate-400">--</span>}
                                            </td>
                                            <td className="px-6 py-5">
                                                {p.latest_risk ? (
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${p.latest_risk === 'high' ? 'bg-red-100 text-red-700' : p.latest_risk === 'moderate' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                        {p.latest_risk}
                                                    </span>
                                                ) : <span className="text-slate-400 text-xs">Pending</span>}
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                {incomingCall && incomingCall.patient_id === p.id ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/doctor-telehealth/${p.id}`);
                                                        }}
                                                        className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-md animate-pulse hover:bg-emerald-600 transition-colors"
                                                    >
                                                        Join Call
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDirectoryPatient(p);
                                                            setSelectedPatientId(p.id);
                                                        }}
                                                        className="text-sky-600 text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                                                    >View Results</button>
                                                )}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-500">No patients registered yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            ) : activeTab === 'inbox' ? (
                <main className="flex-1 flex flex-col h-screen bg-slate-50 overflow-y-auto">
                    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
                        <div>
                            <h1 className="text-lg font-bold text-slate-800 flex items-center">
                                <Inbox size={20} className="mr-2 text-sky-500" />
                                Telehealth Inbox
                            </h1>
                            <p className="text-xs text-slate-500">
                                {pendingCalls.length > 0 ? `${pendingCalls.length} patient${pendingCalls.length > 1 ? 's' : ''} waiting for a connection.` : 'No pending calls.'}
                            </p>
                        </div>
                    </header>
                    <div className="p-8 max-w-3xl mx-auto w-full">
                        {pendingCalls.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                                <Phone size={40} className="mx-auto text-slate-200 mb-4" />
                                <p className="text-slate-500 font-medium">No incoming calls right now</p>
                                <p className="text-xs text-slate-400 mt-1">When a patient sends their Telehealth ID, it will appear here.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {pendingCalls.map((call) => (
                                    <div key={call.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between hover:border-sky-200 transition-colors">
                                        <div className="flex items-center space-x-4">
                                            <div className="w-11 h-11 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-base flex-shrink-0">
                                                {(call.patient?.full_name || 'P').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800">{call.patient?.full_name || 'Unknown Patient'}</p>
                                                <div className="flex items-center space-x-2 mt-1">
                                                    <span className="text-xs text-slate-500">Telehealth ID:</span>
                                                    <code className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono border border-slate-200 select-all">
                                                        {call.patient_peer_id}
                                                    </code>
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(call.patient_peer_id)}
                                                        className="text-sky-500 text-xs font-bold hover:underline"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    Requested at {new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col space-y-2 flex-shrink-0">
                                            <button
                                                onClick={() => navigate(`/doctor-telehealth/${call.patient_id}`)}
                                                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
                                            >
                                                Accept Call
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    await supabase.from('telehealth_sessions').update({ status: 'cancelled' }).eq('id', call.id);
                                                }}
                                                className="px-4 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 text-sm font-medium rounded-xl transition-colors"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            ) : activeTab === 'reports' ? (
                <main className="flex-1 flex flex-col h-screen bg-slate-50 overflow-y-auto">
                    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
                        <div>
                            <h1 className="text-lg font-bold text-slate-800">Mobility Reports</h1>
                            <p className="text-xs text-slate-500">Historical assessment logs for {displayPatient?.name || 'the selected patient'}.</p>
                        </div>
                        <button onClick={exportCsv} className="flex items-center space-x-2 bg-slate-100 border border-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors shadow-sm">
                            <Download size={16} /> <span>Download All (CSV)</span>
                        </button>
                    </header>
                    <div className="p-8 max-w-4xl mx-auto w-full">
                        {displayPatient && trendData.length > 0 ? (
                            <div className="space-y-4">
                                {trendData.map((report, idx) => (
                                    <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                                        <div className="flex items-center space-x-4">
                                            <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-800">Comprehensive Mobility Assessment</h3>
                                                <p className="text-xs text-slate-500">Conducted on {report.date}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-6">
                                            <div className="text-center">
                                                <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Score</span>
                                                <span className={`text-lg font-bold ${report.score >= 80 ? 'text-emerald-600' : report.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{report.score}</span>
                                            </div>
                                            <button
                                                onClick={() => showToast("Preparing PDF Report generation...")}
                                                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                                Generate PDF
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-800">No Reports Available</h3>
                                <p className="text-slate-500 mt-1">Select a patient with completed assessments to view their reports.</p>
                            </div>
                        )}
                    </div>
                </main>
            ) : activeTab === 'settings' ? (
                <main className="flex-1 flex flex-col h-screen bg-slate-50 overflow-y-auto">
                    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
                        <div>
                            <h1 className="text-lg font-bold text-slate-800">Settings</h1>
                            <p className="text-xs text-slate-500">Manage your clinical preferences and account.</p>
                        </div>
                        <button onClick={() => showToast('Settings saved!')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm transition-all hover:scale-105 active:scale-95">
                            <CheckCircle size={15} /> Save Changes
                        </button>
                    </header>

                    <div className="p-8 max-w-3xl mx-auto w-full space-y-6">

                        {/* Account Settings */}
                        <AccountSettings />

                        {/* Clinic Profile */}
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white">
                                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                                    <Info size={18} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-800">Clinic Profile</h2>
                                    <p className="text-[10px] text-slate-400">Your clinic's registered identity</p>
                                </div>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Clinic Name</label>
                                    <div className="relative">
                                        <input type="text" defaultValue="Mobivia Advanced Orthopedics" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-white outline-none" disabled />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs font-bold">🔒</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Practitioner ID</label>
                                    <div className="relative">
                                        <input type="text" defaultValue="PRAC-88392-A" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-white font-mono outline-none" disabled />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs font-bold">🔒</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">🔒 These fields are managed by your Mobivia system administrator.</p>
                            </div>
                        </section>

                        {/* Preferences */}
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
                                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
                                    <Settings size={18} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-800">Preferences</h2>
                                    <p className="text-[10px] text-slate-400">Customise your clinical workflow</p>
                                </div>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {([
                                    { label: 'Push Notifications', sub: 'Get alerts when patients complete remote assessments', on: prefNotifications, set: setPrefNotifications, color: 'emerald', emoji: '🔔' },
                                    { label: 'High Contrast Mode', sub: 'Improve visibility of 3D skeletal overlays', on: prefHighContrast, set: setPrefHighContrast, color: 'violet', emoji: '🎨' },
                                    { label: 'Auto-Save Reports', sub: 'Automatically save generated reports to session history', on: prefAutoSave, set: setPrefAutoSave, color: 'sky', emoji: '💾' },
                                    { label: 'Anonymous Data Sharing', sub: 'Share anonymised biomechanical data for research', on: prefDataSharing, set: setPrefDataSharing, color: 'rose', emoji: '🔬' },
                                    { label: 'Sound Alerts', sub: 'Play audio cues for critical assessment events', on: prefSoundAlerts, set: setPrefSoundAlerts, color: 'amber', emoji: '🔊' },
                                ] as { label: string; sub: string; on: boolean; set: (v: boolean) => void; color: string; emoji: string }[]).map(({ label, sub, on, set, color, emoji }) => {
                                    const trackOn = color === 'emerald' ? 'bg-emerald-500' : color === 'violet' ? 'bg-violet-500' : color === 'sky' ? 'bg-sky-500' : color === 'rose' ? 'bg-rose-500' : 'bg-amber-500';
                                    const textOn = color === 'emerald' ? 'text-emerald-700' : color === 'violet' ? 'text-violet-700' : color === 'sky' ? 'text-sky-700' : color === 'rose' ? 'text-rose-700' : 'text-amber-700';
                                    const bgOn = color === 'emerald' ? 'bg-emerald-50' : color === 'violet' ? 'bg-violet-50' : color === 'sky' ? 'bg-sky-50' : color === 'rose' ? 'bg-rose-50' : 'bg-amber-50';
                                    return (
                                        <div key={label} className={`flex items-center justify-between px-6 py-4 transition-colors ${on ? bgOn : 'hover:bg-slate-50/60'}`}>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{emoji}</span>
                                                <div>
                                                    <p className={`text-sm font-bold ${on ? textOn : 'text-slate-700'}`}>{label}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                                                </div>
                                            </div>
                                            {/* Custom pill toggle */}
                                            <button
                                                onClick={() => set(!on)}
                                                className={`relative flex-shrink-0 w-14 h-7 rounded-full transition-all duration-300 shadow-inner focus:outline-none focus:ring-2 focus:ring-offset-2 ${on ? `${trackOn} focus:ring-${color}-400` : 'bg-slate-200 focus:ring-slate-300'}`}
                                                role="switch"
                                                aria-checked={on}
                                            >
                                                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${on ? 'left-8' : 'left-1'}`} />
                                                <span className={`absolute inset-0 flex items-center text-[9px] font-black tracking-wider transition-opacity ${on ? 'opacity-100 pl-2 text-white' : 'opacity-0'}`}>ON</span>
                                                <span className={`absolute inset-0 flex items-center justify-end text-[9px] font-black tracking-wider transition-opacity ${!on ? 'opacity-100 pr-2 text-slate-400' : 'opacity-0'}`}>OFF</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Danger Zone */}
                        <section className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-6 py-4 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-white">
                                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-rose-800">Danger Zone</h2>
                                    <p className="text-[10px] text-rose-400">Irreversible account actions</p>
                                </div>
                            </div>
                            <div className="p-6 flex flex-col gap-3">
                                <div className="flex items-center justify-between p-4 rounded-xl border border-rose-100 bg-rose-50/50">
                                    <div>
                                        <p className="text-sm font-bold text-rose-800">Purge Assessment Data</p>
                                        <p className="text-xs text-rose-400 mt-0.5">Permanently delete all recorded assessment frames</p>
                                    </div>
                                    <button onClick={() => showToast('Action requires admin confirmation.')} className="px-4 py-2 bg-white border border-rose-300 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all shadow-sm active:scale-95">
                                        Purge Data
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">Sign Out of All Devices</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Revoke all active sessions for this account</p>
                                    </div>
                                    <button onClick={() => showToast('Signing out of all devices...')} className="px-4 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all shadow-sm active:scale-95">
                                        Sign Out All
                                    </button>
                                </div>
                            </div>
                        </section>

                    </div>
                </main>
            ) : (
                <main className="flex-1 flex flex-col h-screen min-w-[600px]">

                    {/* Header Ribbon */}
                    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
                        <div>
                            <h1 className="text-lg font-bold text-slate-800">Posture & Movement Analysis</h1>
                            <p className="text-xs text-slate-500">Reconstructing captured 2D landmarks into 3D spatial coordinates.</p>
                        </div>

                        <div className="flex items-center space-x-2">
                            <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                                Coordinates Synced
                            </span>
                        </div>
                    </header>

                    {/* 3D Canvas Area */}
                    <div className="flex-1 relative bg-slate-100 overflow-hidden border-b border-slate-200 flex flex-col shadow-inner">

                        {/* Main Split View */}
                        <div className="flex-1 flex flex-row w-full h-full relative">



                            {/* Canvas Viewport (Right Side or Full) */}
                            <div className="flex-1 relative cursor-grab active:cursor-grabbing w-full h-full">
                                <ThreeErrorBoundary>
                                    <Suspense fallback={
                                        <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                            <div className="w-8 h-8 border-4 border-t-sky-400 border-slate-200 rounded-full animate-spin" />
                                        </div>
                                    }>
                                        <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
                                            <color attach="background" args={['#f1f5f9']} />

                                            {/* 3-point lighting rig — replaces Environment HDR */}
                                            <ambientLight intensity={0.8} />
                                            <hemisphereLight args={['#dbeafe', '#94a3b8', 0.6]} />
                                            {/* Key light (front-top-right) */}
                                            <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow />
                                            {/* Fill light (front-left) */}
                                            <directionalLight position={[-4, 4, 3]} intensity={0.6} />
                                            {/* Rim/back light */}
                                            <directionalLight position={[0, 4, -6]} intensity={0.4} />

                                            {showSkeleton && <CustomModel landmarks={patientLandmarks} showAngles={showAngles} showAxis={showAxis} />}

                                            {/* Grid Floor */}
                                            <Grid infiniteGrid fadeDistance={20} sectionColor="#cbd5e1" cellColor="#e2e8f0" position={[0, -1, 0]} />
                                            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2 + 0.1} />
                                        </Canvas>
                                    </Suspense>
                                </ThreeErrorBoundary>

                                {/* Overlay HUD Controls */}
                                <div className="absolute top-4 right-4 flex flex-col gap-2">
                                    <button onClick={() => setShowSkeleton(!showSkeleton)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border backdrop-blur-md transition-all ${showSkeleton ? 'bg-sky-600/90 text-white border-sky-500 shadow-md' : 'bg-white/80 text-slate-600 border-slate-300'}`}>
                                        Skeleton
                                    </button>
                                    <button onClick={() => setShowAngles(!showAngles)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border backdrop-blur-md transition-all ${showAngles ? 'bg-sky-600/90 text-white border-sky-500 shadow-md' : 'bg-white/80 text-slate-600 border-slate-300'}`}>
                                        Joint Angles
                                    </button>
                                    <button onClick={() => setShowAxis(!showAxis)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border backdrop-blur-md transition-all ${showAxis ? 'bg-sky-600/90 text-white border-sky-500 shadow-md' : 'bg-white/80 text-slate-600 border-slate-300'}`}>
                                        Balance Axis
                                    </button>
                                </div>

                                {/* Current Step Overlay Tag */}
                                <div className="absolute top-4 left-4 pointer-events-none">
                                    <div className="bg-white/90 backdrop-blur-sm border border-slate-200 shadow-sm rounded-xl py-2 px-4 inline-block">
                                        <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest block mb-0.5">Capturing Step {activeStep}</span>
                                        <span className="text-lg font-bold text-slate-800">{ASSESSMENT_STEPS_META[activeStep - 1].title}</span>
                                    </div>
                                </div>


                            </div>
                        </div> {/* Close Main Split View */}

                        {/* Replay Controls Panel */}
                        <div className="h-16 bg-white border-t border-slate-200 px-6 flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10">
                            <div className="flex items-center space-x-3">
                                <button
                                    className={`flex items-center gap-2 px-4 h-9 rounded-full text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${isPlaying
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                        : 'bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800'
                                        }`}
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    disabled={framesData.length === 0}
                                >
                                    {isPlaying ? <><Pause size={15} /><span>Pause</span></> : <><Play size={15} className="translate-x-0.5" /><span>Play</span></>}
                                </button>
                            </div>

                            <div className="flex-1 mx-8 relative flex items-center group">
                                <input
                                    type="range"
                                    min={0}
                                    max={Math.max(0, framesData.length - 1)}
                                    value={currentFrameIndex}
                                    onChange={handleScrub}
                                    disabled={framesData.length === 0}
                                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer outline-none focus:ring-2 focus:ring-sky-500 hover:bg-slate-200 accent-sky-500"
                                />
                            </div>

                            <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-md min-w-[80px] text-center">
                                {framesData.length > 0 ? `${currentFrameIndex + 1} / ${framesData.length}` : '0 / 0'}
                            </div>
                        </div>

                    </div>

                    {/* Horizontal Timeline Ribbon */}
                    <div className="h-48 bg-white px-2 py-4 overflow-x-auto flex items-center space-x-3 hide-scrollbar border-t border-slate-200 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                        {ASSESSMENT_STEPS_META.map((step) => {
                            const isActive = step.id === activeStep;

                            // Use calculated results if available
                            const result = stepResults[step.id];
                            const score = result ? Math.round(result.score) : 0;
                            const hasData = !!result;
                            const risk = hasData ? getStepRisk(score) : 'none';

                            // Map risk to icons/colors
                            let Icon = CheckCircle;
                            let iconColor = "text-emerald-500";
                            let riskBg = "bg-emerald-50";

                            if (!hasData) {
                                Icon = Info;
                                iconColor = "text-slate-400";
                                riskBg = "bg-slate-100";
                            } else if (risk === 'high') {
                                Icon = XCircle;
                                iconColor = "text-red-500";
                                riskBg = "bg-red-50";
                            } else if (risk === 'moderate') {
                                Icon = AlertTriangle;
                                iconColor = "text-amber-500";
                                riskBg = "bg-amber-50";
                            }

                            return (
                                <div
                                    key={step.id}
                                    onClick={() => setActiveStep(step.id)}
                                    className={`flex-shrink-0 w-64 h-full rounded-xl border p-4 cursor-pointer transition-all flex flex-col relative overflow-hidden group ${isActive ? 'bg-sky-50 border-sky-200 shadow-md ring-1 ring-sky-200' : 'bg-white border-slate-200 hover:border-sky-200 hover:shadow-sm'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-500 transition-colors'}`}>Step {step.id}</span>
                                        {hasData && (
                                            <div className={`p-1 rounded-md ${riskBg}`}>
                                                <Icon size={14} className={iconColor} />
                                            </div>
                                        )}
                                    </div>

                                    <h4 className={`text-sm font-bold leading-tight ${isActive ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900 transition-colors'}`}>{step.title}</h4>
                                    <p className="text-[10px] text-slate-500 mb-2 truncate">{step.subtitle}</p>

                                    <div className="mt-auto">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-slate-400 font-medium">Step Score</span>
                                            <span className={`text-xs font-bold ${isActive ? 'text-sky-700' : 'text-slate-600'}`}>
                                                {hasData ? `${score}/100` : '--'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] leading-snug text-slate-600 border-t border-slate-100 pt-2 mt-1">
                                            {step.summary}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </main>
            )}

            {/* RIGHT PANEL: Analytics & Tooling */}
            <aside className="w-[380px] bg-white border-l border-slate-200 h-screen overflow-y-auto flex-shrink-0 flex flex-col">
                <div className="p-6 pb-2 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                    <h2 className="text-xl font-bold text-slate-800 mb-1">Clinical Analytics</h2>
                    <p className="text-xs text-slate-500 mb-4">Derived from 3D joint reconstruction</p>

                    {/* Action Buttons Row */}
                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={() => setShowReport(true)}
                            disabled={!displayPatient}
                            className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 active:scale-95 shadow-sm flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                            <FileText size={14} className="mr-1.5 text-slate-400" /> Report
                        </button>
                        <button
                            onClick={exportCsv}
                            className="flex-1 bg-slate-100 text-slate-800 border border-slate-200 py-2 rounded-xl text-xs font-semibold hover:bg-slate-200 active:scale-95 shadow-sm flex items-center justify-center transition-all">
                            <Download size={14} className="mr-1.5 opacity-80" /> Export CSV
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-8 pb-10">

                    {/* Risk Indicator Card */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Overall Mobility Risk</h3>
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 relative overflow-hidden">
                            {displayPatient ? (() => {
                                const score = displayPatient.latest_score !== null ? Math.round(displayPatient.latest_score) : null;
                                const isGreen = score !== null && score >= 75;
                                const isRed = score !== null && score < 50;
                                // Full static class strings — required for Tailwind to include them in the bundle
                                const scoreTextClass = isGreen ? 'text-emerald-600' : isRed ? 'text-red-600' : 'text-amber-600';
                                const labelTextClass = isGreen ? 'text-emerald-800' : isRed ? 'text-red-800' : 'text-amber-800';
                                const blobClass = isGreen ? 'bg-emerald-200' : isRed ? 'bg-red-200' : 'bg-amber-200';
                                const badgeClass = isGreen
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : isRed
                                        ? 'bg-red-100 text-red-800 border-red-200'
                                        : 'bg-amber-100 text-amber-800 border-amber-200';
                                const descClass = isGreen
                                    ? 'text-emerald-800 border-emerald-100/50'
                                    : isRed
                                        ? 'text-red-800 border-red-100/50'
                                        : 'text-amber-800 border-amber-100/50';
                                return (
                                    <>
                                        <div className={`absolute right-0 top-0 w-24 h-24 ${blobClass} rounded-full blur-2xl opacity-40 -translate-y-4 translate-x-4`}></div>

                                        <div className="flex justify-between items-start relative z-10">
                                            <div>
                                                <span className={`text-4xl font-black ${scoreTextClass} tracking-tighter shadow-sm`}>
                                                    {score !== null ? score : '--'}
                                                </span>
                                                <span className={`text-sm font-bold ${labelTextClass} ml-1`}>/100</span>
                                            </div>
                                            <span className={`px-3 py-1 text-xs font-bold rounded-lg border shadow-sm ${badgeClass}`}>
                                                {displayPatient.latest_risk || 'Pending'}
                                            </span>
                                        </div>

                                        <p className={`text-xs mt-4 font-medium leading-relaxed relative z-10 bg-white/50 p-3 rounded-lg border ${descClass}`}>
                                            {score !== null
                                                ? "Mobility summary available. Please review detailed biomechanical metrics for specific joint restrictions."
                                                : "Awaiting patient assessment completion to generate a mobility risk profile."}
                                        </p>
                                    </>
                                );
                            })() : (
                                <div className="text-center py-6">
                                    <p className="text-sm font-medium text-slate-500">No Patient Selected</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Granular Biomechanics */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                            Biomechanical Metrics
                            <span className="ml-2 font-normal text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 normal-case">Step {activeStep}</span>
                        </h3>

                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-2">
                            {stepResults[activeStep] ? (
                                stepResults[activeStep].metrics.map((m, idx) => (
                                    <MetricBar
                                        key={idx}
                                        label={m.label}
                                        value={Number(m.value.toFixed(1))}
                                        optimal={m.passed ? m.value : m.value + (m.value * 0.4)} // Heuristic to show optimal value target
                                        unit={m.unit}
                                    />
                                ))
                            ) : (
                                <p className="text-xs text-slate-400 font-medium text-center py-4">No metrics available for this step.</p>
                            )}
                        </div>
                    </div>

                    {/* Trend Graph */}
                    <div>
                        <div className="flex justify-between items-end mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Historical Trend</h3>
                            <span className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded flex items-center border border-red-100">
                                -9% vs last month
                            </span>
                        </div>

                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm h-48 w-full flex items-center justify-center">
                            {trendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(value) => value.split(',')[0]}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                            itemStyle={{ color: '#0369a1' }}
                                        />
                                        <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                                        <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
                                        <RechartsLine
                                            type="monotone"
                                            dataKey="score"
                                            stroke="#0ea5e9"
                                            strokeWidth={3}
                                            dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: '#0ea5e9' }}
                                            activeDot={{ r: 6, fill: '#0ea5e9', strokeWidth: 2, stroke: '#fff' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-xs text-slate-400 font-medium">Not enough historical data.</p>
                            )}
                        </div>
                    </div>

                </div>
            </aside>

            {/* Global Toasts */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 shadow-2xl rounded-xl px-5 py-3 flex items-center space-x-3 justify-center text-white z-50 animate-in fade-in slide-in-from-bottom-5">
                    <CheckCircle size={18} className="text-emerald-400" />
                    <span className="text-sm font-bold">{toastMessage}</span>
                </div>
            )}

            {/* Directory Quick-View Modal */}
            {directoryPatient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDirectoryPatient(null)}>
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 font-black text-lg flex-shrink-0">
                                    {directoryPatient.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-800 text-lg leading-none">{directoryPatient.name}</h2>
                                    <p className="text-xs text-slate-400 mt-0.5">Age {directoryPatient.age || '—'} &nbsp;·&nbsp; Assessed: {directoryPatient.latest_assessment || 'Never'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDirectoryPatient(null)}
                                className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white shadow-md hover:shadow-lg transition-all hover:scale-110 active:scale-95 flex-shrink-0"
                                title="Close"
                            >
                                <span className="text-lg font-black leading-none select-none">✕</span>
                            </button>
                        </div>

                        <div className="px-7 py-5 space-y-5">
                            {/* Overall score banner */}
                            {(() => {
                                const sc = directoryPatient.latest_score !== null ? Math.round(directoryPatient.latest_score) : null;
                                const isGreen = sc !== null && sc >= 75;
                                const isRed = sc !== null && sc < 50;
                                const scoreClass = isGreen ? 'text-emerald-600' : isRed ? 'text-red-600' : 'text-amber-600';
                                const bgClass = isGreen ? 'bg-emerald-50 border-emerald-100' : isRed ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100';
                                const badgeClass = isGreen ? 'bg-emerald-100 text-emerald-800' : isRed ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
                                const barClass = isGreen ? 'bg-emerald-500' : isRed ? 'bg-red-400' : 'bg-amber-400';
                                return (
                                    <div className={`flex items-center gap-5 p-4 rounded-2xl border ${bgClass}`}>
                                        <span className={`text-5xl font-black ${scoreClass}`}>{sc ?? '--'}</span>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-xs font-semibold text-slate-500">Overall Score</span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${badgeClass}`}>{directoryPatient.latest_risk || 'Pending'} Risk</span>
                                            </div>
                                            <div className="h-2.5 bg-white rounded-full overflow-hidden shadow-inner">
                                                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${sc ?? 0}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Step breakdown — use stepResults if this is the currently selected patient, otherwise just show a prompt */}
                            {Object.keys(stepResults).length > 0 && selectedPatientId === directoryPatient.id ? (
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3">Assessment Steps</p>
                                    <div className="space-y-2">
                                        {ASSESSMENT_STEPS_META.map(step => {
                                            const result = stepResults[step.id];
                                            const stepScore = result ? Math.round(result.score) : null;
                                            const isGreen = stepScore !== null && stepScore >= 75;
                                            const isRed = stepScore !== null && stepScore < 50;
                                            const scoreClass = isGreen ? 'text-emerald-600' : isRed ? 'text-red-600' : 'text-amber-600';
                                            const barClass = isGreen ? 'bg-emerald-500' : isRed ? 'bg-red-400' : 'bg-amber-400';
                                            return (
                                                <div key={step.id} className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black text-slate-400 w-4 text-right flex-shrink-0">{step.id}</span>
                                                    <span className="text-xs font-semibold text-slate-700 w-32 flex-shrink-0 truncate">{step.title}</span>
                                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${stepScore ?? 0}%` }} />
                                                    </div>
                                                    <span className={`text-xs font-black w-8 text-right flex-shrink-0 ${result ? scoreClass : 'text-slate-300'}`}>
                                                        {stepScore !== null ? stepScore : '—'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : Object.keys(stepResults).length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-3">No step data available for this assessment yet.</p>
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-3">Loading step breakdown...</p>
                            )}
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-between px-7 py-4 border-t border-slate-100 bg-slate-50/60">
                            <button
                                onClick={() => setDirectoryPatient(null)}
                                className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                            >Close</button>
                            <button
                                onClick={() => { setDirectoryPatient(null); setShowReport(true); }}
                                className="flex items-center gap-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800 px-5 py-2 rounded-xl text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                            >
                                <FileText size={14} /> Full Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clinical Report Modal */}
            {showReport && displayPatient && (
                <>
                    <style>{`
                        @media print {
                            body > * { display: none !important; }
                            #clinical-report-print { display: block !important; position: fixed; inset: 0; z-index: 9999; background: white; }
                        }
                    `}</style>

                    {/* Backdrop */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowReport(false)}>
                        {/* Report Paper */}
                        <div
                            id="clinical-report-print"
                            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Print Header stripe */}
                            <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white px-8 py-6 rounded-t-2xl flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-1">Mobivia Clinical</p>
                                    <h1 className="text-2xl font-black">Mobility Assessment Report</h1>
                                    <p className="text-slate-300 text-sm mt-1">Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <button
                                        onClick={() => setShowReport(false)}
                                        className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white shadow-md hover:shadow-lg transition-all hover:scale-110 active:scale-95"
                                        title="Close report"
                                    >
                                        <span className="text-lg font-black leading-none select-none">✕</span>
                                    </button>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400">Assessment ID</p>
                                        <p className="text-xs font-mono text-slate-200 mt-0.5">{latestAssessmentId?.substring(0, 16) || 'N/A'}...</p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-8 py-6 space-y-6">
                                {/* Patient Info */}
                                <section className="flex gap-8 pb-5 border-b border-slate-200">
                                    <div className="flex-1">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Patient Name</p>
                                        <p className="text-xl font-bold text-slate-800">{displayPatient.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Age</p>
                                        <p className="text-xl font-bold text-slate-800">{displayPatient.age || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Assessment Date</p>
                                        <p className="text-xl font-bold text-slate-800">{displayPatient.latest_assessment || '—'}</p>
                                    </div>
                                </section>

                                {/* Overall Score */}
                                <section className="pb-5 border-b border-slate-200">
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-3">Overall Mobility Score</p>
                                    <div className="flex items-center gap-6">
                                        {(() => {
                                            const sc = displayPatient.latest_score !== null ? Math.round(displayPatient.latest_score) : null;
                                            const isGreen = sc !== null && sc >= 75;
                                            const isRed = sc !== null && sc < 50;
                                            const scoreClass = isGreen ? 'text-emerald-600' : isRed ? 'text-red-600' : 'text-amber-600';
                                            const badgeClass = isGreen ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isRed ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200';
                                            return (
                                                <>
                                                    <span className={`text-6xl font-black ${scoreClass}`}>{sc ?? '--'}</span>
                                                    <div>
                                                        <p className="text-sm text-slate-500 font-medium">out of 100</p>
                                                        <span className={`mt-2 inline-block px-3 py-1 rounded-lg border text-sm font-bold ${badgeClass}`}>
                                                            {displayPatient.latest_risk || 'Pending'} Risk
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 ml-4">
                                                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${isGreen ? 'bg-emerald-500' : isRed ? 'bg-red-500' : 'bg-amber-500'}`}
                                                                style={{ width: `${sc ?? 0}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-xs text-slate-400 mt-1 text-right">{sc ?? 0}/100</p>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </section>

                                {/* Step Breakdown */}
                                {Object.keys(stepResults).length > 0 && (
                                    <section className="pb-5 border-b border-slate-200">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-4">Step-by-Step Breakdown</p>
                                        <div className="space-y-3">
                                            {ASSESSMENT_STEPS_META.map(step => {
                                                const result = stepResults[step.id];
                                                const stepScore = result ? Math.round(result.score) : null;
                                                const isGreen = stepScore !== null && stepScore >= 75;
                                                const isRed = stepScore !== null && stepScore < 50;
                                                const scoreClass = isGreen ? 'text-emerald-600' : isRed ? 'text-red-600' : 'text-amber-600';
                                                const barClass = isGreen ? 'bg-emerald-500' : isRed ? 'bg-red-400' : 'bg-amber-400';
                                                return (
                                                    <div key={step.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 flex-shrink-0">{step.id}</div>
                                                        <div className="flex-1">
                                                            <p className="text-sm font-bold text-slate-800">{step.title}</p>
                                                            <p className="text-[10px] text-slate-400">{step.subtitle}</p>
                                                        </div>
                                                        <div className="w-28 flex-shrink-0">
                                                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${stepScore ?? 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <span className={`text-sm font-black w-12 text-right flex-shrink-0 ${result ? scoreClass : 'text-slate-300'}`}>
                                                            {stepScore !== null ? `${stepScore}` : '—'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Historical Trend Summary */}
                                {trendData.length > 1 && (
                                    <section className="pb-5 border-b border-slate-200">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-3">Historical Trend ({trendData.length} Assessments)</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {trendData.map((d, i) => (
                                                <div key={i} className="text-center bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                                    <p className="text-[10px] text-slate-400">{d.date}</p>
                                                    <p className={`text-sm font-bold ${d.score >= 75 ? 'text-emerald-600' : d.score < 50 ? 'text-red-600' : 'text-amber-600'}`}>{d.score}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Clinical Notes placeholder */}
                                <section>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-2">Clinical Notes</p>
                                    <div className="border border-dashed border-slate-300 rounded-xl p-4 min-h-[80px] text-xs text-slate-400 italic">
                                        Doctor's notes and recommendations can be added here before printing.
                                    </div>
                                </section>

                                <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-4 flex justify-between">
                                    <span>Mobivia Clinical System — Confidential Patient Record</span>
                                    <span>AI-assisted, clinician verified</span>
                                </div>
                            </div>

                            {/* Sticky Bottom Actions */}
                            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-8 py-4 flex items-center justify-between rounded-b-2xl">
                                <button
                                    onClick={() => setShowReport(false)}
                                    className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-rose-200 transition-all active:scale-95"
                                >
                                    <span className="text-base font-black leading-none">✕</span> Close
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="flex items-center gap-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800 px-6 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95"
                                >
                                    <FileText size={16} /> Print Report
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
