import { formatStatutTache, formatDateCourte } from "../lib/formatage";
import { arrondirHeures } from "../lib/usePlanningData";

// Remplace le Gantt (barres sur une frise de plusieurs mois) par une
// liste de cartes sur petit écran : faire défiler une frise au pixel
// près au doigt, et taper une barre de quelques millimètres de large,
// n'est pas utilisable sur téléphone. La liste garde le même
// regroupement (par chantier, par personne) et le tri chronologique,
// juste sans la frise.

function CartePeriode({ nom, debut, fin, heures, onClick }) {
  const contenu = (
    <>
      <div className="planning-mobile-carte-titre">{nom}</div>
      <div className="planning-mobile-carte-meta">
        <span>
          {formatDateCourte(debut)} → {formatDateCourte(fin)}
        </span>
        {heures ? <span>{arrondirHeures(heures)} h</span> : null}
      </div>
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

function CarteTache({ titre, tache, onClick }) {
  const avancement =
    tache.avancement !== null && tache.avancement !== undefined
      ? Math.max(0, Math.min(100, Number(tache.avancement)))
      : null;
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
      {avancement !== null && (
        <div className="progress-bar" style={{ marginTop: 6 }}>
          <div className="progress-bar-fill" style={{ width: avancement + "%" }} />
        </div>
      )}
    </button>
  );
}

// Vue "Consolidé" : une carte par chantier (période + total d'heures).
export function ConsolideMobile({ chantierBars }) {
  if (chantierBars.length === 0) {
    return <p className="empty-state-description" style={{ margin: "8px 0" }}>Aucun chantier daté.</p>;
  }
  return (
    <div className="planning-mobile-liste">
      {chantierBars.map((cb) => (
        <CartePeriode key={cb.cle} nom={cb.nom} debut={cb.debut} fin={cb.fin} heures={cb.heuresTotal} />
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
            <CarteTache key={t.id} titre={t.titre} tache={t} onClick={() => onCliquerTache(t)} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Vue "Par personne" : groupé par personne, une carte par tâche (titre =
// nom du chantier, comme sur le Gantt par personne).
export function ParPersonneMobile({ groupes, nomChantier, onCliquerTache }) {
  if (groupes.length === 0) {
    return <p className="empty-state-description" style={{ margin: "8px 0" }}>Personne n'a de tâche datée ici.</p>;
  }
  return (
    <div className="planning-mobile-liste">
      {groupes.map((groupe) => (
        <div key={groupe.nom} className="planning-mobile-groupe">
          <div className="planning-mobile-groupe-titre">{groupe.nom}</div>
          {groupe.taches.map((t, i) => (
            <CarteTache
              key={t.id + "-" + i}
              titre={t.chantierId ? nomChantier(t.chantierId) : "À affecter"}
              tache={t}
              onClick={() => onCliquerTache(t)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
