import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { forcerVueComplete } from "../../lib/telephone";
import { Feuille, FeuilleSynchro, PuceSynchro, ToastHost } from "./Ui";
import { IcAccueil, IcChantiers, IcMenu, IcTaches } from "./Icones";

const ROLES = {
  admin: "Administrateur",
  chef_de_projet: "Chef de projet",
  automaticien: "Automaticien",
  electricien: "Électricien",
  ra_electricite: "RA Électricité",
};
const TITRES = {
  "/planning": "Planning",
  "/reserves": "Réserves",
  "/notes": "Notes",
  "/aide": "Aide",
  "/utilisateurs": "Utilisateurs",
  "/statistiques": "Statistiques",
};

function actualiser() {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.href = url.toString();
}

// Enveloppe de l'espace Automatisme & GTB sur téléphone : onglets en bas,
// état de la connexion, menu « Plus ». Accueil, chantiers, fiche chantier et
// tâches sont des écrans mobiles natifs ; le reste garde sa mise en page.
export default function ShellMobileAuto({ onDeconnexion, peutBasculer }) {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [synchro, setSynchro] = useState(false);

  const surFiche = pathname.startsWith("/chantiers/");
  const natif = pathname === "/" || pathname === "/chantiers" || pathname === "/taches" || surFiche;
  const aller = (to) => {
    setMenu(false);
    navigate(to);
  };
  const onglet = ({ isActive }) => "m-onglet" + (isActive ? " actif" : "");

  return (
    <div className="m-app">
      {!natif && (
        <header className="m-barre-haut">
          <h1>{TITRES[pathname] || "Automatisme & GTB"}</h1>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </header>
      )}
      <main className={natif ? "m-contenu" : "m-contenu m-ancien"}>
        <Outlet />
      </main>

      {!surFiche && (
        <nav className="m-onglets" aria-label="Navigation">
          <NavLink to="/" end className={onglet}>
            <IcAccueil />
            <span>Accueil</span>
          </NavLink>
          <NavLink to="/chantiers" className={onglet}>
            <IcChantiers />
            <span>Chantiers</span>
          </NavLink>
          <NavLink to="/taches" className={onglet}>
            <IcTaches />
            <span>Tâches</span>
          </NavLink>
          <button type="button" className="m-onglet" onClick={() => setMenu(true)}>
            <IcMenu />
            <span>Plus</span>
          </button>
        </nav>
      )}

      <ToastHost />
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
      {menu && (
        <Feuille titre={profile?.nom || "Menu"} sousTitre={ROLES[profile?.role] || ""} onFermer={() => setMenu(false)}>
          <ul className="m-menu">
            <li>
              <button type="button" onClick={() => aller("/planning")}>
                Planning
              </button>
            </li>
            <li>
              <button type="button" onClick={() => aller("/reserves")}>
                Toutes les réserves
              </button>
            </li>
            <li>
              <button type="button" onClick={() => aller("/notes")}>
                Notes
              </button>
            </li>
            {isAdmin && (
              <li>
                <button type="button" onClick={() => aller("/statistiques")}>
                  Statistiques
                </button>
              </li>
            )}
            <li>
              <button type="button" onClick={() => aller("/aide")}>
                Aide
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  setSynchro(true);
                }}
              >
                Connexion et hors-ligne
              </button>
            </li>
            {peutBasculer && (
              <li>
                <button type="button" onClick={() => aller("/electricite")}>
                  Espace Électricité
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => {
                  forcerVueComplete(true);
                  setMenu(false);
                }}
              >
                Afficher la version complète
              </button>
            </li>
            <li>
              <button type="button" onClick={actualiser}>
                Actualiser l'appli
              </button>
            </li>
            <li>
              <button type="button" className="danger" onClick={onDeconnexion}>
                Se déconnecter
              </button>
            </li>
          </ul>
        </Feuille>
      )}
    </div>
  );
}
