import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import NotesPanel from "./NotesPanel";
import logoIneo from "../assets/logo-ineo.png";

const NAV_ITEMS = [
  { to: "/", label: "Vue d'ensemble", end: true, icone: "🏠" },
  { to: "/chantiers", label: "Chantiers", icone: "🏗️" },
  { to: "/taches", label: "Tâches", icone: "✅" },
  { to: "/planning", label: "Planning", icone: "📅" },
  { to: "/reserves", label: "Réserves", icone: "🧰" },
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
  const [notesOuvertes, setNotesOuvertes] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/connexion");
  };

  // Bascule le repli du menu, puis — une fois la transition de largeur
  // terminée — remet à zéro le défilement horizontal des zones larges
  // (Gantt du Planning, tableaux) qui pourraient être scrollées : l'espace
  // gagné (ou repris) doit se voir tout de suite, sans que l'utilisateur
  // ait à retoucher la barre de défilement pour recadrer la vue.
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
    window.setTimeout(() => {
      document.querySelectorAll(".hscroll-auto, .data-table-wrapper").forEach((el) => {
        el.scrollLeft = 0;
      });
      window.dispatchEvent(new Event("resize"));
    }, 180);
  };

  return (
    <div className={"app-shell" + (reduite ? " app-shell-sidebar-reduite" : "")}>
      <aside className={"sidebar" + (reduite ? " sidebar-reduite" : "")}>
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

        <button
          type="button"
          className="sidebar-toggle"
          onClick={basculerSidebar}
          aria-label={reduite ? "Déplier le menu" : "Réduire le menu"}
          title={reduite ? "Déplier le menu" : "Réduire le menu"}
        >
          <span className="sidebar-toggle-icone">{reduite ? "»" : "«"}</span>
          {!reduite && <span className="sidebar-toggle-texte">Réduire le menu</span>}
        </button>

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
              <span className="nav-link-icone" aria-hidden="true">
                {item.icone}
              </span>
              {!reduite && <span className="nav-link-texte">{item.label}</span>}
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
              <span className="nav-link-icone" aria-hidden="true">
                👤
              </span>
              {!reduite && <span className="nav-link-texte">Utilisateurs</span>}
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

      {/* Notes générales : pas liées à un chantier, accessibles depuis
          n'importe quelle page via cet onglet fixé au bord droit de
          l'écran, plutôt qu'une page dédiée dans le menu de gauche. */}
      <button
        type="button"
        className="notes-generales-onglet"
        onClick={() => setNotesOuvertes((o) => !o)}
      >
        Notes
      </button>
      {notesOuvertes && (
        <div className="notes-generales-fond" onClick={() => setNotesOuvertes(false)} />
      )}
      <aside
        className={"notes-generales-panneau" + (notesOuvertes ? " notes-generales-panneau-ouvert" : "")}
      >
        <div className="notes-generales-entete">
          <h2>Notes générales</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setNotesOuvertes(false)}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <NotesPanel texteVide="Aucune note générale pour l'instant." />
      </aside>
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
