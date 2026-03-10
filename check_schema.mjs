import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function checkSchema() {
    let envFile = '';
    try {
        envFile = fs.readFileSync('.env', 'utf8');
    } catch (e) { }

    let supabaseUrl = '';
    let supabaseKey = '';
    envFile.split('\n').forEach(line => {
        if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
        if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
    });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.from('assessment_frames').select('*').limit(1);
    console.log("Frames schema:", data ? Object.keys(data[0] || {}) : error);

    const { data: stepData, error: stepError } = await supabase.from('assessment_steps').select('*').limit(1);
    console.log("Steps schema:", stepData ? Object.keys(stepData[0] || {}) : stepError);
}
checkSchema();
