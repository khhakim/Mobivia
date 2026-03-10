import { useState, useRef, useEffect, useCallback } from 'react';
import { PhoneOff, Video, ArrowLeft, Mic, MicOff, VideoOff } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Peer, { MediaConnection } from "peerjs";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Landmark } from "../components/VisionEngine";
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Custom 3D Human Model with Biomechanical Mapping
const CustomModel = ({ landmarks }: { landmarks?: Landmark[] | null }) => {
    const { scene } = useGLTF('/human_model.glb');
    const initialLocalQuats = useRef<Record<string, THREE.Quaternion>>({});

    useFrame(({ clock }) => {
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

        if (landmarks && landmarks.length >= 33) {
            const getPoint = (i: number) => new THREE.Vector3(
                (landmarks[i].x - 0.5) * 2,
                -(landmarks[i].y - 0.5) * 2,
                -landmarks[i].z * 2
            );

            // 1. Spine Mapping
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

                targetVec.z *= 0.3; // Dampen Z-axis

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
            const t = clock.getElapsedTime();
            const leftArm = getBone('LeftArm');
            if (leftArm && initialLocalQuats.current[leftArm.name]) {
                const currentQuat = leftArm.quaternion.clone();
                const idleTarget = initialLocalQuats.current[leftArm.name].clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.sin(t) * 0.1)));
                leftArm.quaternion.copy(currentQuat).slerp(idleTarget, 0.05);
            }
        }
    });

    return (
        <group position={[0, -1, 0]}>
            <primitive object={scene} scale={[50, 50, 50]} position={[0, 0, 0]} />
        </group>
    );
};
useGLTF.preload('/human_model.glb');

