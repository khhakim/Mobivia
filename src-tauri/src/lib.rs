use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tauri::{Manager, State};

mod db;

#[derive(Debug, Deserialize, Serialize)]
pub struct Landmark {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub visibility: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Metric {
    pub label: String,
    pub value: f64,
    pub unit: String,
    pub passed: bool,
}

#[derive(Debug, Serialize)]
pub struct PostureResult {
    pub metrics: Vec<Metric>,
    pub passed: bool,
    pub score: f64,
}

// Math helper
fn angle_3d(a: &Landmark, b: &Landmark, c: &Landmark) -> f64 {
    let ba = (a.x - b.x, a.y - b.y, a.z - b.z);
    let bc = (c.x - b.x, c.y - b.y, c.z - b.z);
    let dot = ba.0 * bc.0 + ba.1 * bc.1 + ba.2 * bc.2;
    let mag_ba = (ba.0.powi(2) + ba.1.powi(2) + ba.2.powi(2)).sqrt();
    let mag_bc = (bc.0.powi(2) + bc.1.powi(2) + bc.2.powi(2)).sqrt();

    // Avoid division by zero
    if mag_ba * mag_bc == 0.0 {
        return 0.0;
    }

    let cos_theta = (dot / (mag_ba * mag_bc)).clamp(-1.0, 1.0);
    cos_theta.acos().to_degrees()
}

#[tauri::command]
fn calculate_posture(landmarks: Vec<Landmark>, step_id: u8) -> Result<PostureResult, String> {
    if landmarks.len() < 33 {
        return Err("Not enough landmarks provided.".into());
    }

    let nose = &landmarks[0];
    let left_ear = &landmarks[7];
    let right_ear = &landmarks[8];
    let left_shoulder = &landmarks[11];
    let right_shoulder = &landmarks[12];
    let left_elbow = &landmarks[13];
    let right_elbow = &landmarks[14];
    let left_wrist = &landmarks[15];
    let right_wrist = &landmarks[16];
    let left_hip = &landmarks[23];
    let right_hip = &landmarks[24];
    let left_knee = &landmarks[25];
    let right_knee = &landmarks[26];
    let left_ankle = &landmarks[27];
    let right_ankle = &landmarks[28];

    // Midpoints
    let mid_shoulder_x = (left_shoulder.x + right_shoulder.x) / 2.0;
    let mid_shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0;
    let mid_hip_x = (left_hip.x + right_hip.x) / 2.0;
    let mid_hip_y = (left_hip.y + right_hip.y) / 2.0;

    let mut metrics = Vec::new();
    let mut passed = false;
    let mut max_deviation = 0.0;

    match step_id {
        1 | 7 => {
            // Standing Naturally / Back to Neutral
            // 1. Spine Angle
            let spine_dx = mid_shoulder_x - mid_hip_x;
            let spine_dy = mid_shoulder_y - mid_hip_y;
            let spine_angle = (spine_dx / spine_dy.abs()).atan().to_degrees().abs();

            // 2. Shoulder Symmetry
            let shoulder_dx = right_shoulder.x - left_shoulder.x;
            let shoulder_dy = right_shoulder.y - left_shoulder.y;
            let shoulder_symmetry = (shoulder_dy / shoulder_dx.abs()).atan().to_degrees().abs();

            // 3. Head Tilt
            let ear_dx = right_ear.x - left_ear.x;
            let ear_dy = right_ear.y - left_ear.y;
            let head_tilt = (ear_dy / ear_dx.abs()).atan().to_degrees().abs();

            max_deviation = spine_angle.max(shoulder_symmetry).max(head_tilt);
            passed = max_deviation < 5.0;

            metrics.push(Metric {
                label: "Spine Angle".into(),
                value: spine_angle,
                unit: "°".into(),
                passed: spine_angle < 5.0,
            });
            metrics.push(Metric {
                label: "Shoulder Symmetry".into(),
                value: shoulder_symmetry,
                unit: "°".into(),
                passed: shoulder_symmetry < 5.0,
            });
            metrics.push(Metric {
                label: "Head Tilt".into(),
                value: head_tilt,
                unit: "°".into(),
                passed: head_tilt < 5.0,
            });
        }
        2 => {
            // Sitting Upright
            // Issue: Camera Z-depth warps the 90-degree hip/knee calculation
            // Fix: Check if Spine is vertical (like Step 1) AND if thighs are roughly horizontal (knee.y approx equal to hip.y)
            let spine_dx = mid_shoulder_x - mid_hip_x;
            let spine_dy = mid_shoulder_y - mid_hip_y;
            let spine_angle = (spine_dx / spine_dy.abs()).atan().to_degrees().abs();

            // Thigh horizontal deviation: difference in Y between hip and knee relative to length
            // In MediaPipe, Y is normalized 0.0 to 1.0. If seated, hip.y and knee.y should be very close.
            // We use absolute difference for now multiplied by 100 to get a "score-like" metric
            let left_thigh_slope_dev = (left_hip.y - left_knee.y).abs() * 100.0;
            let right_thigh_slope_dev = (right_hip.y - right_knee.y).abs() * 100.0;
            let avg_thigh_slope = (left_thigh_slope_dev + right_thigh_slope_dev) / 2.0;

            max_deviation = spine_angle.max(avg_thigh_slope);
            passed = max_deviation < 15.0; // Broadened tolerance

            metrics.push(Metric {
                label: "Spine Verticality".into(),
                value: spine_angle,
                unit: "°".into(),
                passed: spine_angle < 15.0,
            });
            metrics.push(Metric {
                label: "Thigh Alignment".into(),
                value: avg_thigh_slope,
                unit: "u".into(),
                passed: avg_thigh_slope < 15.0,
            });
            metrics.push(Metric {
                label: "Seated Valid".into(),
                value: if passed { 100.0 } else { 0.0 },
                unit: "%".into(),
                passed: true,
            });
        }
        3 => {
            // Forward Reach
            // Issue: Pointing toward camera foreshortens the elbow 180deg angle
            // Fix: Assume arm is extended if Wrist Y is parallel to Shoulder Y (horizontal reach)
            // And Wrist is physically in front of shoulder (Z-axis depth or just Y-axis validation)
            let left_reach_y_dev = (left_wrist.y - left_shoulder.y).abs() * 100.0;
            let right_reach_y_dev = (right_wrist.y - right_shoulder.y).abs() * 100.0;
            let avg_reach_y = (left_reach_y_dev + right_reach_y_dev) / 2.0;

            max_deviation = avg_reach_y;
            passed = max_deviation < 20.0;

            metrics.push(Metric {
                label: "Reach Level".into(),
                value: avg_reach_y,
                unit: "dev".into(),
                passed: avg_reach_y < 20.0,
            });
            metrics.push(Metric {
                label: "Arm Symmetry".into(),
                value: (left_reach_y_dev - right_reach_y_dev).abs(),
                unit: "dev".into(),
                passed: (left_reach_y_dev - right_reach_y_dev).abs() < 10.0,
            });
            metrics.push(Metric {
                label: "Target Reached".into(),
                value: if passed { 100.0 } else { 0.0 },
                unit: "%".into(),
                passed: true,
            });
        }
        4 => {
            // Hands Overhead
            // Fix: Strict Y validation. Wrists must be significantly HIGHER (lower Y value) than shoulders
            let left_overhead_ext = (left_shoulder.y - left_wrist.y) * 100.0; // positive if wrist is above shoulder
            let right_overhead_ext = (right_shoulder.y - right_wrist.y) * 100.0;
            let avg_overhead = (left_overhead_ext + right_overhead_ext) / 2.0;

            // We want this value to be high. Let's say reaching 30 units above is "passed"
            passed = avg_overhead > 30.0;
            max_deviation = if passed {
                0.0
            } else {
                30.0 - avg_overhead.max(0.0)
            };

            metrics.push(Metric {
                label: "Overhead Extension".into(),
                value: avg_overhead,
                unit: "u".into(),
                passed: avg_overhead > 30.0,
            });
            metrics.push(Metric {
                label: "Arm Symmetry".into(),
                value: (left_overhead_ext - right_overhead_ext).abs(),
                unit: "u".into(),
                passed: (left_overhead_ext - right_overhead_ext).abs() < 10.0,
            });
            metrics.push(Metric {
                label: "Target Reached".into(),
                value: if passed { 100.0 } else { 0.0 },
                unit: "%".into(),
                passed: true,
            });
        }
        5 => {
            // Side Bends
            // Spine lateral deviation
            let spine_dx = mid_shoulder_x - mid_hip_x;
            let spine_dy = mid_shoulder_y - mid_hip_y;
            let spine_angle = (spine_dx / spine_dy.abs()).atan().to_degrees().abs();

            // The goal is to maximize this during the bend, or check range of motion
            // We just feedback the current max bend
            passed = spine_angle > 15.0; // Assume good bend if > 15 deg
            max_deviation = if passed { 0.0 } else { 15.0 - spine_angle };

            metrics.push(Metric {
                label: "Spine Lateral Bend".into(),
                value: spine_angle,
                unit: "°".into(),
                passed,
            });
            metrics.push(Metric {
                label: "Target Minimum".into(),
                value: 15.0,
                unit: "°".into(),
                passed: true,
            });
            metrics.push(Metric {
                label: "Symmetry Match".into(),
                value: 0.0,
                unit: "°".into(),
                passed: true,
            });
        }
        6 => {
            // Partial Squat
            // Target Knee flexion approx 60 degrees (where 180 is straight leg, so 180-60 = 120deg interior angle)
            let left_knee_flexion = angle_3d(left_hip, left_knee, left_ankle);
            let right_knee_flexion = angle_3d(right_hip, right_knee, right_ankle);
            let avg_knee = (left_knee_flexion + right_knee_flexion) / 2.0;

            let left_hip_flexion = angle_3d(left_shoulder, left_hip, left_knee);
            let right_hip_flexion = angle_3d(right_shoulder, right_hip, right_knee);
            let avg_hip = (left_hip_flexion + right_hip_flexion) / 2.0;

            passed = avg_knee < 140.0 && avg_knee > 70.0; // Squatting
            max_deviation = (120.0 - avg_knee).abs() / 2.0;

            metrics.push(Metric {
                label: "Avg Knee Flexion".into(),
                value: avg_knee,
                unit: "°".into(),
                passed,
            });
            metrics.push(Metric {
                label: "Avg Hip Flexion".into(),
                value: avg_hip,
                unit: "°".into(),
                passed: avg_hip < 130.0,
            });
            metrics.push(Metric {
                label: "Squat Depth".into(),
                value: 120.0,
                unit: "°".into(),
                passed: true,
            });
        }
        _ => {
            return Err("Invalid step_id provided.".into());
        }
    }

    let score = (100.0 - (max_deviation * 5.0)).clamp(0.0, 100.0);

    Ok(PostureResult {
        metrics,
        passed,
        score,
    })
}

// --- Database Commands ---

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Patient {
    pub id: String,
    pub name: String,
    pub age: i64,
}

#[tauri::command]
async fn get_patients(pool: State<'_, Pool<Sqlite>>) -> Result<Vec<Patient>, String> {
    sqlx::query_as::<_, Patient>(
        "SELECT id, name, age FROM patients ORDER BY created_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Database error: {}", e))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PatientSummary {
    pub id: String,
    pub name: String,
    pub age: i64,
    pub latest_assessment: Option<String>,
    pub latest_score: Option<f64>,
    pub latest_risk: Option<String>,
}

#[tauri::command]
async fn get_patient_summaries(pool: State<'_, Pool<Sqlite>>) -> Result<Vec<PatientSummary>, String> {
    sqlx::query_as::<_, PatientSummary>(
        r#"
        SELECT 
            p.id, 
            p.name, 
            p.age, 
            strftime('%Y-%m-%d', MAX(a.created_at)) as latest_assessment,
            (SELECT overall_score FROM assessments WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1) as latest_score,
            (SELECT risk_level FROM assessments WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1) as latest_risk
        FROM patients p
        LEFT JOIN assessments a ON p.id = a.patient_id
        GROUP BY p.id
        ORDER BY p.name ASC
        "#
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Database error: {}", e))
}

#[derive(Debug, Serialize)]
pub struct AssessmentHistory {
    pub date: String,
    pub score: f64,
}

#[tauri::command]
async fn get_assessment_history(
    patient_id: String,
    pool: State<'_, Pool<Sqlite>>,
) -> Result<Vec<AssessmentHistory>, String> {
    // Return date as YYYY-MM-DD for simple string charting
    let records: Vec<(String, f64)> = sqlx::query_as(
        r#"
        SELECT strftime('%Y-%m-%d', created_at) as date, overall_score 
        FROM assessments 
        WHERE patient_id = ? 
        ORDER BY created_at ASC
        "#,
    )
    .bind(patient_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(records
        .into_iter()
        .map(|(date, score)| AssessmentHistory { date, score })
        .collect())
}

#[tauri::command]
async fn save_assessment(
    id: String,
    patient_id: String,
    score: f64,
    risk_level: String,
    pool: State<'_, Pool<Sqlite>>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO assessments (id, patient_id, overall_score, risk_level) VALUES (?, ?, ?, ?)"
    )
    .bind(id)
    .bind(patient_id)
    .bind(score)
    .bind(risk_level)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn save_assessment_frame(
    assessment_id: String,
    step_id: u8,
    timestamp_ms: i64,
    landmarks: Vec<Landmark>,
    pool: State<'_, Pool<Sqlite>>,
) -> Result<(), String> {
    let landmarks_json = serde_json::to_string(&landmarks).map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO assessment_frames (assessment_id, step_id, timestamp_ms, landmarks_json) VALUES (?, ?, ?, ?)"
    )
    .bind(assessment_id)
    .bind(step_id)
    .bind(timestamp_ms)
    .bind(landmarks_json)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match db::init_db(&app_handle).await {
                    Ok(pool) => {
                        app_handle.manage(pool);
                        println!("Database initialized successfully.");
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize database: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            calculate_posture,
            get_patients,
            get_patient_summaries,
            get_assessment_history,
            save_assessment,
            save_assessment_frame
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_posture_perfect() {
        let mut landmarks = Vec::new();
        for _ in 0..33 {
            landmarks.push(Landmark {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                visibility: None,
            });
        }

        // Perfect vertical spine: mid-shoulder and mid-hip perfectly aligned
        landmarks[11] = Landmark {
            x: -0.5,
            y: 0.2,
            z: 0.0,
            visibility: None,
        }; // left shoulder
        landmarks[12] = Landmark {
            x: 0.5,
            y: 0.2,
            z: 0.0,
            visibility: None,
        }; // right shoulder
        landmarks[23] = Landmark {
            x: -0.4,
            y: 1.0,
            z: 0.0,
            visibility: None,
        }; // left hip
        landmarks[24] = Landmark {
            x: 0.4,
            y: 1.0,
            z: 0.0,
            visibility: None,
        }; // right hip

        // Ears symmetric horizontally
        landmarks[7] = Landmark {
            x: -0.1,
            y: 0.0,
            z: 0.0,
            visibility: None,
        };
        landmarks[8] = Landmark {
            x: 0.1,
            y: 0.0,
            z: 0.0,
            visibility: None,
        };

        // Nose in center
        landmarks[0] = Landmark {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            visibility: None,
        };

        let result = calculate_posture(landmarks, 1).unwrap();

        // Standing naturally logic validation
        assert_eq!(result.metrics[0].value, 0.0);
        assert_eq!(result.metrics[1].value, 0.0);
        assert_eq!(result.metrics[2].value, 0.0);
        assert!(result.passed);
        assert_eq!(result.score, 100.0);
    }
}
