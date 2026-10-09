import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoadingState } from "../components/States";

export function ProtectedRoute() {
  const { token, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <LoadingState label="Checking your session…" />;
  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
