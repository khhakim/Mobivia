import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Assessment from "./pages/Assessment";
import DashboardLayout from "./layouts/DashboardLayout";
import Home from "./pages/Home";
import Progress from "./pages/Progress";
import Exercises from "./pages/Exercises";
import Profile from "./pages/Profile";
import DoctorDashboard from "./pages/DoctorDashboard";
import TelehealthConsultation from "./pages/TelehealthConsultation";
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Doctor Protected Routes */}
          <Route path="/doctor-dashboard" element={
            <ProtectedRoute allowedRole="Doctor">
              <DoctorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/doctor-telehealth" element={
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
