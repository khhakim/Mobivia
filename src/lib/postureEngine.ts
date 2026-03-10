/**
 * postureEngine.ts
 * TypeScript mirror of the Rust posture calculation in src-tauri/src/lib.rs.
 * Used as a fallback when running in the web browser (no Tauri IPC available).
 * The Tauri desktop app uses the native Rust version via invoke() for performance.
 */

export interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number | null;
}

export interface Metric {
    label: string;
    value: number;
    unit: string;
    passed: boolean;
}

export interface PostureResult {
    metrics: Metric[];
    passed: boolean;
    score: number;
}

/** Runtime check: true only when running inside the Tauri desktop app */
export const isTauri = () =>
    typeof window !== "undefined" && "__TAURI__" in window;

function angle3d(a: Landmark, b: Landmark, c: Landmark): number {
    const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
    const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
    const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
    if (magBa * magBc === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
}

export function calculatePostureJS(
    landmarks: Landmark[],
    stepId: number
): PostureResult {
    if (landmarks.length < 33) {
        return { metrics: [], passed: false, score: 0 };
    }

    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midHipX = (leftHip.x + rightHip.x) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;

    const metrics: Metric[] = [];
    let passed = false;
    let maxDeviation = 0;

    switch (stepId) {
        case 1:
        case 7: {
            const spineDx = midShoulderX - midHipX;
            const spineDy = midShoulderY - midHipY;
            const spineAngle = Math.abs(Math.atan(spineDx / Math.abs(spineDy)) * (180 / Math.PI));

            const shoulderDx = rightShoulder.x - leftShoulder.x;
            const shoulderDy = rightShoulder.y - leftShoulder.y;
            const shoulderSymmetry = Math.abs(Math.atan(shoulderDy / Math.abs(shoulderDx)) * (180 / Math.PI));

            const earDx = rightEar.x - leftEar.x;
            const earDy = rightEar.y - leftEar.y;
            const headTilt = Math.abs(Math.atan(earDy / Math.abs(earDx)) * (180 / Math.PI));

            maxDeviation = Math.max(spineAngle, shoulderSymmetry, headTilt);
            passed = maxDeviation < 10;

            metrics.push({ label: "Spine Angle", value: spineAngle, unit: "°", passed: spineAngle < 10 });
            metrics.push({ label: "Shoulder Symmetry", value: shoulderSymmetry, unit: "°", passed: shoulderSymmetry < 10 });
            metrics.push({ label: "Head Tilt", value: headTilt, unit: "°", passed: headTilt < 10 });
            break;
        }
        case 2: {
            const spineDx = midShoulderX - midHipX;
            const spineDy = midShoulderY - midHipY;
            const spineAngle = Math.abs(Math.atan(spineDx / Math.abs(spineDy)) * (180 / Math.PI));
            const leftThighDev = Math.abs(leftHip.y - leftKnee.y) * 100;
            const rightThighDev = Math.abs(rightHip.y - rightKnee.y) * 100;
            const avgThigh = (leftThighDev + rightThighDev) / 2;

            maxDeviation = Math.max(spineAngle, avgThigh);
            passed = maxDeviation < 25;

            metrics.push({ label: "Spine Verticality", value: spineAngle, unit: "°", passed: spineAngle < 25 });
            metrics.push({ label: "Thigh Alignment", value: avgThigh, unit: "u", passed: avgThigh < 25 });
            metrics.push({ label: "Seated Valid", value: passed ? 100 : 0, unit: "%", passed: true });
            break;
        }
        case 3: {
            const leftReach = Math.abs(leftWrist.y - leftShoulder.y) * 100;
            const rightReach = Math.abs(rightWrist.y - rightShoulder.y) * 100;
            const avgReach = (leftReach + rightReach) / 2;

            maxDeviation = Math.min(avgReach, 25);
            passed = avgReach < 35;

            metrics.push({ label: "Reach Level", value: avgReach, unit: "dev", passed: avgReach < 35 });
            metrics.push({ label: "Arm Symmetry", value: Math.abs(leftReach - rightReach), unit: "dev", passed: Math.abs(leftReach - rightReach) < 15 });
            metrics.push({ label: "Target Reached", value: passed ? 100 : 0, unit: "%", passed: true });
            break;
        }
        case 4: {
            const leftOverhead = (leftShoulder.y - leftWrist.y) * 100;
            const rightOverhead = (rightShoulder.y - rightWrist.y) * 100;
            const avgOverhead = (leftOverhead + rightOverhead) / 2;

            passed = avgOverhead > 10;
            maxDeviation = passed ? 0 : Math.min(10 - Math.max(avgOverhead, -15), 25);

            metrics.push({ label: "Overhead Extension", value: avgOverhead, unit: "u", passed: avgOverhead > 10 });
            metrics.push({ label: "Arm Symmetry", value: Math.abs(leftOverhead - rightOverhead), unit: "u", passed: Math.abs(leftOverhead - rightOverhead) < 15 });
            metrics.push({ label: "Target Reached", value: passed ? 100 : 0, unit: "%", passed: true });
            break;
        }
        case 5: {
            const spineDx = midShoulderX - midHipX;
            const spineDy = midShoulderY - midHipY;
            const spineAngle = Math.abs(Math.atan(spineDx / Math.abs(spineDy)) * (180 / Math.PI));

            passed = spineAngle > 8;
            maxDeviation = passed ? 0 : Math.min(8 - spineAngle, 20);

            metrics.push({ label: "Spine Lateral Bend", value: spineAngle, unit: "°", passed });
            metrics.push({ label: "Target Minimum", value: 15, unit: "°", passed: true });
            metrics.push({ label: "Symmetry Match", value: 0, unit: "°", passed: true });
            break;
        }
        case 6: {
            const leftKneeFlex = angle3d(leftHip, leftKnee, leftAnkle);
            const rightKneeFlex = angle3d(rightHip, rightKnee, rightAnkle);
            const avgKnee = (leftKneeFlex + rightKneeFlex) / 2;

            const leftHipFlex = angle3d(leftShoulder, leftHip, leftKnee);
            const rightHipFlex = angle3d(rightShoulder, rightHip, rightKnee);
            const avgHip = (leftHipFlex + rightHipFlex) / 2;

            passed = avgKnee < 140 && avgKnee > 70;
            maxDeviation = Math.abs(120 - avgKnee) / 2;

            metrics.push({ label: "Avg Knee Flexion", value: avgKnee, unit: "°", passed });
            metrics.push({ label: "Avg Hip Flexion", value: avgHip, unit: "°", passed: avgHip < 130 });
            metrics.push({ label: "Squat Depth", value: 120, unit: "°", passed: true });
            break;
        }
        default:
            return { metrics: [], passed: false, score: 0 };
    }

    const score = Math.max(0, Math.min(100, 100 - maxDeviation * 2));
    return { metrics, passed, score };
}
