import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { formatDateCourte, reserveEnRetard } from "../../lib/useDonneesAuto";
import { ecrire } from "../../lib/ecritureMobile";
import { afficherToast } from "../../components/mobile/Ui";
import { IcReserve } from "../../components/mobile/Icones";

// Réserves d'un chantier : lever d'un geste (annulable).
export default function ReservesAuto({ reserves }) {
  const [filtre, setFiltre] = useState("ouvertes");
  const ouvertes = reserves.filter((r) => r.statut !== "levee");
  const liste = (filtre === "ouvertes" ? ouvertes : filtre === "levees" ? reserves.filter((r) => r.statut === "levee") : reserves)
    .slice()
    .sort((a, b) => String(a.dateEcheance || "0000").localeCompare(String(b.dateEcheance || "0000")));

  const basculer = (r) => {
    const levee = r.statut === "levee";
    const suivant = levee ? "ouverte" : "levee";
    ecrire(updateDoc(doc(db, "reserves", r.id), { statut: suivant }));
    afficherToast(levee ? "Réserve rouverte" : "Réserve levée ✓", {
      label: "Annuler",
      onClick: () => ecrire(updateDoc(doc(db, "reserves", r.id), { statut: r.statut ?? "ouverte" })),
    });
  };

  return (
    <div>
      <div className="m-filtres">
        {[
          ["ouvertes", "Ouvertes (" + ouvertes.length + ")"],
          ["levees", "Levées"],
          ["toutes", "Toutes"],
        ].map(([k, l]) => (
          <button key={k} type="button" className={filtre === k ? "actif" : ""} onClick={() => setFiltre(k)}>
            {l}
          </button>
        ))}
      </div>
      {liste.length === 0 ? (
        <div className="m-vide">
          <IcReserve taille={34} />
          <strong>{filtre === "ouvertes" ? "Aucune réserve ouverte" : "Aucune réserve"}</strong>
        </div>
      ) : (
        <ul className="m-liste-simple">
          {liste.map((r) => {
            const retard = reserveEnRetard(r);
            const levee = r.statut === "levee";
            return (
              <li key={r.id} className={"m-reserve" + (retard ? " retard" : "") + (levee ? " levee" : "")}>
                <strong>{r.designation}</strong>
                <span className="m-ligne-auto-sous">
                  {r.responsable ? r.responsable + " · " : ""}
                  {r.dateEcheance ? "échéance " + formatDateCourte(r.dateEcheance) : "pas d'échéance"}
                  {retard && <b className="m-txt-alerte"> · en retard</b>}
                </span>
                {r.remarque && <span className="m-point-meta">{r.remarque}</span>}
                {r.actionLevee && <span className="m-point-meta">Action : {r.actionLevee}</span>}
                <button type="button" className={levee ? "m-bouton-sec" : "m-bouton-plein"} onClick={() => basculer(r)}>
                  {levee ? "Rouvrir" : "Lever la réserve"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
