import { useEffect, useRef, useState } from "react";

// Petit menu déroulant à cases à cocher pour choisir plusieurs personnes.
// `valeurs` est toujours un tableau de noms ; `onChange` reçoit le nouveau
// tableau complet à chaque coche/décoche. `autresNoms` (optionnel) ajoute
// une seconde section de noms libres sans compte applicatif (ex : les
// électriciens affectés au chantier, souvent externes).
export default function PersonMultiSelect({ valeurs, utilisateurs, autresNoms = [], onChange }) {
  const [ouvert, setOuvert] = useState(false);
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
        onClick={() => setOuvert((o) => !o)}
        title={libelle}
      >
        {libelle}
      </button>
      {ouvert && (
        <div className="person-multiselect-panel">
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
