import { Navigate } from "react-router-dom";
import { getStoredUser } from "../auth/storage";

export default function HomeRouter() {
  const user = getStoredUser();
  const role = String(user?.role || "").trim().toLowerCase();
  if (!role) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
}

