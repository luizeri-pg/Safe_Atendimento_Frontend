import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomeRouter from "./pages/HomeRouter";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import ReceptionPage from "./pages/ReceptionPage";
import MedicalPage from "./pages/MedicalPage";
import DisplayPage from "./pages/DisplayPage";
import TotemPage from "./pages/TotemPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRouter />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/reception" element={<ReceptionPage />} />
      <Route path="/medical" element={<MedicalPage />} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/totem" element={<TotemPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

