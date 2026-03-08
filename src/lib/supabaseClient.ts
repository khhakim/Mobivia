import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjgoifspyowdwnzpjunp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqZ29pZnNweW93ZHduenBqdW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDg2OTgsImV4cCI6MjA4ODQ4NDY5OH0.Apod0pDrsmX4aeiwMzWD5WI0KXjGRYxgxzA-nNe7Ljk';

// In-memory lock to avoid 'AbortError: Lock broken' issues with Tauri/React StrictMode
// The native navigator.lock gets orphaned on hot reloads, breaking Supabase Auth
const locks: Record<string, Promise<any>> = {};
const memoryLock = async <R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
    const previousLock = locks[name] || Promise.resolve();
    const newLock = (async () => {
        await previousLock.catch(() => { }); // wait for previous
        return await fn();
    })();
    locks[name] = newLock;
    return await newLock;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        lock: memoryLock,
    }
});
