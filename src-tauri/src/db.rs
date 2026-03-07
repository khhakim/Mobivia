use sqlx::{sqlite::{SqlitePoolOptions, SqliteConnectOptions}, Pool, Sqlite};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub async fn init_db(app: &AppHandle) -> Result<Pool<Sqlite>, String> {
    // Get the app data directory
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    // Ensure the directory exists
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    let db_path = app_dir.join("mobivia.db");
    
    let connect_options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    // Connect to the database (creates the file if it doesn't exist)
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await
        .map_err(|e| format!("Failed to connect to SQLite database: {}", e))?;

    // Initialize Schema
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS assessments (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            overall_score REAL NOT NULL,
            risk_level TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );

        CREATE TABLE IF NOT EXISTS assessment_steps (
            id TEXT PRIMARY KEY,
            assessment_id TEXT NOT NULL,
            step_id INTEGER NOT NULL,
            score REAL NOT NULL,
            metrics_json TEXT NOT NULL,
            FOREIGN KEY (assessment_id) REFERENCES assessments(id)
        );

        CREATE TABLE IF NOT EXISTS assessment_frames (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assessment_id TEXT NOT NULL,
            step_id INTEGER NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            landmarks_json TEXT NOT NULL,
            FOREIGN KEY (assessment_id) REFERENCES assessments(id)
        );
        "#
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to initialize database schema: {}", e))?;

    // Seed a mock patient if none exist (for development)
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM patients")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    if count.0 == 0 {
        sqlx::query(
            "INSERT INTO patients (id, name, age) VALUES ('MBV-8821', 'Sarah Jenkins', 68)"
        )
        .execute(&pool)
        .await
        .ok();
    }

    Ok(pool)
}
