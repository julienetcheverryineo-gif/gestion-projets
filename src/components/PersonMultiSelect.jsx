import { useEffect, useRef, useState } from "react";

// Petit menu déroulant à cases à cocher pour choisir plusieurs personnes.
// `valeurs` est toujours un tableau de noms ; `onChange` reçoit le nouveau
// tableau complet à chaque coche/décoche. `autresNoms` (optionnel) ajoute
// une seconde section de noms libres sans compte applicatif (ex : les
// électriciens affectés au chantier, souvent externes).
// Hauteur maximale réelle du panneau (max-height 220px + padding/gap, voir
// .person-multiselect-panel) plus une marge de sécurité généreuse : le
// seuil précédent (250) collait de trop près à la hauteur réelle et
// basculait encore trop tard dans certains cas.
const HAUTEUR_PANNEAU_ESTIMEE = 260;
const MARGE_SECURITE = 60;

// Le panneau est positionné en absolu, mais reste visuellement DÉCOUPÉ
// par le premier ancêtre qui a un défilement propre (le wrapper à
// défilement horizontal d'un tableau, la zone scrollable d'une modale...)
// — même s'il y a de la place jusqu'en bas de l'écran, le panneau peut
// être coupé par cet ancêtre-là. On cherche donc la fenêtre visible
// réelle : l'intersection de tous les ancêtres qui découpent leur
// contenu, pas seulement la fenêtre du navigateur.
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

export default function PersonMultiSelect({ valeurs, utilisateurs, autresNoms = [], onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const [versLeHaut, setVersLeHaut] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fermerSiExterieur = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener("mousedown", fermerSiExterieur);
    document.addEventListener("touchstart", fermerSiExterieur);
    return () => {
      document.removeEventListener("mousedown", fermerSiExterieur);
      document.removeEventListener("touchstart", fermerSiExterieur);
    };
  }, []);

  // Vers le bas par défaut (comme avant), mais vers le haut si la ligne
  // est en bas de tableau/écran et que le panneau n'aurait pas la place
  // de s'ouvrir en dessous — pour ne pas se retrouver hors cadre, à
  // devoir descendre l'ascenseur pour voir les cases à cocher.
  const basculerOuverture = () => {
    setOuvert((etaitOuvert) => {
      const prochain = !etaitOuvert;
      if (prochain && ref.current) {
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

  const basculer = (nom) => {
    const set = new Set(valeurs);
    if (set.has(nom)) set.delete(nom);
    else set.add(nom);
    onChange([...set]);
  };

  const libelle = valeurs.length === 0 ? "À affecter" : valeurs.join(", ");

  return (
    <div className="person-multiselect" ref={ref}>
      <button
        type="button"
        className="import-edit-input person-multiselect-btn"
        onClick={basculerOuverture}
        title={libelle}
      >
        {libelle}
      </button>
      {ouvert && (
        <div
          className={
            "person-multiselect-panel" + (versLeHaut ? " person-multiselect-panel-haut" : "")
          }
        >
          {utilisateurs.map((u) => (
            <label key={u.id} className="team-checklist-item">
              <input
                type="checkbox"
                checked={valeurs.includes(u.nom)}
                onChange={() => basculer(u.nom)}
              />
              {u.nom}
            </label>
          ))}
          {autresNoms.length > 0 && (
            <>
              <div className="person-multiselect-separateur">Électriciens</div>
              {autresNoms.map((nom) => (
                <label key={nom} className="team-checklist-item">
                  <input
                    type="checkbox"
                    checked={valeurs.includes(nom)}
                    onChange={() => basculer(nom)}
                  />
                  {nom}
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
