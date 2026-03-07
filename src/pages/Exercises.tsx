import { useState } from "react";
import {
    Dumbbell, Clock, ChevronRight, Play, Star, Flame, Filter,
    Wind, Zap, Shield, Heart, CheckCircle2
} from "lucide-react";

type Category = "All" | "Flexibility" | "Strength" | "Balance" | "Cardio";

interface Exercise {
    id: number;
    title: string;
    description: string;
    duration: string;
    difficulty: "Beginner" | "Intermediate" | "Advanced";
    category: Exclude<Category, "All">;
    reps?: string;
    muscles: string[];
    featured?: boolean;
}

const exercises: Exercise[] = [
    {
        id: 1, title: "Hip Flexor Stretch", featured: true,
        description: "Gently open up the hip flexors to reduce stiffness and improve walking gait.",
        duration: "8 min", difficulty: "Beginner", category: "Flexibility", reps: "3 × 30s holds",
        muscles: ["Hip Flexors", "Quads", "Lower Back"],
    },
    {
        id: 2, title: "Seated Leg Press",
        description: "Build lower body strength while remaining seated, ideal for early-stage rehab.",
        duration: "12 min", difficulty: "Intermediate", category: "Strength", reps: "3 × 12 reps",
        muscles: ["Quads", "Hamstrings", "Glutes"],
    },
    {
        id: 3, title: "Single-Leg Balance",
        description: "Improve proprioception and ankle stability for safer daily movement.",
        duration: "6 min", difficulty: "Beginner", category: "Balance", reps: "3 × 30s each side",
        muscles: ["Tibialis", "Calves", "Core"],
    },
    {
        id: 4, title: "Shoulder Pendulum",
        description: "Gentle circular motion to restore shoulder range of motion after stiffness.",
        duration: "5 min", difficulty: "Beginner", category: "Flexibility", reps: "2 × 20 circles",
        muscles: ["Rotator Cuff", "Deltoid"],
    },
    {
        id: 5, title: "Resistance Band Row",
        description: "Strengthen the upper back and improve posture alignment using a resistance band.",
        duration: "10 min", difficulty: "Intermediate", category: "Strength", reps: "4 × 15 reps",
        muscles: ["Rhomboids", "Lats", "Biceps"],
    },
    {
        id: 6, title: "Tandem Walk",
        description: "Walk heel-to-toe in a straight line to challenge coordination and dynamic balance.",
        duration: "7 min", difficulty: "Intermediate", category: "Balance", reps: "5 × 10m walks",
        muscles: ["Core", "Hip Abductors", "Ankles"],
    },
    {
        id: 7, title: "Chair Yoga Flow",
        description: "A gentle full-body stretch sequence designed to be done in or near a chair.",
        duration: "15 min", difficulty: "Beginner", category: "Flexibility", reps: "1 full flow",
        muscles: ["Full Body"],
    },
    {
        id: 8, title: "Marching in Place",
        description: "Light cardio to elevate heart rate and improve hip flexion for walking.",
        duration: "10 min", difficulty: "Beginner", category: "Cardio", reps: "3 × 2 min",
        muscles: ["Hip Flexors", "Core", "Calves"],
    },
    {
        id: 9, title: "Wall Squat",
        description: "Build lower body endurance by holding a static squat against the wall.",
        duration: "8 min", difficulty: "Intermediate", category: "Strength", reps: "4 × 30s holds",
        muscles: ["Quads", "Glutes", "Core"],
    },
];

const categories: { label: Category; icon: React.ReactNode; color: string; active: string }[] = [
    { label: "All", icon: <Filter size={14} />, color: "bg-slate-100 text-slate-600 border-slate-200", active: "bg-indigo-600 text-white border-indigo-600" },
    { label: "Flexibility", icon: <Wind size={14} />, color: "bg-sky-50 text-sky-600 border-sky-100", active: "bg-sky-500 text-white border-sky-500" },
    { label: "Strength", icon: <Dumbbell size={14} />, color: "bg-indigo-50 text-indigo-600 border-indigo-100", active: "bg-indigo-600 text-white border-indigo-600" },
    { label: "Balance", icon: <Shield size={14} />, color: "bg-emerald-50 text-emerald-600 border-emerald-100", active: "bg-emerald-500 text-white border-emerald-500" },
    { label: "Cardio", icon: <Heart size={14} />, color: "bg-rose-50 text-rose-600 border-rose-100", active: "bg-rose-500 text-white border-rose-500" },
];

const difficultyColors: Record<Exercise["difficulty"], string> = {
    Beginner: "text-emerald-600 bg-emerald-50 border-emerald-100",
    Intermediate: "text-amber-600 bg-amber-50 border-amber-100",
    Advanced: "text-rose-600 bg-rose-50 border-rose-100",
};

const categoryIcons: Record<Exclude<Category, "All">, React.ReactNode> = {
    Flexibility: <Wind size={16} />,
    Strength: <Dumbbell size={16} />,
    Balance: <Shield size={16} />,
    Cardio: <Heart size={16} />,
};

