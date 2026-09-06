import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Vue d'ensemble", end: true },
  { to: "/projets", label: "Projets" },
  { to: "/taches", label: "Tâches" },
  { to: "/temps", label: "Suivi de temps" },
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
          <span className="brand-mark" aria-hidden="true" />
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
    case "technicien":
      return "Technicien";
    default:
      return role ?? "";
  }
}
