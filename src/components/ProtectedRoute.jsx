import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// `blockClient` protège toutes les pages "normales" (Layout + son contenu) :
// un compte client n'y a pas sa place (autres chantiers, autres données
// internes visibles via la navigation), il est renvoyé vers son espace
// dédié. `requireClient` fait l'inverse pour cet espace dédié : les autres
// profils n'ont rien à y faire et repartent vers le tableau de bord normal.
export default function ProtectedRoute({
  children,
  requireAdmin = false,
  blockClient = false,
  requireClient = false,
}) {
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

  if (blockClient && profile.role === "client") {
    return <Navigate to="/espace-client" replace />;
  }

  if (requireClient && profile.role !== "client") {
    return <Navigate to="/" replace />;
  }

  return children;
}
