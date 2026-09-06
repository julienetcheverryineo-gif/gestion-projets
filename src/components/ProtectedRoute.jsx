import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="page-loading">Chargement…</div>;
  }

  if (!user) {
    return <Navigate to="/connexion" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (!profile) {
    return <div className="page-loading">Chargement du profil…</div>;
  }

  return children;
}
