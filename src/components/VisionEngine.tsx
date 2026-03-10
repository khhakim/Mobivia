import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Camera } from "@mediapipe/camera_utils";

export interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number | null;
}

interface VisionEngineProps {
    onPoseDetected: (landmarks: Landmark[]) => void;
    onStreamAllocated?: (stream: MediaStream) => void;
}

export default function VisionEngine({ onPoseDetected, onStreamAllocated }: VisionEngineProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    const [cameraError, setCameraError] = useState<'denied' | 'notfound' | 'other' | null>(null);

    // Track the latest callback without triggering re-initializations of the heavy AI model
    const onPoseDetectedRef = useRef(onPoseDetected);
    useEffect(() => {
        onPoseDetectedRef.current = onPoseDetected;
    }, [onPoseDetected]);

    useEffect(() => {
        let poseLandmarker: PoseLandmarker | null = null;
        let camera: Camera | null = null;

        async function initMediaPipe() {
            try {
                // Load the WASM binary for MediaPipe tasks
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                // Initialize the PoseLandmarker model
                poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                        delegate: "GPU" // Attempt to use WebGL
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });

                if (videoRef.current && canvasRef.current) {
                    const videoElement = videoRef.current;

                    // Use Camera Utils for stable high-framerate stream
                    camera = new Camera(videoElement, {
                        onFrame: async () => {
                            if (poseLandmarker && videoElement.videoWidth > 0) {
                                const startTimeMs = performance.now();
                                const results = poseLandmarker.detectForVideo(videoElement, startTimeMs);

                                if (results.landmarks && results.landmarks.length > 0) {
                                    const landmarks = results.landmarks[0];

                                    // Forward structural data to our Rust Tauri Backend
                                    onPoseDetectedRef.current(landmarks);

                                    // Visual Rendering Logic (Draw skeleton on canvas)
                                    drawJointsOnCanvas(landmarks, videoElement.videoWidth, videoElement.videoHeight);
                                }
                            }
                        },
                        width: 640,
                        height: 480
                    });

                    await camera.start();

                    // The camera utility securely assigns srcObject internally.
                    // We pull it from the DOM element to pass up to our WebRTC logic
                    const stream = videoElement.srcObject as MediaStream;
                    if (stream && onStreamAllocated) {
                        onStreamAllocated(stream);
                    }

                    setIsInitializing(false);
                }
            } catch (error: any) {
                console.error("Error initializing MediaPipe:", error);
                const name = error?.name || '';
                const msg = error?.message?.toLowerCase() || '';
                if (name === 'NotAllowedError' || msg.includes('permission') || msg.includes('denied') || msg.includes('not allowed')) {
                    setCameraError('denied');
                } else if (name === 'NotFoundError' || msg.includes('not found') || msg.includes('no camera')) {
                    setCameraError('notfound');
                } else {
                    setCameraError('other');
                }
                setIsInitializing(false);
            }
        }

        initMediaPipe();

        return () => {
            // Asynchronous cleanup so unmounting the component (switching tabs) doesn't freeze the main UI thread
            setTimeout(() => {
                const stream = videoRef.current?.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach(t => t.stop());
                }
                if (camera) {
                    try { camera.stop(); } catch (e) { console.warn("Camera stop error", e); }
                }
                if (poseLandmarker) {
                    try { poseLandmarker.close(); } catch (e) { console.warn("MediaPipe model close error", e); }
                }
            }, 100);
        };
    }, []);

    // Basic rendering logic to plot joints and connect bones
    function drawJointsOnCanvas(landmarks: Landmark[], width: number, height: number) {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Ensure canvas internal resolution matches the video stream
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // Config properties for drawing (Apple Health Styling)
        const jointRadius = 4;
        const jointColor = "#0284c7"; // Sky 600
        const boneWidth = 3;
        const boneColor = "rgba(14, 165, 233, 0.6)"; // Sky 500 transparent

        // Draw all 33 mapped joints
        landmarks.forEach((landmark) => {
            // MediaPipe normalizes coordinates 0..1, so we map them to the canvas pixel size
            const x = landmark.x * width;
            const y = landmark.y * height;

            ctx.beginPath();
            ctx.arc(x, y, jointRadius, 0, 2 * Math.PI);
            ctx.fillStyle = jointColor;
            ctx.fill();
        });

        // Helper to draw a bone line
        const drawBone = (idx1: number, idx2: number, color = boneColor) => {
            if (landmarks[idx1] && landmarks[idx2]) {
                ctx.beginPath();
                ctx.moveTo(landmarks[idx1].x * width, landmarks[idx1].y * height);
                ctx.lineTo(landmarks[idx2].x * width, landmarks[idx2].y * height);
                ctx.lineWidth = boneWidth;
                ctx.strokeStyle = color;
                ctx.stroke();
            }
        };

        // --- FULL SKELETAL CONNECTIONS ARRAY ---
        // FACE
        drawBone(2, 0); drawBone(0, 5); // Eyes to nose
        drawBone(7, 2); drawBone(8, 5); // Ears to eyes

        // TRUNK
        drawBone(11, 12); // Shoulders
        drawBone(23, 24); // Hips
        drawBone(11, 23); drawBone(12, 24); // Torsos (Left shoulder->hip, Right shoulder->hip)

        // SPINE (Synthetic line down the absolute middle for Step 1 posture tracking)
        const midShoulderX = ((landmarks[11].x + landmarks[12].x) / 2) * width;
        const midShoulderY = ((landmarks[11].y + landmarks[12].y) / 2) * height;
        const midHipX = ((landmarks[23].x + landmarks[24].x) / 2) * width;
        const midHipY = ((landmarks[23].y + landmarks[24].y) / 2) * height;

        ctx.beginPath();
        ctx.moveTo(midShoulderX, midShoulderY);
        ctx.lineTo(midHipX, midHipY);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#fbbf24"; // Highlight mathematical spine in amber
        ctx.stroke();

        // ARMS
        // Left Arm
        drawBone(11, 13); drawBone(13, 15);
        drawBone(15, 21); drawBone(15, 17); drawBone(15, 19);
        // Right Arm 
        drawBone(12, 14); drawBone(14, 16);
        drawBone(16, 22); drawBone(16, 18); drawBone(16, 20);

        // LEGS
        // Left Leg
        drawBone(23, 25); drawBone(25, 27);
        drawBone(27, 29); drawBone(27, 31); drawBone(29, 31);
        // Right Leg
        drawBone(24, 26); drawBone(26, 28);
        drawBone(28, 30); drawBone(28, 32); drawBone(30, 32);
    }

    return (
        <div className="relative w-full h-full aspect-video rounded-3xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-xl">
            {/* Underlying raw video feed */}
            <video
                ref={videoRef}
                className="absolute top-0 left-0 w-full h-full object-cover z-0 rounded-3xl"
                playsInline
            ></video>

            {/* 2D Canvas overlaying the video for skeletal tracing */}
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-cover z-10 rounded-3xl"
            ></canvas>

            {/* Camera Permission Error — macOS users need to grant manually */}
            {cameraError === 'denied' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 z-20 rounded-3xl p-6">
                    <div className="text-center max-w-sm">
                        <div className="text-4xl mb-4">📷</div>
                        <h3 className="text-white font-bold text-lg mb-2">Camera Access Required</h3>
                        <p className="text-slate-400 text-sm mb-5">Mobivia needs your camera for posture analysis. Please grant access:</p>
                        <div className="bg-slate-800 rounded-xl p-4 text-left space-y-2 text-sm text-slate-300">
                            <p className="font-semibold text-white">On macOS:</p>
                            <p>1. Open <span className="text-sky-400">System Settings</span></p>
                            <p>2. Go to <span className="text-sky-400">Privacy & Security → Camera</span></p>
                            <p>3. Enable <span className="text-sky-400">Mobivia</span></p>
                            <p>4. Restart the app</p>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-4 text-left space-y-2 text-sm text-slate-300 mt-3">
                            <p className="font-semibold text-white">On Windows:</p>
                            <p>1. Open <span className="text-sky-400">Settings → Privacy → Camera</span></p>
                            <p>2. Enable camera for desktop apps</p>
                            <p>3. Restart the app</p>
                        </div>
                    </div>
                </div>
            )}

            {/* No camera found */}
            {cameraError === 'notfound' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 z-20 rounded-3xl p-6">
                    <div className="text-center">
                        <div className="text-4xl mb-4">🔌</div>
                        <h3 className="text-white font-bold text-lg mb-2">No Camera Found</h3>
                        <p className="text-slate-400 text-sm">Please connect a camera and restart the app.</p>
                    </div>
                </div>
            )}

            {/* Generic engine error */}
            {cameraError === 'other' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 z-20 rounded-3xl p-6">
                    <div className="text-center">
                        <div className="text-4xl mb-4">⚠️</div>
                        <h3 className="text-white font-bold text-lg mb-2">Vision Engine Error</h3>
                        <p className="text-slate-400 text-sm">Could not start the AI engine. Please restart the app.</p>
                    </div>
                </div>
            )}

            {/* Loading Overlay */}
            {isInitializing && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-20">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 border-4 border-t-sky-500 border-slate-200 rounded-full animate-spin mx-auto"></div>
                        <p className="text-slate-800 font-semibold shadow-sm">Configuring Privacy Engine...</p>
                        <p className="text-sm text-slate-500">Accessing Camera MediaDevices</p>
                    </div>
                </div>
            )}

            {/* Overlay Status Frame */}
            {!isInitializing && !cameraError && (
                <div className="absolute bottom-4 left-4 z-30 bg-white/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-200 shadow-md flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-slate-700 font-medium text-sm">Vision Engine Active</span>
                </div>
            )}
        </div>
    );
}