export default function TelehealthConsultation() {
    const navigate = useNavigate();
    const { patientId } = useParams();
    const { profile } = useAuth();
    const [patientTelehealthId, setPatientTelehealthId] = useState('');
    const [telehealthStatus, setTelehealthStatus] = useState<'idle' | 'calling' | 'connected' | 'error'>('idle');
    const [isPeerReady, setIsPeerReady] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerInstance = useRef<Peer | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [patientLandmarks, setPatientLandmarks] = useState<Landmark[] | null>(null);

    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isVideoHidden, setIsVideoHidden] = useState(false);
    const currentCall = useRef<MediaConnection | null>(null);

    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);

    // Keep stream refs up to date for cleanup and tracking loops
    useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
    useEffect(() => { remoteStreamRef.current = remoteStream; }, [remoteStream]);

    // 1. Initialize Telehealth Peer and Local Media Data
    useEffect(() => {
        const peer = new Peer();
        peerInstance.current = peer;

        peer.on('open', () => {
            setIsPeerReady(true);
        });

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((stream) => setLocalStream(stream))
            .catch((err) => {
                console.error("Failed to get local stream", err);
                setTelehealthStatus('error');
            });

        return () => {
            peer.destroy();
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // 1.5 Pick up pending Patient Request
    useEffect(() => {
        if (!patientId || !profile || profile.role !== 'Doctor') return;

        let activeSessionId: string | null = null;

        const checkIncomingRequest = async () => {
            const { data, error } = await supabase
                .from('telehealth_sessions')
                .select('*')
                .eq('doctor_id', profile.id)
                .eq('patient_id', patientId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                console.error("Error checking incoming request:", error);
            }

            if (data && data.patient_peer_id) {
                activeSessionId = data.id;
                setPatientTelehealthId(data.patient_peer_id);

                // Alert the patient that we are now "accepted" (opening our UI)
                await supabase
                    .from('telehealth_sessions')
                    .update({ status: 'accepted' })
                    .eq('id', data.id);
            }
        };

        checkIncomingRequest();

        return () => {
            if (activeSessionId) {
                // If we unmount before completing, mark cancelled so the patient page resets
                supabase.from('telehealth_sessions')
                    .update({ status: 'cancelled' })
                    .eq('id', activeSessionId)
                    .then(() => console.log('Session marked cancelled on unmount'));
            }
        };
    }, [patientId, profile]);

    // 2. Setup AI Vision tracking for the patient's remote video feed
    useEffect(() => {
        let poseLandmarker: PoseLandmarker | null = null;
        let animationFrameId: number;

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

        // Process loop for the incoming patient video feed
        const trackPatient = () => {
            if (remoteVideoRef.current && poseLandmarker && remoteStreamRef.current && remoteVideoRef.current.readyState >= 2) {
                const results = poseLandmarker.detectForVideo(remoteVideoRef.current, performance.now());
                if (results.landmarks && results.landmarks.length > 0) {
                    setPatientLandmarks(results.landmarks[0]);
                }
            }
            animationFrameId = requestAnimationFrame(trackPatient);
        };
        trackPatient();

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (poseLandmarker) poseLandmarker.close();
        }
    }, []);

    // Attach streams when available
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // 4. Function to start the call
    const handleCallPatient = useCallback(() => {
        if (!peerInstance.current || !patientTelehealthId || !localStreamRef.current) {
            console.warn("Missing peer instance, patient ID, or local stream");
            return;
        }

        setTelehealthStatus('calling');
        const call = peerInstance.current.call(patientTelehealthId, localStreamRef.current);

        call.on('stream', (rStream) => {
            setRemoteStream(rStream);
            setTelehealthStatus('connected');
        });

        call.on('close', () => {
            setRemoteStream(null);
            setTelehealthStatus('idle');
            // Clean up patient peer ID so we don't auto-reconnect unintentionally
            setPatientTelehealthId('');
        });

        call.on('error', (err) => {
            console.error(err);
            setTelehealthStatus('error');
        });

        currentCall.current = call;
    }, [patientTelehealthId, localStreamRef, peerInstance]); // Added peerInstance to dependencies

    // 4.5 Auto-Dial Patient when constraints are met
    useEffect(() => {
        if (isPeerReady && patientTelehealthId && localStream && telehealthStatus === 'idle') {
            console.log("Auto-dialing patient:", patientTelehealthId);
            // Small delay ensures signaling server registration is stabilized before outbound call
            const timer = setTimeout(() => {
                handleCallPatient();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [isPeerReady, patientTelehealthId, localStream, telehealthStatus, handleCallPatient]);

    const handleEndCall = () => {
        if (currentCall.current) {
            currentCall.current.close();
            currentCall.current = null;
        }
        setRemoteStream(null);
        setTelehealthStatus('idle');
    };

    const toggleAudio = () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsAudioMuted(!isAudioMuted);
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsVideoHidden(!isVideoHidden);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col font-sans text-white overflow-hidden absolute inset-0 z-50">
            {/* Header Toolbar */}
            <header className="h-16 bg-slate-800 border-b border-white/10 px-6 flex items-center justify-between flex-shrink-0 z-20 shadow-md">
                <div className="flex items-center space-x-4">
                    <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white transition-colors flex items-center bg-white/5 rounded-full p-2">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-white flex items-center">
                            <Video size={18} className="mr-2 text-sky-400" />
                            Live Telehealth Consultation
                        </h1>
                        <p className="text-xs text-slate-400">Mobivia Clinical AI Core</p>
                    </div>
                </div>

                {/* Connection Controls in Header */}
                <div className="flex items-center space-x-4 bg-black/30 p-2 rounded-xl border border-white/5">
                    <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${telehealthStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : telehealthStatus === 'calling' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                            {telehealthStatus === 'connected' ? 'Connected' : telehealthStatus === 'calling' ? 'Calling...' : 'Disconnected'}
                        </span>
                    </div>

                    {telehealthStatus === 'idle' || telehealthStatus === 'error' ? (
                        <div className="flex items-center space-x-3 bg-slate-900/50 p-1.5 rounded-xl border border-white/10">
                            <input
                                type="text"
                                placeholder="Paste Patient ID here"
                                value={patientTelehealthId}
                                onChange={(e) => setPatientTelehealthId(e.target.value)}
                                className="bg-slate-900 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500 hidden md:block w-48"
                            />
                            <button
                                onClick={handleCallPatient}
                                disabled={!isPeerReady || !patientTelehealthId}
                                className="bg-sky-600 hover:bg-sky-700 text-white rounded-lg px-4 py-1.5 text-sm font-bold transition-colors flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Connect
                            </button>
                        </div>
                    ) : telehealthStatus === 'calling' ? (
                        <div className="flex items-center space-x-3 bg-slate-900/50 p-1.5 rounded-xl border border-white/10">
                            <div className="flex items-center text-amber-500 px-4 py-1 text-sm font-bold animate-pulse">
                                Calling Patient...
                            </div>
                            <button
                                onClick={handleEndCall}
                                className="bg-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg px-3 py-1 text-xs font-bold transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex space-x-2">
                            <button
                                onClick={toggleAudio}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center shadow-md transition-colors ${isAudioMuted ? 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                            >
                                {isAudioMuted ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                            <button
                                onClick={toggleVideo}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center shadow-md transition-colors ${isVideoHidden ? 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                            >
                                {isVideoHidden ? <VideoOff size={16} /> : <Video size={16} />}
                            </button>
                            <div className="w-px h-6 bg-white/20 my-auto mx-2"></div>
                            <button
                                onClick={handleEndCall}
                                className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center shadow-md transition-transform hover:scale-105"
                            >
                                <PhoneOff size={14} className="mr-2" /> End Consult
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Split Screen Container */}
            <main className="flex-1 flex flex-row w-full h-full relative">

                {/* 3D Canvas Pane (Left Side) */}
                <div className="w-1/2 relative bg-slate-800 border-r border-white/10 flex flex-col overflow-hidden shadow-inner cursor-grab active:cursor-grabbing">
                    <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
                        <color attach="background" args={['#1e293b']} /> {/* Dark slate background */}
                        <ambientLight intensity={0.5} />
                        <pointLight position={[10, 10, 10]} intensity={1} />
                        <directionalLight position={[-5, 5, 5]} intensity={0.5} />

                        <CustomModel landmarks={patientLandmarks} />

                        <Environment preset="city" />
                        <Grid infiniteGrid fadeDistance={20} sectionColor="#475569" cellColor="#334155" />
                        <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={2} maxDistance={10} />
                    </Canvas>

                    <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-bold text-white z-10 flex items-center shadow-md border border-white/10">
                        BIOMECHANICAL RECONSTRUCTION
                    </div>
                </div>

                {/* Telehealth Patient Video Pane (Right Side) */}
                <div className="w-1/2 relative bg-black flex flex-col overflow-hidden shadow-2xl z-10">
                    {/* Remote Stream View (Patient) */}
                    {remoteStream ? (
                        <video ref={remoteVideoRef} className="w-full h-full object-cover" autoPlay playsInline />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-white/50">
                            <Video size={48} className="mb-4 opacity-50" />
                            <span className="text-sm font-medium">Waiting for patient connection...</span>
                        </div>
                    )}

                    {remoteStream && (
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-bold text-white z-10 flex items-center shadow-md border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse"></div>
                            LIVE PATIENT VIEW
                        </div>
                    )}

                    {/* Local PiP Doctor */}
                    <div className="absolute bottom-6 right-6 w-48 sm:w-64 aspect-video bg-slate-800 rounded-xl shadow-2xl border-2 border-slate-700 overflow-hidden z-20">
                        {isVideoHidden && (
                            <div className="absolute inset-0 z-30 w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700">
                                <VideoOff size={24} className="text-slate-500" />
                            </div>
                        )}
                        <video ref={localVideoRef} className="w-full h-full object-cover transform scale-x-[-1]" autoPlay playsInline muted />
                        <span className="absolute bottom-2 left-2 flex items-center bg-black/60 px-2 py-0.5 rounded text-[10px] text-white font-bold z-40">
                            You {isAudioMuted && <MicOff size={10} className="ml-1 text-red-400" />}
                        </span>
                    </div>
                </div>
            </main>
        </div>
    );
}
