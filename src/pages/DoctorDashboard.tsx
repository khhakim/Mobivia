import { useState, useRef, useEffect } from 'react';
import {
    Users, Activity, FileText, Settings, Video, Download, CheckCircle, AlertTriangle, XCircle, Play, Pause, FastForward, Rewind, LogOut, Phone, PhoneOff
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Peer, { MediaConnection } from "peerjs";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Landmark } from "../components/VisionEngine";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Mock Patient Data
const PATIENT = {
    name: "Margaret T.",
    age: 72,
    lastAssessment: "March 7, 2026",
    score: 68,
    risk: "Moderate"
};

const TREND_DATA = [
    { date: 'Jan 10', score: 75 },
    { date: 'Jan 24', score: 72 },
    { date: 'Feb 05', score: 65 },
    { date: 'Feb 19', score: 60 },
    { date: 'Mar 07', score: 68 }, // Current
];

const ASSESSMENT_STEPS = [
    { id: 1, title: 'Standing Naturally', subtitle: 'Baseline posture', score: 85, risk: 'low', summary: 'Good spinal alignment. Mild forward head.' },
    { id: 2, title: 'Sitting Upright', subtitle: 'Spine verticality', score: 70, risk: 'moderate', summary: '15° forward spinal tilt detected.' },
    { id: 3, title: 'Forward Reach', subtitle: 'Shoulder symmetry', score: 62, risk: 'moderate', summary: 'Reduced reach in left shoulder.' },
    { id: 4, title: 'Hands Overhead', subtitle: 'Arm elevation', score: 45, risk: 'high', summary: 'Restricted right arm elevation (110°).' },
    { id: 5, title: 'Side Bends', subtitle: 'Lateral flexibility', score: 55, risk: 'high', summary: 'Asymmetric bending favoring right side.' },
    { id: 6, title: 'Partial Squat', subtitle: 'Knee/hip angles', score: 78, risk: 'low', summary: 'Good stability. Mild knee valgus.' },
    { id: 7, title: 'Return to Neutral', subtitle: 'Balance recovery', score: 80, risk: 'low', summary: 'Stable recovery.' }
];

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
const CustomModel = ({ landmarks }: { landmarks?: Landmark[] | null }) => {
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

    // Scale and position might need adjustments depending on the model's export settings
    return (
        <group position={[0, -1, 0]}>
            <primitive object={scene} scale={[50, 50, 50]} position={[0, 0, 0]} />
        </group>
    );
};

// Preload the model
useGLTF.preload('/human_model.glb');


