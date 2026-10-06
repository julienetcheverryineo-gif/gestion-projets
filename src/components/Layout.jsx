import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ecouterNotificationsPremierPlan } from "../lib/push";
import NotificationsBell from "./NotificationsBell";
import ImportSapAuto from "./ImportSapAuto";
import logoIneo from "../assets/logo-ineo.png";

const NAV_ITEMS_AUTOMATISME = [
  { to: "/", label: "Vue d'ensemble", end: true, icone: "🏠" },
  { to: "/chantiers", label: "Chantiers", icone: "🏗️" },
  { to: "/taches", label: "Tâches", icone: "✅" },
  { to: "/planning", label: "Planning", icone: "📅" },
  { to: "/reserves", label: "Réserves", icone: "🧰" },
  { to: "/notes", label: "Notes", icone: "📝" },
  { to: "/aide", label: "Aide", icone: "❓" },
];

// L'espace Électricité est réservé à l'administrateur et au RA
// Électricité (qui peuvent basculer librement entre les deux espaces,
// voir les boutons du pied de menu) ; les autres profils n'y ont pas
// accès et restent sur l'Automatisme & GTB.
const NAV_ITEMS_ELECTRICITE = [
  { to: "/electricite", label: "Chantiers", end: true, icone: "🏗️" },
  { to: "/electricite/plan-de-charge", label: "Plan de charge", icone: "📊" },
  { to: "/electricite/import-sap", label: "Import SAP", icone: "📥" },
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

// Boutons précédent/suivant dans le pied de menu : l'appli tourne en
// PWA installée (pas de chrome navigateur, donc pas de bouton retour),
// d'où le besoin d'un équivalent interne. React Router ne donne pas
// directement "peut-on reculer/avancer", donc on reconstruit sa propre
// pile à partir de location.key (identifiant stable fourni par la
// librairie "history" : une même page, visitée via précédent/suivant,
// garde la même clé — ce qui permet de distinguer un retour en arrière
// d'une navigation vers une page réellement nouvelle).
function useHistoriqueNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const pileRef = useRef([]);
  const indexRef = useRef(-1);
  const [peutReculer, setPeutReculer] = useState(false);
  const [peutAvancer, setPeutAvancer] = useState(false);

  useEffect(() => {
    const pile = pileRef.current;
    const indexExistant = pile.indexOf(location.key);
    if (indexExistant !== -1) {
      // Retrouve une entrée déjà connue : c'est un retour (précédent)
      // ou une avance (suivant), pas une nouvelle navigation.
      indexRef.current = indexExistant;
    } else {
      // Nouvelle page : tronque ce qui suivait la position actuelle
      // (on ne peut plus "avancer" vers l'ancienne suite une fois
      // qu'on est reparti sur une nouvelle branche) puis l'empile.
      pile.splice(indexRef.current + 1);
      pile.push(location.key);
      indexRef.current = pile.length - 1;
    }
    setPeutReculer(indexRef.current > 0);
    setPeutAvancer(indexRef.current < pile.length - 1);
  }, [location.key]);

  return {
    peutReculer,
    peutAvancer,
    reculer: () => navigate(-1),
    avancer: () => navigate(1),
  };
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
  const location = useLocation();
  const [reduite, setReduite] = useState(chargerSidebarReduite);
  const { peutReculer, peutAvancer, reculer, avancer } = useHistoriqueNavigation();

  const estRAElectricite = profile?.role === "ra_electricite";
  // Administrateur et RA Électricité peuvent basculer librement entre les
  // deux espaces (boutons dans le pied de menu) ; les autres profils
  // restent cantonnés à l'Automatisme & GTB, comme avant.
  const peutBasculerEspaces = isAdmin || estRAElectricite;
  const enEspaceElectricite = location.pathname.startsWith("/electricite");

  // Démarre l'écoute des notifications push reçues au premier plan (onglet
  // ouvert) une seule fois, pour toute la durée de la session connectée.
  // Avant le "return" conditionnel ci-dessous : les Hooks doivent être
  // appelés dans le même ordre à chaque rendu.
  useEffect(() => {
    ecouterNotificationsPremierPlan();
  }, []);

  if (enEspaceElectricite && !peutBasculerEspaces) {
    return <Navigate to="/" replace />;
  }

  const navItems = enEspaceElectricite ? NAV_ITEMS_ELECTRICITE : NAV_ITEMS_AUTOMATISME;

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
            <div style={{ flex: 1 }}>
              <div className="brand-title">Pilotage</div>
              <div className="brand-subtitle">
                {enEspaceElectricite ? "Électricité" : "Automatisme & GTB"}
              </div>
            </div>
          )}
          <NotificationsBell />
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
          {navItems.map((item) => (
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
          {isAdmin && !enEspaceElectricite && (
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
          {isAdmin && !enEspaceElectricite && (
            <NavLink
              to="/statistiques"
              title={reduite ? "Statistiques" : undefined}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link-active" : "")
              }
            >
              <span className="nav-link-icone" aria-hidden="true">
                📊
              </span>
              {!reduite && <span className="nav-link-texte">Statistiques</span>}
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-historique">
            <button
              type="button"
              className="btn-ghost btn-historique"
              onClick={reculer}
              disabled={!peutReculer}
              title="Page précédente"
              aria-label="Page précédente"
            >
              {reduite ? "←" : "← Préc."}
            </button>
            <button
              type="button"
              className="btn-ghost btn-historique"
              onClick={avancer}
              disabled={!peutAvancer}
              title="Page suivante"
              aria-label="Page suivante"
            >
              {reduite ? "→" : "Suiv. →"}
            </button>
          </div>
          {!reduite && (
            <div className="user-chip">
              <span className="user-role-dot" data-role={profile?.role} />
              <div>
                <div className="user-name">{profile?.nom}</div>
                <div className="user-role">{formatRole(profile?.role)}</div>
              </div>
            </div>
          )}
          {peutBasculerEspaces && (
            <button
              className={"btn-ghost" + (!enEspaceElectricite ? " btn-espace-actif" : "")}
              onClick={() => navigate("/")}
              disabled={!enEspaceElectricite}
              title="Basculer vers l'espace Automatisme & GTB"
            >
              {reduite ? "💻" : "💻 Automatisme & GTB"}
            </button>
          )}
          {peutBasculerEspaces && (
            <button
              className={"btn-ghost" + (enEspaceElectricite ? " btn-espace-actif" : "")}
              onClick={() => navigate("/electricite")}
              disabled={enEspaceElectricite}
              title="Basculer vers l'espace Électricité"
            >
              {reduite ? "⚡" : "⚡ Électricité"}
            </button>
          )}
          <button
            className="btn-ghost btn-refresh sidebar-refresh"
            onClick={actualiserSansCache}
            aria-label="Actualiser"
            title="Actualiser"
          >
            {reduite ? "⟳" : "⟳ Actualiser"}
          </button>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn-ghost btn-historique"
              onClick={reculer}
              disabled={!peutReculer}
              aria-label="Page précédente"
              title="Page précédente"
            >
              ←
            </button>
            <button
              type="button"
              className="btn-ghost btn-historique"
              onClick={avancer}
              disabled={!peutAvancer}
              aria-label="Page suivante"
              title="Page suivante"
            >
              →
            </button>
            <NotificationsBell />
            {peutBasculerEspaces && (
              <button
                className="btn-ghost"
                onClick={() => navigate(enEspaceElectricite ? "/" : "/electricite")}
                aria-label={
                  enEspaceElectricite
                    ? "Basculer vers l'espace Automatisme & GTB"
                    : "Basculer vers l'espace Électricité"
                }
                title={
                  enEspaceElectricite
                    ? "Basculer vers l'espace Automatisme & GTB"
                    : "Basculer vers l'espace Électricité"
                }
              >
                {enEspaceElectricite ? "💻 Autom." : "⚡ Élec."}
              </button>
            )}
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
      <ImportSapAuto />
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
    case "ra_electricite":
      return "RA Électricité";
    default:
      return role ?? "";
  }
}
