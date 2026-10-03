import { useState } from "react";
import { formatStatutTache, formatDateCourte } from "../lib/formatage";
import { arrondirHeures } from "../lib/usePlanningData";
import { normaliserAssignes } from "../lib/assignes";
import { pourcentageAvancementTache } from "../lib/avancement";

// Remplace le Gantt (barres sur une frise de plusieurs mois) par une
// liste de cartes sur petit écran : faire défiler une frise au pixel
// près au doigt, et taper une barre de quelques millimètres de large,
// n'est pas utilisable sur téléphone. La liste garde le même
// regroupement (par chantier, par personne) et le tri chronologique,
// juste sans la frise.

function CartePeriode({ nom, debut, fin, heures, avancement, personnesEnCours, nombreTaches, onClick }) {
  // Même étiquette "Resp : ... — Tâches : N" que les barres du Gantt
  // desktop (consolidé et détaillé), pour un rendu homogène entre les
  // deux vues.
  const ligneAffectation = [
    personnesEnCours && personnesEnCours.length > 0 ? "Resp : " + personnesEnCours.join(", ") : null,
    nombreTaches !== undefined && nombreTaches !== null ? "Tâches : " + nombreTaches : null,
  ]
    .filter(Boolean)
    .join(" — ");
  const contenu = (
    <>
      <div className="planning-mobile-carte-titre">{nom}</div>
      <div className="planning-mobile-carte-meta">
        <span>
          {formatDateCourte(debut)} → {formatDateCourte(fin)}
        </span>
        {heures ? <span>{arrondirHeures(heures)} h</span> : null}
        {avancement !== null && avancement !== undefined ? <span>{avancement}%</span> : null}
      </div>
      {ligneAffectation && (
        <div className="planning-mobile-carte-meta">
          <span>{ligneAffectation}</span>
        </div>
      )}
      {avancement !== null && avancement !== undefined && (
        <div className="progress-bar" style={{ marginTop: 6 }}>
          <div className="progress-bar-fill" style={{ width: avancement + "%" }} />
        </div>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="planning-mobile-carte" onClick={onClick}>
      {contenu}
    </button>
  ) : (
    <div className="planning-mobile-carte">{contenu}</div>
  );
}

function CarteTache({ titre, tache, afficherResponsable, onClick }) {
  const avancement =
    tache.avancement !== null && tache.avancement !== undefined
      ? Math.max(0, Math.min(100, Number(tache.avancement)))
      : null;
  const responsables = afficherResponsable ? normaliserAssignes(tache.assigneA) : [];
  return (
    <button
      type="button"
      className={"planning-mobile-carte planning-mobile-carte-" + (tache.statut || "a_faire")}
      onClick={onClick}
    >
      <div className="planning-mobile-carte-titre">{titre}</div>
      <div className="planning-mobile-carte-meta">
        <span>
          {formatDateCourte(tache.dateDebut)} → {formatDateCourte(tache.echeance)}
        </span>
        {tache.heuresPrevues ? <span>{tache.heuresPrevues} h</span> : null}
        <span className="planning-mobile-carte-statut">{formatStatutTache(tache.statut)}</span>
      </div>
      {responsables.length > 0 && (
        <div className="planning-mobile-carte-meta">
          <span>{responsables.join(", ")}</span>
        </div>
      )}
      {avancement !== null && (
        <div className="progress-bar" style={{ marginTop: 6 }}>
          <div className="progress-bar-fill" style={{ width: avancement + "%" }} />
        </div>
      )}
    </button>
  );
}

// Vue "Consolidé" : une carte par chantier (période + total d'heures).
// Taper la carte ouvre la fiche du chantier (sauf le groupe "aaffecter",
// qui n'a pas de fiche).
export function ConsolideMobile({ chantierBars, onCliquerChantier }) {
  if (chantierBars.length === 0) {
    return <p className="empty-state-description" style={{ margin: "8px 0" }}>Aucun chantier daté.</p>;
  }
  return (
    <div className="planning-mobile-liste">
      {chantierBars.map((cb) => (
        <CartePeriode
          key={cb.cle}
          nom={cb.nom}
          debut={cb.debut}
          fin={cb.fin}
          heures={cb.heuresTotal}
          avancement={cb.avancement}
          personnesEnCours={cb.personnesEnCours}
          nombreTaches={cb.nombreTaches}
          onClick={
            cb.cle !== "aaffecter" && onCliquerChantier ? () => onCliquerChantier(cb.cle) : undefined
          }
        />
      ))}
    </div>
  );
}

// Vue "Détaillé" : groupé par chantier, une carte par tâche.
export function DetailleMobile({ parChantier, onCliquerTache }) {
  const groupes = [...parChantier.entries()];
  if (groupes.length === 0) {
    return <p className="empty-state-description" style={{ margin: "8px 0" }}>Aucune tâche datée.</p>;
  }
  return (
    <div className="planning-mobile-liste">
      {groupes.map(([cle, groupe]) => (
        <div key={cle} className="planning-mobile-groupe">
          <div className="planning-mobile-groupe-titre">{groupe.nom}</div>
          {groupe.taches.map((t) => (
            <CarteTache
              key={t.id}
              titre={t.titre}
              tache={t}
              afficherResponsable
              onClick={() => onCliquerTache(t)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Regroupe les tâches (déjà d'une seule personne) par chantier, dans
// l'ordre de leur première apparition — même logique que côté desktop.
function grouperParChantier(taches, nomChantier) {
  const map = new Map();
  for (const t of taches) {
    const cle = t.chantierId || "aaffecter";
    if (!map.has(cle)) {
      map.set(cle, { cle, nom: t.chantierId ? nomChantier(t.chantierId) : "À affecter", taches: [] });
    }
    map.get(cle).taches.push(t);
  }
  return [...map.values()];
}

// Vue "Par personne" : groupé par personne, puis par chantier (carte
// dépliable, remplie selon l'avancement global du chantier) — taper la
// carte déplie les tâches de la personne sur ce chantier.
export function ParPersonneMobile({ groupes, nomChantier, avancementParChantier, onCliquerTache }) {
  const [chantiersOuverts, setChantiersOuverts] = useState(() => new Set());

  if (groupes.length === 0) {
    return <p className="empty-state-description" style={{ margin: "8px 0" }}>Personne n'a de tâche datée ici.</p>;
  }

  const basculer = (cle) => {
    setChantiersOuverts((actuel) => {
      const suivant = new Set(actuel);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });
  };

  return (
    <div className="planning-mobile-liste">
      {groupes.map((groupe) => {
        const sousGroupes = grouperParChantier(groupe.taches, nomChantier);
        return (
          <div key={groupe.nom} className="planning-mobile-groupe">
            <div className="planning-mobile-groupe-titre">{groupe.nom}</div>
            {sousGroupes.map((sg) => {
              const cleUnique = groupe.nom + "||" + sg.cle;
              const ouvert = chantiersOuverts.has(cleUnique);
              const debut = sg.taches.reduce(
                (min, t) => (t.dateDebut < min ? t.dateDebut : min),
                sg.taches[0].dateDebut
              );
              const fin = sg.taches.reduce(
                (max, t) => (t.echeance > max ? t.echeance : max),
                sg.taches[0].echeance
              );
              // Heures restantes, pas le volume d'origine — même règle que
              // le Gantt desktop et la Charge du service (voir
              // usePlanningData.js).
              const heures = sg.taches.reduce(
                (s, t) => s + Number(t.heuresPrevues || 0) * (1 - pourcentageAvancementTache(t) / 100),
                0
              );
              const avancement = avancementParChantier?.get(sg.cle) ?? null;
              return (
                <div key={cleUnique}>
                  <CartePeriode
                    nom={(ouvert ? "▾ " : "▸ ") + sg.nom}
                    debut={debut}
                    fin={fin}
                    heures={heures}
                    avancement={avancement}
                    onClick={() => basculer(cleUnique)}
                  />
                  {ouvert &&
                    sg.taches.map((t, i) => (
                      <CarteTache
                        key={t.id + "-" + i}
                        titre={t.titre}
                        tache={t}
                        onClick={() => onCliquerTache(t)}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
