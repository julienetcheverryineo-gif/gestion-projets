import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import logoIneo from "../assets/logo-ineo.png";

const NAV_ITEMS = [
  { to: "/", label: "Vue d'ensemble", end: true },
  { to: "/chantiers", label: "Chantiers" },
  { to: "/taches", label: "Tâches" },
  { to: "/plan-de-charge", label: "Plan de charge" },
];

export default function Layout() {
  const { profile, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/connexion");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-chip">
            <img src={logoIneo} alt="INEO — une marque d'EQUANS" />
          </div>
          <div>
            <div className="brand-title">Pilotage</div>
            <div className="brand-subtitle">Automatisme &amp; GTB</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link-active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/utilisateurs"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link-active" : "")
              }
            >
              Utilisateurs
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-role-dot" data-role={profile?.role} />
            <div>
              <div className="user-name">{profile?.nom}</div>
              <div className="user-role">{formatRole(profile?.role)}</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={handleLogout}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-topbar">
          <div className="logo-chip logo-chip-sm">
            <img src={logoIneo} alt="INEO — une marque d'EQUANS" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-ghost btn-refresh"
              onClick={() => window.location.reload()}
              aria-label="Actualiser"
            >
              ⟳ Actualiser
            </button>
            <button className="btn-ghost" onClick={handleLogout} aria-label="Se déconnecter">
              Déconnexion
            </button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function formatRole(role) {
  switch (role) {
    case "admin":
      return "Administrateur";
    case "chef_de_projet":
      return "Chef de projet";
    case "automaticien":
      return "Automaticien";
    case "electricien":
      return "Électricien";
    default:
      return role ?? "";
  }
}
