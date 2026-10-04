import { useEffect, useRef, useState } from "react";

// Menu déroulant à cases à cocher pour choisir plusieurs chantiers (même
// esprit que PersonMultiSelect, avec en plus un champ de recherche : la
// liste des chantiers Automatisme & GTB peut être longue, contrairement à
// la liste des personnes).
const HAUTEUR_PANNEAU_ESTIMEE = 320;
const MARGE_SECURITE = 60;

function fenetreVisible(el) {
  let haut = 0;
  let bas = window.innerHeight;
  let noeud = el?.parentElement;
  while (noeud) {
    const style = window.getComputedStyle(noeud);
    if (/(auto|scroll|hidden)/.test(style.overflowY + " " + style.overflow)) {
      const r = noeud.getBoundingClientRect();
      haut = Math.max(haut, r.top);
      bas = Math.min(bas, r.bottom);
    }
    noeud = noeud.parentElement;
  }
  return { haut, bas };
}

export default function ChantierMultiSelect({ valeurs, chantiers, libelleChantier, onToggle }) {
  const [ouvert, setOuvert] = useState(false);
  const [versLeHaut, setVersLeHaut] = useState(false);
  const [recherche, setRecherche] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const fermerSiExterieur = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOuvert(false);
        setRecherche("");
      }
    };
    document.addEventListener("mousedown", fermerSiExterieur);
    document.addEventListener("touchstart", fermerSiExterieur);
    return () => {
      document.removeEventListener("mousedown", fermerSiExterieur);
      document.removeEventListener("touchstart", fermerSiExterieur);
    };
  }, []);

  const basculerOuverture = () => {
    setOuvert((etaitOuvert) => {
      const prochain = !etaitOuvert;
      if (!prochain) {
        setRecherche("");
      } else if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const { haut, bas } = fenetreVisible(ref.current);
        const espaceEnDessous = bas - rect.bottom;
        const espaceAuDessus = rect.top - haut;
        setVersLeHaut(
          espaceEnDessous < HAUTEUR_PANNEAU_ESTIMEE + MARGE_SECURITE &&
            espaceAuDessus > espaceEnDessous
        );
      }
      return prochain;
    });
  };

  const rechercheNorm = recherche.trim().toLowerCase();
  const chantiersFiltres = rechercheNorm
    ? chantiers.filter((c) => libelleChantier(c).toLowerCase().includes(rechercheNorm))
    : chantiers;

  const libelle =
    valeurs.length === 0 ? "Aucun chantier" : valeurs.length + " chantier(s) sélectionné(s)";

  return (
    <div className="person-multiselect" ref={ref}>
      <button
        type="button"
        className="import-edit-input person-multiselect-btn"
        onClick={basculerOuverture}
        title={libelle}
      >
        {libelle} {ouvert ? "▴" : "▾"}
      </button>
      {ouvert && (
        <div
          className={
            "person-multiselect-panel chantier-multiselect-panel" +
            (versLeHaut ? " person-multiselect-panel-haut" : "")
          }
        >
          <input
            type="text"
            autoFocus
            placeholder="Rechercher un chantier…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="chantier-multiselect-recherche"
          />
          <div className="chantier-multiselect-liste">
            {chantiersFiltres.length === 0 ? (
              <p className="empty-state-description" style={{ margin: "4px 0" }}>
                Aucun chantier ne correspond.
              </p>
            ) : (
              chantiersFiltres.map((c) => (
                <label key={c.id} className="team-checklist-item">
                  <input
                    type="checkbox"
                    checked={valeurs.includes(c.id)}
                    onChange={() => onToggle(c.id)}
                  />
                  {libelleChantier(c)}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
