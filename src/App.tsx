import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Assessment from "./pages/Assessment";
import DashboardLayout from "./layouts/DashboardLayout";
import Home from "./pages/Home";
import Progress from "./pages/Progress";
import Exercises from "./pages/Exercises";
import Profile from "./pages/Profile";
import DoctorDashboard from "./pages/DoctorDashboard";
import TelehealthConsultation from "./pages/TelehealthConsultation";
import PatientTelehealth from "./pages/PatientTelehealth";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import "./App.css";

const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode, allowedRole?: 'Doctor' | 'Patient' }) => {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f2f2f7]">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && profile && profile.role !== allowedRole) {
    return <Navigate to={profile.role === 'Doctor' ? '/doctor-dashboard' : '/dashboard/home'} replace />;
  }

  return <>{children}</>;
};

const SplashRemover = () => {
  const { isLoading } = useAuth();
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!isLoading && !removed) {
      const splash = document.getElementById('mobivia-splash');
      if (splash) {
        // Fade out
        splash.style.opacity = '0';
        setTimeout(() => {
          // Remove from DOM flow
          splash.style.display = 'none';
          setRemoved(true);
        }, 600);
      }
    }
  }, [isLoading, removed]);

  return null;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SplashRemover />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Doctor Protected Routes */}
          <Route path="/doctor-dashboard" element={
            <ProtectedRoute allowedRole="Doctor">
              <DoctorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/doctor-telehealth/:patientId?" element={
            <ProtectedRoute allowedRole="Doctor">
              <TelehealthConsultation />
            </ProtectedRoute>
          } />

          {/* Patient Protected Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRole="Patient">
              <DashboardLayout />
            </ProtectedRoute>
          }>
            <Route path="" element={<Navigate to="home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="assessment" element={<Assessment />} />
            <Route path="telehealth" element={<PatientTelehealth />} />
            <Route path="progress" element={<Progress />} />
            <Route path="exercises" element={<Exercises />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
