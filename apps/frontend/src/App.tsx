import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomeRouter from "./pages/HomeRouter";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import ReceptionPage from "./pages/ReceptionPage";
import MedicalPage from "./pages/MedicalPage";
import DisplayPage from "./pages/DisplayPage";
import TotemPage from "./pages/TotemPage";
import { getStoredUser } from "./auth/storage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = getStoredUser();
  const role = String(user?.role || "").trim().toLowerCase();
  if (!role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRouter />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
      <Route path="/reception" element={<RequireAuth><ReceptionPage /></RequireAuth>} />
      <Route path="/medical" element={<RequireAuth><MedicalPage /></RequireAuth>} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/totem" element={<TotemPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

