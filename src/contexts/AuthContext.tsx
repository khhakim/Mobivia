import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

type Profile = {
    id: string;
    role: 'Doctor' | 'Patient';
    full_name: string | null;
    age: number | null;
    phone: string | null;
    location: string | null;
};

type AuthContextType = {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    signOut: () => Promise<void>;
    isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                if (!mounted) return;

                setSession(newSession);
                setUser(newSession?.user ?? null);

                if (newSession?.user) {
                    await fetchProfile(newSession.user.id, newSession.user.user_metadata);
                } else {
                    setProfile(null);
                }

                setIsLoading(false);
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const fetchProfile = async (userId: string, userMeta?: any) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error && error.code === 'PGRST116') {
                // The trigger might have failed. Let's do a fallback insert from the frontend.
                if (userMeta) {
                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('profiles')
                        .insert([{ id: userId, role: userMeta.role || 'Patient', full_name: userMeta.full_name || '' }])
                        .select()
                        .single();
                    if (!fallbackError && fallbackData) {
                        setProfile(fallbackData);
                        return;
                    } else {
                        console.error('Fallback profile creation failed:', fallbackError);
                    }
                }
            } else if (!error) {
                setProfile(data);
            } else {
                console.error('Error fetching profile:', error);
            }
        } catch (error) {
            console.error('Error in profile routine:', error);
        }
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <AuthContext.Provider value={{ session, user, profile, signOut, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
