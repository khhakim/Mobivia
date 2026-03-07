import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Assessment from "./pages/Assessment";
import DashboardLayout from "./layouts/DashboardLayout";
import Home from "./pages/Home";
import Progress from "./pages/Progress";
import Exercises from "./pages/Exercises";
import Profile from "./pages/Profile";
import DoctorDashboard from "./pages/DoctorDashboard";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route path="" element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="assessment" element={<Assessment />} />
          <Route path="progress" element={<Progress />} />
          <Route path="exercises" element={<Exercises />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
