import { useEffect, useRef, useState } from "react";

// Petit menu déroulant à cases à cocher pour choisir plusieurs personnes.
// `valeurs` est toujours un tableau de noms ; `onChange` reçoit le nouveau
// tableau complet à chaque coche/décoche. `autresNoms` (optionnel) ajoute
// une seconde section de noms libres sans compte applicatif (ex : les
// électriciens affectés au chantier, souvent externes).
// Hauteur maximale du panneau (voir .person-multiselect-panel max-height)
// + marge, pour savoir s'il tient en dessous du bouton ou doit s'ouvrir
// vers le haut.
const HAUTEUR_PANNEAU_ESTIMEE = 250;

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
        const espaceEnDessous = window.innerHeight - rect.bottom;
        const espaceAuDessus = rect.top;
        setVersLeHaut(
          espaceEnDessous < HAUTEUR_PANNEAU_ESTIMEE && espaceAuDessus > espaceEnDessous
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
