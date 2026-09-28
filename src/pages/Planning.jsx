import { useEffect, useMemo, useRef, useState } from "react";
import { usePlanningData, joursEntre, libelleMois, arrondirHeures, PLAFOND_MENSUEL } from "../lib/usePlanningData";
import { useEcranEtroit } from "../lib/useEcranEtroit";
import FiltreChantier from "../components/FiltreChantier";
import TacheGanttModal from "../components/TacheGanttModal";
import ChargeTable from "../components/ChargeTable";
import ChargeDetailModal from "../components/ChargeDetailModal";
import { ConsolideMobile, DetailleMobile, ParPersonneMobile } from "../components/PlanningMobile";

const VUES = [
  { cle: "consolide", label: "Consolidé" },
  { cle: "detaille", label: "Détaillé" },
  { cle: "personne", label: "Par personne" },
  { cle: "charge", label: "Charge du service" },
];

const LARGEUR_TITRE_DEFAUT = 180;
const CLE_LARGEUR_TITRE = "planningTitreWidth";

function chargerLargeurTitre() {
  try {
    const brut = localStorage.getItem(CLE_LARGEUR_TITRE);
    const v = brut ? Number(brut) : NaN;
    return Number.isFinite(v) && v >= 100 ? v : LARGEUR_TITRE_DEFAUT;
  } catch {
    return LARGEUR_TITRE_DEFAUT;
  }
}

