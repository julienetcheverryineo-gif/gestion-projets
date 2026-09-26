import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import logoIneo from "../assets/logo-ineo.png";

const NAV_ITEMS = [
  { to: "/", label: "Vue d'ensemble", end: true },
  { to: "/chantiers", label: "Chantiers" },
  { to: "/taches", label: "Tâches" },
  { to: "/planning", label: "Planning" },
  { to: "/reserves", label: "Réserves" },
];

// Un simple reload() peut resservir une version en cache (c'est ce qui
// obligeait à quitter/rouvrir l'app sur iPad pour voir les mises à jour).
// On force un vrai aller-retour réseau en ajoutant un paramètre unique à
// l'URL : impossible pour le navigateur de répondre depuis son cache.
function actualiserSansCache() {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.href = url.toString();
}

const CLE_SIDEBAR_REDUITE = "sidebarReduite";

function chargerSidebarReduite() {
  try {
    return localStorage.getItem(CLE_SIDEBAR_REDUITE) === "1";
  } catch {
    return false;
  }
}

export default function Layout() {
  const { profile, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [reduite, setReduite] = useState(chargerSidebarReduite);

  const handleLogout = async () => {
    await logout();
    navigate("/connexion");
  };

  const basculerSidebar = () => {
    setReduite((prev) => {
      const nouvelle = !prev;
      try {
        localStorage.setItem(CLE_SIDEBAR_REDUITE, nouvelle ? "1" : "0");
      } catch {
        // stockage indisponible : la préférence ne sera juste pas mémorisée
      }
      return nouvelle;
    });
  };

  return (
    <div className={"app-shell" + (reduite ? " app-shell-sidebar-reduite" : "")}>
      <aside className={"sidebar" + (reduite ? " sidebar-reduite" : "")}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={basculerSidebar}
          aria-label={reduite ? "Déplier le menu" : "Réduire le menu"}
          title={reduite ? "Déplier le menu" : "Réduire le menu"}
        >
          {reduite ? "»" : "«"}
        </button>

        <div className="sidebar-brand">
          <div className="logo-chip">
            <img src={logoIneo} alt="INEO — une marque d'EQUANS" />
          </div>
          {!reduite && (
            <div>
              <div className="brand-title">Pilotage</div>
              <div className="brand-subtitle">Automatisme &amp; GTB</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={reduite ? item.label : undefined}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link-active" : "")
              }
            >
              {reduite ? item.label.slice(0, 1) : item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/utilisateurs"
              title={reduite ? "Utilisateurs" : undefined}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link-active" : "")
              }
            >
              {reduite ? "U" : "Utilisateurs"}
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            className="btn-ghost btn-refresh sidebar-refresh"
            onClick={actualiserSansCache}
            aria-label="Actualiser"
            title="Actualiser"
          >
            {reduite ? "⟳" : "⟳ Actualiser"}
          </button>
          {!reduite && (
            <div className="user-chip">
              <span className="user-role-dot" data-role={profile?.role} />
              <div>
                <div className="user-name">{profile?.nom}</div>
                <div className="user-role">{formatRole(profile?.role)}</div>
              </div>
            </div>
          )}
          <button className="btn-ghost" onClick={handleLogout} title="Se déconnecter">
            {reduite ? "⏻" : "Se déconnecter"}
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
              onClick={actualiserSansCache}
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
