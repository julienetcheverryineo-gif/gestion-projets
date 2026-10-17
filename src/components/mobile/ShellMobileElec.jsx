import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { forcerVueComplete } from "../../lib/telephone";
import ImportSapAuto from "../ImportSapAuto";
import { Feuille, FeuilleSynchro, PuceSynchro, ToastHost } from "./Ui";
import { IcCharge, IcChantiers, IcMenu, IcNotes } from "./Icones";

const ROLES = {
  admin: "Administrateur",
  chef_de_projet: "Chef de projet",
  automaticien: "Automaticien",
  electricien: "Électricien",
  ra_electricite: "RA Électricité",
};
const TITRES = {
  "/electricite/plan-de-charge": "Plan de charge",
  "/electricite/notes": "Problèmes rencontrés",
  "/electricite/import-sap": "Import SAP",
};

function actualiser() {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.href = url.toString();
}

// Enveloppe de l'espace Électricité sur téléphone : barre d'onglets en bas
// (pouce), état de la connexion, menu. Les écrans « mobiles natifs » (liste et
// fiche chantier) gèrent leur propre en-tête.
export default function ShellMobileElec({ onDeconnexion }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [synchro, setSynchro] = useState(false);

  const surFiche = pathname.startsWith("/electricite/chantiers/");
  const natif = pathname === "/electricite" || surFiche;

  return (
    <div className="m-app">
      {!natif && (
        <header className="m-barre-haut">
          <h1>{TITRES[pathname] || "Électricité"}</h1>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </header>
      )}
      <main className={natif ? "m-contenu" : "m-contenu m-ancien"}>
        <Outlet />
      </main>

      {!surFiche && (
        <nav className="m-onglets" aria-label="Navigation">
          <NavLink to="/electricite" end className={({ isActive }) => "m-onglet" + (isActive ? " actif" : "")}>
            <IcChantiers />
            <span>Chantiers</span>
          </NavLink>
          <NavLink to="/electricite/plan-de-charge" className={({ isActive }) => "m-onglet" + (isActive ? " actif" : "")}>
            <IcCharge />
            <span>Charge</span>
          </NavLink>
          <NavLink to="/electricite/notes" className={({ isActive }) => "m-onglet" + (isActive ? " actif" : "")}>
            <IcNotes />
            <span>Problèmes</span>
          </NavLink>
          <button type="button" className="m-onglet" onClick={() => setMenu(true)}>
            <IcMenu />
            <span>Plus</span>
          </button>
        </nav>
      )}

      <ToastHost />
      <ImportSapAuto />
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
      {menu && (
        <Feuille titre={profile?.nom || "Menu"} sousTitre={ROLES[profile?.role] || ""} onFermer={() => setMenu(false)}>
          <ul className="m-menu">
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
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  navigate("/electricite/import-sap");
                }}
              >
                Import SAP
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  navigate("/");
                }}
              >
                Espace Automatisme &amp; GTB
              </button>
            </li>
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