// Largeur de la colonne des noms (chantier/tâche/personne), partagée par
// toutes les vues du Planning et redimensionnable en glissant le bord
// droit de n'importe quelle cellule de titre (comme les colonnes des
// tableaux de tâches).
function useLargeurTitre() {
  const [largeurTitre, setLargeurTitre] = useState(chargerLargeurTitre);
  const redimensionRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const info = redimensionRef.current;
      if (!info) return;
      const deltaX = e.clientX - info.startX;
      setLargeurTitre(Math.max(100, Math.min(500, info.startWidth + deltaX)));
    };
    const onUp = () => {
      if (!redimensionRef.current) return;
      redimensionRef.current = null;
      setLargeurTitre((actuelle) => {
        try {
          localStorage.setItem(CLE_LARGEUR_TITRE, String(actuelle));
        } catch {
          // stockage indisponible : tant pis, on garde juste la taille en mémoire
        }
        return actuelle;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const demarrerRedimension = (e) => {
    e.preventDefault();
    e.stopPropagation();
    redimensionRef.current = { startX: e.clientX, startWidth: largeurTitre };
  };

  return { largeurTitre, demarrerRedimension };
}

export default function Planning() {
  const {
    chargement,
    chantiers,
    chantierFiltre,
    setChantierFiltre,
    tachesGantt,
    tachesSansDatesCompletes,
    toutesLesTaches,
    utilisateurs,
    gantt,
    charge,
    nomChantier,
  } = usePlanningData();
  const [vue, setVue] = useState("consolide");
  const [tacheEnEdition, setTacheEnEdition] = useState(null);
  const [detail, setDetail] = useState(null);
  const { largeurTitre, demarrerRedimension } = useLargeurTitre();
  const ecranEtroit = useEcranEtroit();

  // Pour permettre l'édition directe depuis le détail d'une case de charge
  // (Planning > Charge du service) : chaque entrée du détail ne contient
  // que ce qu'il faut pour l'affichage (heures reparties sur le mois), pas
  // la tâche complète — on la retrouve ici par id pour l'édition.
  const tacheParId = useMemo(
    () => new Map(toutesLesTaches.map((t) => [t.id, t])),
    [toutesLesTaches]
  );

  const ouvrirDetail = (personne, cle) => {
    setDetail({
      nomPersonne: personne.nom,
      libelleColonne: cle === "nonPlanifie" ? "Non planifié" : libelleMois(cle),
      entrees: cle === "nonPlanifie" ? personne.detailNonPlanifie : personne.detailParMois[cle] || [],
    });
  };

  const automaticiensGantt = gantt?.personneGroupes.filter((g) => g.type === "automaticien") ?? [];
  const electriciensGantt = gantt?.personneGroupes.filter((g) => g.type === "electricien") ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Planning</h1>
        <p className="page-subtitle">
          Gantt du service (consolidé, détaillé, par personne) et charge par rapport au plafond
          de {PLAFOND_MENSUEL} h/mois.
        </p>
      </header>

      <div className="chantier-actions-bar">
        {VUES.map((v) => (
          <button
            key={v.cle}
            className={vue === v.cle ? "btn-primary" : "btn-accent"}
            onClick={() => setVue(v.cle)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FiltreChantier chantiers={chantiers} valeur={chantierFiltre} onChange={setChantierFiltre} />

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <>
          {vue === "consolide" && (
            <section className="panel">
              <div className="panel-header">
                <h2>Gantt consolidé</h2>
                <span className="simple-list-meta">Une barre par chantier.</span>
              </div>
              {!gantt ? (
                <EmptyGantt />
              ) : ecranEtroit ? (
                <ConsolideMobile chantierBars={gantt.chantierBars} />
              ) : (
                <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: gantt.largeurTotale + largeurTitre }}>
                    <EnteteMois gantt={gantt} largeurTitre={largeurTitre} />
                    {gantt.chantierBars.map((cb) => (
                      <div key={cb.cle} className="gantt-ligne">
                        <div
                          className="gantt-ligne-titre"
                          style={{ width: largeurTitre }}
                          title={cb.nom}
                        >
                          {cb.nom}
                          <span className="col-resizer" onMouseDown={demarrerRedimension} />
                        </div>
                        <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
                          {gantt.ligneAujourdHui !== null && (
                            <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
                          )}
                          <div
                            className="gantt-barre gantt-barre-chantier"
                            style={{ left: cb.left, width: cb.largeur }}
                            title={cb.nom + " — " + arrondirHeures(cb.heuresTotal) + " h au total"}
                          >
                            <span className="gantt-barre-heures">{arrondirHeures(cb.heuresTotal)} h</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {vue === "detaille" && (
            <section className="panel">
              <div className="panel-header">
                <h2>Gantt détaillé</h2>
                <span className="simple-list-meta">
                  {tachesGantt.length} tâche(s) avec dates complètes
                  {tachesSansDatesCompletes.length > 0 &&
                    " · " + tachesSansDatesCompletes.length + " sans dates, non affichée(s) ici"}
                  {" · cliquer une tâche pour la recaler"}
                </span>
              </div>
              {!gantt ? (
                <EmptyGantt />
              ) : ecranEtroit ? (
                <DetailleMobile parChantier={gantt.parChantier} onCliquerTache={setTacheEnEdition} />
              ) : (
                <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: gantt.largeurTotale + largeurTitre }}>
                    <EnteteMois gantt={gantt} largeurTitre={largeurTitre} />
                    {[...gantt.parChantier.entries()].map(([cle, groupe]) => (
                      <div key={cle} className="gantt-groupe">
                        <div className="gantt-groupe-titre" style={{ width: largeurTitre }} title={groupe.nom}>
                          {groupe.nom}
                        </div>
                        {groupe.taches.map((t) => (
                          <LigneTache
                            key={t.id}
                            titre={t.titre}
                            tache={t}
                            gantt={gantt}
                            largeurTitre={largeurTitre}
                            demarrerRedimension={demarrerRedimension}
                            onClick={() => setTacheEnEdition(t)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {vue === "personne" && (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>Automaticiens</h2>
                  <span className="simple-list-meta">Cliquer une tâche pour la recaler.</span>
                </div>
                {!gantt ? (
                  <EmptyGantt />
                ) : ecranEtroit ? (
                  <ParPersonneMobile
                    groupes={automaticiensGantt}
                    nomChantier={nomChantier}
                    onCliquerTache={setTacheEnEdition}
                  />
                ) : (
                  <GanttParPersonne
                    groupes={automaticiensGantt}
                    gantt={gantt}
                    nomChantier={nomChantier}
                    largeurTitre={largeurTitre}
                    demarrerRedimension={demarrerRedimension}
                    onCliquerTache={setTacheEnEdition}
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2>Électriciens</h2>
                </div>
                {!gantt ? (
                  <EmptyGantt />
                ) : ecranEtroit ? (
                  <ParPersonneMobile
                    groupes={electriciensGantt}
                    nomChantier={nomChantier}
                    onCliquerTache={setTacheEnEdition}
                  />
                ) : (
                  <GanttParPersonne
                    groupes={electriciensGantt}
                    gantt={gantt}
                    nomChantier={nomChantier}
                    largeurTitre={largeurTitre}
                    demarrerRedimension={demarrerRedimension}
                    onCliquerTache={setTacheEnEdition}
                  />
                )}
              </section>
            </>
          )}

          {vue === "charge" && (
            <section className="panel">
              <div className="panel-header">
                <h2>Charge du service</h2>
                <span className="simple-list-meta">
                  Vert : sous 75 % du plafond · Orange : proche · Rouge : dépassé · cliquer une
                  case pour le détail
                </span>
              </div>
              <ChargeTable
                groupes={[
                  { titre: "Automaticiens", personnes: charge.automaticiens },
                  { titre: "Électriciens", personnes: charge.electriciens },
                ]}
                moisTries={charge.moisTries}
                onOuvrirDetail={ouvrirDetail}
              />
            </section>
          )}
        </>
      )}

      {tacheEnEdition && (
        <TacheGanttModal tache={tacheEnEdition} onClose={() => setTacheEnEdition(null)} />
      )}
      {detail && (
        <ChargeDetailModal
          nomPersonne={detail.nomPersonne}
          libelleColonne={detail.libelleColonne}
          entrees={detail.entrees}
          nomChantier={nomChantier}
          tacheParId={tacheParId}
          utilisateurs={utilisateurs}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function EmptyGantt() {
  return (
    <div className="empty-state">
      <p className="empty-state-title">Aucune tâche datée</p>
      <p className="empty-state-description">
        Ces vues affichent les tâches ayant à la fois une date de début et une date de fin.
        Renseignez ces dates dans l'onglet Tâches d'un chantier pour les voir apparaître ici.
      </p>
    </div>
  );
}

function EnteteMois({ gantt, largeurTitre = 180 }) {
  return (
    <div className="gantt-mois-header" style={{ marginLeft: largeurTitre }}>
      <div style={{ position: "relative", height: 24, width: gantt.largeurTotale }}>
        {gantt.mois.map((m) => (
          <div key={m.cle} className="gantt-mois-label" style={{ left: m.left }}>
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function LigneTache({ titre, tache: t, gantt, largeurTitre = 180, demarrerRedimension, onClick }) {
  const left = joursEntre(gantt.debutTimeline, t.dateDebut) * gantt.pxParJour;
  const largeur = Math.max(6, (joursEntre(t.dateDebut, t.echeance) + 1) * gantt.pxParJour);
  const avancement =
    t.avancement !== null && t.avancement !== undefined
      ? Math.max(0, Math.min(100, Number(t.avancement)))
      : null;
  return (
    <div className="gantt-ligne">
      <div className="gantt-ligne-titre" style={{ width: largeurTitre }} title={titre}>
        {titre}
        {demarrerRedimension && (
          <span className="col-resizer" onMouseDown={demarrerRedimension} />
        )}
      </div>
      <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
        {gantt.ligneAujourdHui !== null && (
          <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
        )}
        <button
          type="button"
          className={"gantt-barre gantt-barre-cliquable gantt-barre-" + (t.statut ?? "a_faire")}
          style={{ left, width: largeur }}
          title={
            titre +
            " — " +
            t.dateDebut +
            " → " +
            t.echeance +
            (avancement !== null ? " — " + avancement + "% fait" : "") +
            " — cliquer pour recaler"
          }
          onClick={onClick}
        >
          {avancement !== null && (
            <span className="gantt-barre-remplissage" style={{ width: avancement + "%" }} />
          )}
          {t.heuresPrevues ? (
            <span className="gantt-barre-heures">{t.heuresPrevues} h</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function GanttParPersonne({ groupes, gantt, nomChantier, largeurTitre = 180, demarrerRedimension, onCliquerTache }) {
  if (groupes.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Personne n'a de tâche datée ici.
      </p>
    );
  }
  return (
    <div className="hscroll-auto" style={{ overflowX: "auto" }}>
      <div style={{ minWidth: gantt.largeurTotale + largeurTitre }}>
        <EnteteMois gantt={gantt} largeurTitre={largeurTitre} />
        {groupes.map((groupe) => (
          <div key={groupe.nom} className="gantt-groupe">
            <div className="gantt-groupe-titre" style={{ width: largeurTitre }} title={groupe.nom}>
              {groupe.nom}
            </div>
            {groupe.taches.map((t, i) => (
              <LigneTache
                key={t.id + "-" + i}
                titre={t.chantierId ? nomChantier(t.chantierId) : "À affecter"}
                tache={t}
                gantt={gantt}
                largeurTitre={largeurTitre}
                demarrerRedimension={demarrerRedimension}
                onClick={() => onCliquerTache(t)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