export default function DoctorDashboard() {
    const [activeStep, setActiveStep] = useState(2); // Start with 'Sitting Upright' to show data
    const [isPlaying, setIsPlaying] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [showAngles, setShowAngles] = useState(true);
    const [showAxis, setShowAxis] = useState(false);

    // Telehealth State
    const [isTelehealthModalOpen, setIsTelehealthModalOpen] = useState(false);
    const [patientTelehealthId, setPatientTelehealthId] = useState('');
    const [telehealthStatus, setTelehealthStatus] = useState<'idle' | 'calling' | 'connected' | 'error'>('idle');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerInstance = useRef<Peer | null>(null);
    const currentCall = useRef<MediaConnection | null>(null);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [patientLandmarks, setPatientLandmarks] = useState<Landmark[] | null>(null);

    // Initialize Telehealth Peer and MediaPipe only when modal opens
    useEffect(() => {
        let poseLandmarker: PoseLandmarker | null = null;
        let animationFrameId: number;

        if (isTelehealthModalOpen) {
            // 1. Setup Peer
            if (!peerInstance.current) {
                const peer = new Peer();
                peerInstance.current = peer;

                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                    .then((stream) => setLocalStream(stream))
                    .catch((err) => {
                        console.error("Failed to get local stream", err);
                        setTelehealthStatus('error');
                    });
            }

            // 2. Setup AI Vision tracking for the patient's remote video feed
            const initAI = async () => {
                const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
                poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });
            };
            initAI();

            // 3. Process loop for the incoming patient video feed
            const trackPatient = () => {
                if (remoteVideoRef.current && poseLandmarker && remoteStream && remoteVideoRef.current.readyState >= 2) {
                    const results = poseLandmarker.detectForVideo(remoteVideoRef.current, performance.now());
                    if (results.landmarks && results.landmarks.length > 0) {
                        setPatientLandmarks(results.landmarks[0]);
                    }
                }
                animationFrameId = requestAnimationFrame(trackPatient);
            };
            trackPatient();

        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (poseLandmarker) poseLandmarker.close();
        }
    }, [isTelehealthModalOpen, remoteStream]);

    // Attach streams when available
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, isTelehealthModalOpen]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const handleCallPatient = () => {
        if (!peerInstance.current || !localStream || !patientTelehealthId) return;

        setTelehealthStatus('calling');
        const call = peerInstance.current.call(patientTelehealthId, localStream);

        call.on('stream', (userVideoStream) => {
            setRemoteStream(userVideoStream);
            setTelehealthStatus('connected');
        });

        call.on('close', () => {
            handleEndCall();
        });

        call.on('error', (err) => {
            console.error(err);
            setTelehealthStatus('error');
        });

        currentCall.current = call;
    };

    const handleEndCall = () => {
        if (currentCall.current) {
            currentCall.current.close();
            currentCall.current = null;
        }
        setRemoteStream(null);
        setTelehealthStatus('idle');
    };

    const handleCloseTelehealth = () => {
        handleEndCall();
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        if (peerInstance.current) {
            peerInstance.current.destroy();
            peerInstance.current = null;
        }
        setIsTelehealthModalOpen(false);
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900 overflow-hidden">

            {/* LEFT PANEL: Navigation & Patient Summary */}
            <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-screen flex-shrink-0 z-10 shadow-sm relative">
                <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded bg-sky-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                        M
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-800">Mobivia Clinical</span>
                </div>

                {/* Patient Summary Card */}
                <div className="m-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-lg border-2 border-white shadow-sm">
                            {PATIENT.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 leading-tight">{PATIENT.name}</h3>
                            <p className="text-xs text-slate-500">Age {PATIENT.age} • ID: MBV-8821</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white p-2 rounded-xl border border-slate-100">
                            <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Latest Score</span>
                            <span className="text-lg font-bold text-amber-600">{PATIENT.score}/100</span>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-100">
                            <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Risk Level</span>
                            <span className="text-sm font-bold text-amber-600 mt-1 flex items-center">
                                <AlertTriangle size={14} className="mr-1" /> {PATIENT.risk}
                            </span>
                        </div>
                    </div>

                    <div className="text-[10px] text-slate-400 flex justify-between items-center px-1">
                        <span>Assessed: {PATIENT.lastAssessment}</span>
                        <button className="text-sky-600 font-medium hover:underline">Change</button>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto pb-4">
                    <span className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Clinical Views</span>
                    <button className="w-full flex items-center space-x-3 px-3 py-2.5 bg-sky-50 text-sky-700 rounded-xl font-medium transition-colors border border-sky-100">
                        <Activity size={18} />
                        <span className="text-sm">Assessment Results</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
                        <Users size={18} />
                        <span className="text-sm">Patient Directory</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
                        <FileText size={18} />
                        <span className="text-sm">Mobility Reports</span>
                    </button>

                    <span className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6 block">Actions</span>
                    <button
                        onClick={() => setIsTelehealthModalOpen(true)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${telehealthStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Video size={18} />
                        <span className="text-sm">Telehealth Consult</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
                        <Settings size={18} />
                        <span className="text-sm">Settings</span>
                    </button>

                    <div className="mt-8 border-t border-slate-100 pt-4 px-3">
                        <Link
                            to="/login"
                            onClick={() => localStorage.removeItem('mobivia_role')}
                            className="w-full flex items-center space-x-3 py-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors px-3"
                        >
                            <LogOut size={18} />
                            <span className="text-sm">Log Out</span>
                        </Link>
                    </div>
                </nav>
            </aside>

            {/* CENTER PANEL: 3D Visualization & Timeline */}
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

                    {/* Canvas Viewport */}
                    <div className="flex-1 relative cursor-grab active:cursor-grabbing">
                        <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
                            <color attach="background" args={['#f1f5f9']} />
                            <ambientLight intensity={0.5} />
                            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

                            {showSkeleton && <CustomModel landmarks={patientLandmarks} />}

                            {/* Grid Floor */}
                            <Grid infiniteGrid fadeDistance={20} sectionColor="#cbd5e1" cellColor="#e2e8f0" position={[0, -1, 0]} />
                            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2 + 0.1} />
                            <Environment preset="city" />
                        </Canvas>

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
                        <div className="absolute top-4 left-4">
                            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 shadow-sm rounded-xl py-2 px-4 inline-block">
                                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest block mb-0.5">Capturing Step {activeStep}</span>
                                <span className="text-lg font-bold text-slate-800">{ASSESSMENT_STEPS[activeStep - 1].title}</span>
                            </div>
                        </div>

                        {/* Telehealth Overlay Container */}
                        {isTelehealthModalOpen && (
                            <div className="absolute right-4 bottom-4 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-50">
                                {/* Header */}
                                <div className="bg-slate-900 text-white p-3 flex justify-between items-center">
                                    <div className="flex items-center space-x-2">
                                        <div className={`w-2 h-2 rounded-full ${telehealthStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                                        <span className="text-xs font-bold tracking-wider">LIVE TELEHEALTH</span>
                                    </div>
                                    <button onClick={handleCloseTelehealth} className="text-slate-400 hover:text-white transition-colors">
                                        <XCircle size={16} />
                                    </button>
                                </div>

                                {/* Connection UI */}
                                {telehealthStatus === 'idle' || telehealthStatus === 'error' ? (
                                    <div className="p-4">
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Patient Telehealth ID</label>
                                        <div className="flex space-x-2">
                                            <input
                                                type="text"
                                                value={patientTelehealthId}
                                                onChange={(e) => setPatientTelehealthId(e.target.value)}
                                                placeholder="Enter ID..."
                                                className="flex-1 border border-slate-300 rounded-lg px-2 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                                            />
                                            <button
                                                onClick={handleCallPatient}
                                                className="bg-sky-600 hover:bg-sky-700 text-white rounded-lg p-2 transition-colors"
                                            >
                                                <Phone size={16} />
                                            </button>
                                        </div>
                                        {telehealthStatus === 'error' && <span className="text-[10px] text-red-500 font-medium mt-1 block">Connection failed. Check ID.</span>}
                                    </div>
                                ) : (
                                    <>
                                        {/* Remote Stream View (Patient) */}
                                        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
                                            {remoteStream ? (
                                                <video
                                                    ref={remoteVideoRef}
                                                    className="w-full h-full object-cover"
                                                    autoPlay
                                                    playsInline
                                                />
                                            ) : (
                                                <span className="text-white/50 text-xs font-medium animate-pulse">Connecting to Patient...</span>
                                            )}
                                        </div>

                                        {/* Call Controls */}
                                        <div className="bg-slate-50 p-2 flex justify-center space-x-4 border-t border-slate-100 relative">
                                            {/* Local PiP */}
                                            <div className="absolute left-2 bottom-full mb-2 w-20 aspect-video bg-slate-800 rounded shadow border border-white/20 overflow-hidden">
                                                <video ref={localVideoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                                            </div>

                                            <button
                                                onClick={handleEndCall}
                                                className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center shadow-sm transition-colors"
                                            >
                                                <PhoneOff size={14} className="mr-1.5" /> End Consult
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Replay Controls Panel */}
                    <div className="h-16 bg-white border-t border-slate-200 px-6 flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10">
                        <div className="flex items-center space-x-4">
                            <button className="text-slate-400 hover:text-slate-700 transition-colors">
                                <Rewind size={20} />
                            </button>
                            <button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 shadow-md transition-transform hover:scale-105 active:scale-95"
                            >
                                {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
                            </button>
                            <button className="text-slate-400 hover:text-slate-700 transition-colors">
                                <FastForward size={20} />
                            </button>
                        </div>

                        <div className="flex-1 mx-8 relative flex items-center">
                            <div className="h-1.5 bg-slate-100 w-full rounded-full overflow-hidden">
                                <div className="h-full bg-sky-500 rounded-full w-1/3"></div>
                            </div>
                            <div className="absolute left-1/3 w-3 h-3 bg-white border-2 border-sky-500 rounded-full shadow cursor-grab transform -translate-x-1.5 outline-none hover:scale-125 transition-transform"></div>
                        </div>

                        <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-md">
                            1.0x Speed
                        </div>
                    </div>
                </div>

                {/* Horizontal Timeline Ribbon */}
                <div className="h-48 bg-white px-2 py-4 overflow-x-auto flex items-center space-x-3 hide-scrollbar">
                    {ASSESSMENT_STEPS.map((step) => {
                        const isActive = step.id === activeStep;

                        // Map risk to icons/colors
                        let Icon = CheckCircle;
                        let iconColor = "text-emerald-500";
                        let riskBg = "bg-emerald-50";

                        if (step.risk === 'high') {
                            Icon = XCircle;
                            iconColor = "text-red-500";
                            riskBg = "bg-red-50";
                        } else if (step.risk === 'moderate') {
                            Icon = AlertTriangle;
                            iconColor = "text-amber-500";
                            riskBg = "bg-amber-50";
                        }

                        return (
                            <div
                                key={step.id}
                                onClick={() => setActiveStep(step.id)}
                                className={`flex-shrink-0 w-64 h-full rounded-xl border p-4 cursor-pointer transition-all flex flex-col ${isActive ? 'bg-sky-50 border-sky-200 shadow-md ring-1 ring-sky-200' : 'bg-white border-slate-200 hover:border-sky-200 hover:shadow-sm'}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-sky-600' : 'text-slate-400'}`}>Step {step.id}</span>
                                    <div className={`p-1 rounded-md ${riskBg}`}>
                                        <Icon size={14} className={iconColor} />
                                    </div>
                                </div>

                                <h4 className={`text-sm font-bold leading-tight ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{step.title}</h4>
                                <p className="text-[10px] text-slate-500 mb-2 truncate">{step.subtitle}</p>

                                <div className="mt-auto">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-[10px] text-slate-400 font-medium">Step Score</span>
                                        <span className={`text-xs font-bold ${isActive ? 'text-sky-700' : 'text-slate-600'}`}>{step.score}/100</span>
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

            {/* RIGHT PANEL: Analytics & Tooling */}
            <aside className="w-[380px] bg-white border-l border-slate-200 h-screen overflow-y-auto flex-shrink-0 flex flex-col">
                <div className="p-6 pb-2 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                    <h2 className="text-xl font-bold text-slate-800 mb-1">Clinical Analytics</h2>
                    <p className="text-xs text-slate-500 mb-4">Derived from 3D joint reconstruction</p>

                    {/* Action Buttons Row */}
                    <div className="flex gap-2 mb-2">
                        <button className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 shadow-sm flex items-center justify-center transition-colors">
                            <FileText size={14} className="mr-1.5 text-slate-400" /> Report
                        </button>
                        <button className="flex-1 bg-slate-900 text-white border border-slate-800 py-2 rounded-xl text-xs font-semibold hover:bg-slate-800 shadow-sm flex items-center justify-center transition-colors">
                            <Download size={14} className="mr-1.5 opacity-80" /> Export CSV
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-8">

                    {/* Risk Indicator Card */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Overall Mobility Risk</h3>
                        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-200 rounded-full blur-2xl opacity-40 -translate-y-4 translate-x-4"></div>

                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <span className="text-4xl font-black text-amber-600 tracking-tighter shadow-sm">{PATIENT.score}</span>
                                    <span className="text-sm font-bold text-amber-800 ml-1">/100</span>
                                </div>
                                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg border border-amber-200 shadow-sm">
                                    Moderate Risk
                                </span>
                            </div>

                            <p className="text-xs text-amber-800 mt-4 font-medium leading-relaxed relative z-10 bg-white/40 p-3 rounded-lg border border-amber-100/50">
                                "Moderate mobility risk detected due to restricted shoulder elevation and forward spinal tilt during seating."
                            </p>
                        </div>
                    </div>

                    {/* Granular Biomechanics */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Biomechanical Metrics</h3>
                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-2">
                            <MetricBar label="Spine Angle" value={15} optimal={0} unit="°" />
                            <MetricBar label="Head Tilt (Forward)" value={22} optimal={10} unit="°" />
                            <MetricBar label="Shoulder Symm. Diff" value={8} optimal={0} unit="cm" />
                            <MetricBar label="Knee Flexion (Squat)" value={85} optimal={90} unit="°" />
                            <MetricBar label="Max Arm Elevation" value={110} optimal={170} unit="°" />
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

                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={TREND_DATA} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={5} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                        itemStyle={{ color: '#0369a1' }}
                                    />
                                    <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                                    <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        stroke="#0ea5e9"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: '#0ea5e9' }}
                                        activeDot={{ r: 6, fill: '#0ea5e9', strokeWidth: 2, stroke: '#fff' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            </aside>

        </div>
    );
}
