import { useMemo, useState } from "react";
import { useCollection } from "../lib/firestoreHooks";
import { normaliserAssignes } from "../lib/assignes";

const PLAFOND_MENSUEL = 156;
const MS_JOUR = 86400000;

function joursEntre(a, b) {
  return Math.round((new Date(b) - new Date(a)) / MS_JOUR);
}

// Formate une Date en "AAAA-MM-JJ" à partir de ses composants LOCAUX,
// plutôt que toISOString() (qui convertit en UTC et peut décaler d'un jour
// selon le fuseau horaire — la France est UTC+1/+2, ce qui ferait glisser
// minuit local vers la veille en UTC).
function formatDateLocale(date) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return annee + "-" + mois + "-" + jour;
}

function moisCle(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 7); // "AAAA-MM"
}

function libelleMois(cle) {
  const [annee, mois] = cle.split("-");
  const noms = [
    "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
    "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
  ];
  return noms[Number(mois) - 1] + " " + annee;
}

export default function Planning() {
  const { documents: taches, chargement } = useCollection("tasks");
  const { documents: chantiers } = useCollection("sites");
  const { documents: regItems } = useCollection("regitems");
  const { documents: regEquipements } = useCollection("regequipements");
  const [chantierFiltre, setChantierFiltre] = useState("tous");

  const nomChantier = (id) => chantiers.find((c) => c.id === id)?.nom ?? "À affecter";

  // Tâches d'équipement régulé fusionnées (pour la charge — elles n'ont
  // jamais de dates, donc jamais sur le Gantt, mais leurs heures comptent).
  const tachesRegitems = useMemo(
    () =>
      regItems
        .filter((it) => it.type === "tache")
        .map((it) => {
          const equip = regEquipements.find((r) => r.id === it.regEquipementId);
          return {
            id: it.id,
            titre: it.designation,
            chantierId: equip?.chantierId ?? null,
            assigneA: it.assigneA || null,
            heuresPrevues: it.heuresPrevues ?? null,
            dateDebut: null,
            echeance: null,
            statut: it.statut === "fait" ? "termine" : "a_faire",
          };
        }),
    [regItems, regEquipements]
  );

  const toutesLesTaches = useMemo(
    () => [...taches, ...tachesRegitems],
    [taches, tachesRegitems]
  );

  const tachesVisibles = useMemo(
    () =>
      chantierFiltre === "tous"
        ? toutesLesTaches
        : toutesLesTaches.filter((t) => t.chantierId === chantierFiltre),
    [toutesLesTaches, chantierFiltre]
  );

  // ---------- Gantt ----------
  const tachesGantt = useMemo(
    () => tachesVisibles.filter((t) => t.dateDebut && t.echeance && t.echeance >= t.dateDebut),
    [tachesVisibles]
  );
  const tachesSansDatesCompletes = tachesVisibles.filter(
    (t) => !(t.dateDebut && t.echeance && t.echeance >= t.dateDebut)
  );

  const gantt = useMemo(() => {
    if (tachesGantt.length === 0) return null;
    const debuts = tachesGantt.map((t) => t.dateDebut);
    const fins = tachesGantt.map((t) => t.echeance);
    const dateMin = debuts.reduce((a, b) => (a < b ? a : b));
    const dateMax = fins.reduce((a, b) => (a > b ? a : b));
    const debutTimeline = dateMin.slice(0, 8) + "01";
    const finDate = new Date(dateMax);
    const finTimeline = formatDateLocale(
      new Date(finDate.getFullYear(), finDate.getMonth() + 1, 0)
    );
    const totalJours = Math.max(1, joursEntre(debutTimeline, finTimeline));
    const pxParJour = totalJours > 180 ? 6 : totalJours > 90 ? 10 : 18;
    const largeurTotale = totalJours * pxParJour;

    const mois = [];
    let curseur = new Date(debutTimeline);
    const finObj = new Date(finTimeline);
    while (curseur <= finObj) {
      const cle = formatDateLocale(curseur).slice(0, 7);
      const debutMoisStr = formatDateLocale(curseur);
      mois.push({
        cle,
        label: libelleMois(cle),
        left: joursEntre(debutTimeline, debutMoisStr) * pxParJour,
      });
      curseur = new Date(curseur.getFullYear(), curseur.getMonth() + 1, 1);
    }

    const parChantier = new Map();
    for (const t of tachesGantt) {
      const cle = t.chantierId || "aaffecter";
      if (!parChantier.has(cle)) {
        parChantier.set(cle, { nom: nomChantier(t.chantierId), taches: [] });
      }
      parChantier.get(cle).taches.push(t);
    }
    for (const groupe of parChantier.values()) {
      groupe.taches.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
    }

    const aujourdHui = formatDateLocale(new Date());
    const ligneAujourdHui =
      aujourdHui >= debutTimeline && aujourdHui <= finTimeline
        ? joursEntre(debutTimeline, aujourdHui) * pxParJour
        : null;

    return { debutTimeline, pxParJour, largeurTotale, mois, parChantier, ligneAujourdHui };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tachesGantt, chantiers]);

  // ---------- Charge par automaticien ----------
  const charge = useMemo(() => {
    const parPersonne = new Map();
    for (const t of tachesVisibles) {
      const heures = Number(t.heuresPrevues || 0);
      if (heures <= 0) continue;
      const noms = normaliserAssignes(t.assigneA);
      if (noms.length === 0) continue;
      const cleMois = moisCle(t.dateDebut) || moisCle(t.echeance);
      for (const nom of noms) {
        if (!parPersonne.has(nom)) {
          parPersonne.set(nom, { nom, parMois: {}, nonPlanifie: 0, total: 0 });
        }
        const entree = parPersonne.get(nom);
        entree.total += heures;
        if (cleMois) {
          entree.parMois[cleMois] = (entree.parMois[cleMois] || 0) + heures;
        } else {
          entree.nonPlanifie += heures;
        }
      }
    }
    const tousLesMois = new Set();
    for (const p of parPersonne.values()) {
      for (const cle of Object.keys(p.parMois)) tousLesMois.add(cle);
    }
    const moisTries = [...tousLesMois].sort();
    const personnes = [...parPersonne.values()].sort((a, b) => b.total - a.total);
    return { moisTries, personnes };
  }, [tachesVisibles]);

  const classeCharge = (h) => {
    if (h > PLAFOND_MENSUEL) return "charge-cellule-rouge";
    if (h > PLAFOND_MENSUEL * 0.75) return "charge-cellule-orange";
    if (h > 0) return "charge-cellule-verte";
    return "charge-cellule-vide";
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Planning</h1>
        <p className="page-subtitle">
          Gantt des tâches datées et charge mensuelle par automaticien (plafond {PLAFOND_MENSUEL} h/mois).
        </p>
      </header>

      <div className="chantiers-filtres" style={{ marginBottom: 20 }}>
        <select value={chantierFiltre} onChange={(e) => setChantierFiltre(e.target.value)}>
          <option value="tous">Tous les chantiers</option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Gantt</h2>
              <span className="simple-list-meta">
                {tachesGantt.length} tâche(s) avec dates complètes
                {tachesSansDatesCompletes.length > 0 &&
                  " · " + tachesSansDatesCompletes.length + " sans dates, non affichée(s) ici"}
              </span>
            </div>

            {!gantt ? (
              <div className="empty-state">
                <p className="empty-state-title">Aucune tâche datée</p>
                <p className="empty-state-description">
                  Le Gantt affiche les tâches ayant à la fois une date de début et une date de
                  fin. Renseignez ces dates dans l'onglet Tâches d'un chantier pour les voir
                  apparaître ici.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: gantt.largeurTotale + 180 }}>
                  <div className="gantt-mois-header" style={{ marginLeft: 180 }}>
                    <div style={{ position: "relative", height: 24, width: gantt.largeurTotale }}>
                      {gantt.mois.map((m) => (
                        <div key={m.cle} className="gantt-mois-label" style={{ left: m.left }}>
                          {m.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {[...gantt.parChantier.entries()].map(([cle, groupe]) => (
                    <div key={cle} className="gantt-groupe">
                      <div className="gantt-groupe-titre">{groupe.nom}</div>
                      {groupe.taches.map((t) => {
                        const left = joursEntre(gantt.debutTimeline, t.dateDebut) * gantt.pxParJour;
                        const largeur = Math.max(
                          6,
                          (joursEntre(t.dateDebut, t.echeance) + 1) * gantt.pxParJour
                        );
                        return (
                          <div key={t.id} className="gantt-ligne">
                            <div className="gantt-ligne-titre" title={t.titre}>
                              {t.titre}
                            </div>
                            <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
                              {gantt.ligneAujourdHui !== null && (
                                <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
                              )}
                              <div
                                className={"gantt-barre gantt-barre-" + (t.statut ?? "a_faire")}
                                style={{ left, width: largeur }}
                                title={t.titre + " — " + t.dateDebut + " → " + t.echeance}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Charge par automaticien</h2>
              <span className="simple-list-meta">
                Vert : sous 75 % du plafond · Orange : proche · Rouge : dépassé
              </span>
            </div>

            {charge.personnes.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">Aucune heure affectée</p>
                <p className="empty-state-description">
                  Renseignez des heures prévues et un responsable sur vos tâches pour voir la
                  charge apparaître ici.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table charge-table" style={{ tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th style={{ width: 160 }}>Automaticien</th>
                      {charge.moisTries.map((m) => (
                        <th key={m} style={{ width: 90 }}>
                          {libelleMois(m)}
                        </th>
                      ))}
                      <th style={{ width: 110 }}>Non planifié</th>
                      <th style={{ width: 90 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charge.personnes.map((p) => (
                      <tr key={p.nom}>
                        <td data-label="Automaticien" style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}>
                          {p.nom}
                        </td>
                        {charge.moisTries.map((m) => {
                          const h = p.parMois[m] || 0;
                          return (
                            <td key={m} data-label={libelleMois(m)}>
                              <div className={"charge-cellule " + classeCharge(h)}>
                                {h > 0 ? h + " h" : "—"}
                              </div>
                            </td>
                          );
                        })}
                        <td data-label="Non planifié">
                          <span className="simple-list-meta">
                            {p.nonPlanifie > 0 ? p.nonPlanifie + " h" : "—"}
                          </span>
                        </td>
                        <td data-label="Total" style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>
                          {p.total} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