const categoryColors: Record<Exclude<Category, "All">, string> = {
    Flexibility: "bg-sky-50 text-sky-500",
    Strength: "bg-indigo-50 text-indigo-500",
    Balance: "bg-emerald-50 text-emerald-500",
    Cardio: "bg-rose-50 text-rose-500",
};

export default function Exercises() {
    const [activeCategory, setActiveCategory] = useState<Category>("All");
    const [completedIds, setCompletedIds] = useState<number[]>([]);

    const filtered = exercises.filter(e => activeCategory === "All" || e.category === activeCategory);
    const featured = exercises.find(e => e.featured);

    const toggleComplete = (id: number) => {
        setCompletedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header */}
            <header>
                <p className="text-sky-600 font-medium mb-1 tracking-wide uppercase text-sm">Your Recovery Plan</p>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Exercise Library</h1>
                <p className="text-slate-500 mt-2 text-lg">Tailored exercises to restore your mobility and strength.</p>
            </header>

            {/* Featured Exercise Banner */}
            {featured && (
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500 text-white shadow-[0_8px_30px_rgb(99,102,241,0.35)]">
                    <div className="absolute top-0 right-0 -translate-y-8 translate-x-1/3 w-72 h-72 bg-white opacity-10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/4 w-48 h-48 bg-sky-900 opacity-20 rounded-full blur-2xl" />
                    <div className="relative p-7 md:p-9 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex-1">
                            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-medium mb-4">
                                <Star size={14} className="fill-white" />
                                Today's Recommended
                            </div>
                            <h2 className="text-2xl font-bold mb-2">{featured.title}</h2>
                            <p className="text-indigo-100 text-base max-w-md">{featured.description}</p>
                            <div className="flex flex-wrap gap-3 mt-4">
                                <span className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm"><Clock size={14} />{featured.duration}</span>
                                <span className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm"><Zap size={14} />{featured.reps}</span>
                                <span className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm"><Flame size={14} />{featured.difficulty}</span>
                            </div>
                        </div>
                        <button className="group flex items-center gap-3 bg-white text-indigo-600 px-7 py-4 rounded-2xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 flex-shrink-0">
                            <Play size={22} className="fill-indigo-600" />
                            Start Exercise
                        </button>
                    </div>
                </div>
            )}

            {/* Progress summary strip */}
            <div className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex-1">
                    <div className="flex justify-between mb-1.5">
                        <span className="text-slate-600 text-sm font-medium">Daily Goal</span>
                        <span className="text-indigo-600 text-sm font-bold">{completedIds.length} / 3 done</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                            className="h-2.5 rounded-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-700"
                            style={{ width: `${Math.min((completedIds.length / 3) * 100, 100)}%` }}
                        />
                    </div>
                </div>
                {completedIds.length >= 3 && (
                    <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-bold bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
                        <CheckCircle2 size={16} /> Goal Reached!
                    </div>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                    <button
                        key={cat.label}
                        onClick={() => setActiveCategory(cat.label)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${activeCategory === cat.label ? cat.active : cat.color} hover:scale-105`}
                    >
                        {cat.icon}
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Exercise Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map(exercise => {
                    const isCompleted = completedIds.includes(exercise.id);
                    return (
                        <div
                            key={exercise.id}
                            className={`bg-white rounded-3xl p-5 shadow-sm border transition-all duration-300 flex flex-col gap-4 group hover:shadow-lg hover:-translate-y-0.5 ${isCompleted ? "border-emerald-200 bg-emerald-50/30" : "border-slate-100"}`}
                        >
                            {/* Card Header */}
                            <div className="flex items-start justify-between">
                                <div className={`w-11 h-11 rounded-2xl ${categoryColors[exercise.category]} flex items-center justify-center flex-shrink-0`}>
                                    {categoryIcons[exercise.category]}
                                </div>
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${difficultyColors[exercise.difficulty]}`}>
                                    {exercise.difficulty}
                                </span>
                            </div>

                            {/* Title & Description */}
                            <div>
                                <h3 className="text-base font-bold text-slate-800 mb-1">{exercise.title}</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">{exercise.description}</p>
                            </div>

                            {/* Metadata */}
                            <div className="flex gap-3 text-xs text-slate-500 font-medium flex-wrap">
                                <span className="flex items-center gap-1"><Clock size={12} />{exercise.duration}</span>
                                {exercise.reps && <span className="flex items-center gap-1"><Zap size={12} />{exercise.reps}</span>}
                            </div>

                            {/* Muscles */}
                            <div className="flex flex-wrap gap-1.5">
                                {exercise.muscles.map(m => (
                                    <span key={m} className="bg-slate-100 text-slate-600 text-xs rounded-full px-2.5 py-1 font-medium">{m}</span>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 mt-auto pt-1">
                                <button
                                    onClick={() => toggleComplete(exercise.id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${isCompleted ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md"}`}
                                >
                                    {isCompleted ? <><CheckCircle2 size={16} /> Done!</> : <><Play size={14} className="fill-white" /> Start</>}
                                </button>
                                <button className="flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors">
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
