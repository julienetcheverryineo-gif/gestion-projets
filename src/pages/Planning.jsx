import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlanningData, joursEntre, libelleMois, arrondirHeures, PLAFOND_MENSUEL } from "../lib/usePlanningData";
import { useEcranEtroit } from "../lib/useEcranEtroit";
import { normaliserAssignes } from "../lib/assignes";
import { estimerLargeurTexte } from "../lib/texte";
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
  const navigate = useNavigate();

  // Gantt consolidé : cliquer le nom du chantier ou sa barre ouvre sa
  // fiche — sauf pour le groupe "aaffecter" (tâches sans chantier), qui
  // n'a pas de fiche à ouvrir.
  const ouvrirChantierDepuisGantt = (cle) => {
    if (cle && cle !== "aaffecter") navigate("/chantiers/" + cle);
  };

  // Pour permettre l'édition directe depuis le détail d'une case de charge
  // (Planning > Charge du service) : chaque entrée du détail ne contient
  // que ce qu'il faut pour l'affichage (heures reparties sur le mois), pas
  // la tâche complète — on la retrouve ici par id pour l'édition.
  const tacheParId = useMemo(
    () => new Map(toutesLesTaches.map((t) => [t.id, t])),
    [toutesLesTaches]
  );

  // On ne mémorise que l'identité (nom + mois) de la case ouverte, pas son
  // contenu : les entrées affichées sont recalculées à chaque rendu à
  // partir de `charge` (voir plus bas), qui elle-même se met à jour dès
  // qu'une tâche change (écoute Firestore temps réel). Si on figeait
  // `entrees` au moment du clic comme avant, éditer une tâche depuis la
  // modale (heures, dates...) ne mettait à jour ni le total du groupe ni
  // le total en haut de la modale tant qu'on ne la refermait pas.
  const ouvrirDetail = (personne, cle) => {
    setDetail({ nomPersonne: personne.nom, cle });
  };

  const personneDetail = detail
    ? [...charge.automaticiens, ...charge.electriciens].find((p) => p.nom === detail.nomPersonne)
    : null;
  const entreesDetail = !detail || !personneDetail
    ? []
    : detail.cle === "nonPlanifie"
    ? personneDetail.detailNonPlanifie
    : personneDetail.detailParMois[detail.cle] || [];
  const libelleColonneDetail = detail
    ? detail.cle === "nonPlanifie"
      ? "Non planifié"
      : libelleMois(detail.cle)
    : "";

  const automaticiensGantt = gantt?.personneGroupes.filter((g) => g.type === "automaticien") ?? [];
  const electriciensGantt = gantt?.personneGroupes.filter((g) => g.type === "electricien") ?? [];

  // Avancement de chaque chantier (déjà calculé pour les barres du Gantt
  // consolidé) — réutilisé dans la vue "Par personne" pour remplir le
  // trait de chaque chantier selon son avancement global, pas seulement
  // la part de tâches de cette personne.
  const avancementParChantier = useMemo(
    () => new Map((gantt?.chantierBars ?? []).map((cb) => [cb.cle, cb.avancement])),
    [gantt]
  );

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
                <ConsolideMobile chantierBars={gantt.chantierBars} onCliquerChantier={ouvrirChantierDepuisGantt} />
              ) : (
                <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: gantt.largeurTotale + largeurTitre }}>
                    <EnteteMois gantt={gantt} largeurTitre={largeurTitre} />
                    {gantt.chantierBars.map((cb) => {
                      const estAffecte = cb.cle !== "aaffecter";
                      return (
                        <div key={cb.cle} className="gantt-ligne">
                          <div
                            className={"gantt-ligne-titre" + (estAffecte ? " gantt-ligne-titre-cliquable" : "")}
                            style={{ width: largeurTitre }}
                            title={cb.nom + (estAffecte ? " — cliquer pour ouvrir le chantier" : "")}
                            onClick={estAffecte ? () => ouvrirChantierDepuisGantt(cb.cle) : undefined}
                          >
                            {cb.nom}
                            <span
                              className="col-resizer"
                              onMouseDown={demarrerRedimension}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
                            {gantt.ligneAujourdHui !== null && (
                              <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
                            )}
                            <BarreChantierAvancement
                              left={cb.left}
                              largeur={cb.largeur}
                              avancement={cb.avancement}
                              label={[
                                arrondirHeures(cb.heuresTotal) + " h",
                                cb.personnesEnCours.length > 0
                                  ? "Resp : " + cb.personnesEnCours.join(", ")
                                  : null,
                                "Tâches : " + cb.nombreTaches,
                              ]
                                .filter(Boolean)
                                .join(" — ")}
                              title={
                                cb.nom +
                                " — " +
                                arrondirHeures(cb.heuresTotal) +
                                " h restantes" +
                                (cb.avancement !== null ? " — " + cb.avancement + "% fait" : "") +
                                (cb.personnesEnCours.length > 0
                                  ? " — Resp : " + cb.personnesEnCours.join(", ")
                                  : "") +
                                " — " +
                                cb.nombreTaches +
                                " tâche" +
                                (cb.nombreTaches > 1 ? "s" : "") +
                                " restante" +
                                (cb.nombreTaches > 1 ? "s" : "") +
                                (estAffecte ? " — cliquer pour ouvrir le chantier" : "")
                              }
                              onClick={estAffecte ? () => ouvrirChantierDepuisGantt(cb.cle) : undefined}
                            />
                          </div>
                        </div>
                      );
                    })}
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
                            afficherResponsable
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
                    avancementParChantier={avancementParChantier}
                    onCliquerTache={setTacheEnEdition}
                  />
                ) : (
                  <GanttParPersonne
                    groupes={automaticiensGantt}
                    gantt={gantt}
                    nomChantier={nomChantier}
                    avancementParChantier={avancementParChantier}
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
                    avancementParChantier={avancementParChantier}
                    onCliquerTache={setTacheEnEdition}
                  />
                ) : (
                  <GanttParPersonne
                    groupes={electriciensGantt}
                    gantt={gantt}
                    nomChantier={nomChantier}
                    avancementParChantier={avancementParChantier}
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
          libelleColonne={libelleColonneDetail}
          entrees={entreesDetail}
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

// Barre "chantier" (consolidé, ou ligne dépliable de la vue Par
// personne) : une piste claire avec un remplissage plein qui avance
// selon l'avancement (au lieu de l'ancien survol blanc translucide sur
// fond bleu plein, peu lisible). L'étiquette (heures, responsables,
// nombre de tâches...) suit la même règle que les barres de tâche du
// Gantt détaillé (voir LigneTache plus bas), pour un rendu homogène
// entre les deux vues : elle reste DANS la barre tant qu'elle y tient,
// et ne sort à côté que si la barre est trop courte pour l'accueillir.
function BarreChantierAvancement({ left, largeur, avancement, label, title, onClick }) {
  const labelTientDedans = !label || estimerLargeurTexte(label) <= largeur - 10;
  return (
    <>
      <button
        type="button"
        className="gantt-barre-chantier-track"
        style={{ left, width: largeur }}
        title={title}
        onClick={onClick}
      >
        {avancement !== null && (
          <span className="gantt-barre-chantier-fill" style={{ width: avancement + "%" }} />
        )}
        {label && labelTientDedans && (
          <span className="gantt-barre-label-interne">{label}</span>
        )}
      </button>
      {label && !labelTientDedans && (
        <span className="gantt-barre-label" style={{ left: left + largeur + 6 }}>
          {label}
        </span>
      )}
    </>
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

function LigneTache({
  titre,
  tache: t,
  gantt,
  largeurTitre = 180,
  demarrerRedimension,
  afficherResponsable,
  onClick,
}) {
  const left = joursEntre(gantt.debutTimeline, t.dateDebut) * gantt.pxParJour;
  const largeur = Math.max(6, (joursEntre(t.dateDebut, t.echeance) + 1) * gantt.pxParJour);
  const avancement =
    t.avancement !== null && t.avancement !== undefined
      ? Math.max(0, Math.min(100, Number(t.avancement)))
      : null;
  const responsables = afficherResponsable ? normaliserAssignes(t.assigneA) : [];
  const label = [
    t.heuresPrevues ? t.heuresPrevues + " h" : null,
    avancement !== null ? avancement + "%" : null,
    responsables.length > 0 ? responsables.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" — ");
  // Le texte reste DANS la barre (comme avant), en blanc, tant qu'il y
  // tient ; il ne sort à côté (sur le fond de la page) que si la barre
  // est trop courte pour l'accueillir sans être coupé.
  const labelTientDedans = !label || estimerLargeurTexte(label) <= largeur - 10;
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
            (responsables.length > 0 ? " — " + responsables.join(", ") : "") +
            " — cliquer pour recaler"
          }
          onClick={onClick}
        >
          {avancement !== null && (
            <span className="gantt-barre-remplissage" style={{ width: avancement + "%" }} />
          )}
          {label && labelTientDedans && (
            <span className="gantt-barre-label-interne">{label}</span>
          )}
        </button>
        {label && !labelTientDedans && (
          <span className="gantt-barre-label" style={{ left: left + largeur + 6 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// Regroupe les tâches (déjà d'une seule personne) par chantier, dans
// l'ordre de leur première apparition.
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

// Une ligne "chantier" dépliable dans la vue Par personne : se comporte
// comme la barre du Gantt consolidé (même position, même remplissage
// selon l'avancement GLOBAL du chantier — pas seulement la part de
// tâches de cette personne), mais cliquer dessus déplie/replie le détail
// des tâches de la personne sur ce chantier au lieu d'ouvrir la fiche.
function LigneChantierPliable({ sousGroupe, gantt, largeurTitre, demarrerRedimension, ouvert, onBasculer }) {
  const debut = sousGroupe.taches.reduce(
    (min, t) => (t.dateDebut < min ? t.dateDebut : min),
    sousGroupe.taches[0].dateDebut
  );
  const fin = sousGroupe.taches.reduce(
    (max, t) => (t.echeance > max ? t.echeance : max),
    sousGroupe.taches[0].echeance
  );
  const left = joursEntre(gantt.debutTimeline, debut) * gantt.pxParJour;
  const largeur = Math.max(6, (joursEntre(debut, fin) + 1) * gantt.pxParJour);
  const avancement = sousGroupe.avancement;

  return (
    <div className="gantt-ligne">
      <div
        className="gantt-ligne-titre gantt-ligne-titre-cliquable"
        style={{ width: largeurTitre }}
        title={sousGroupe.nom + " — cliquer pour " + (ouvert ? "replier" : "déplier") + " les tâches"}
        onClick={onBasculer}
      >
        <span style={{ marginRight: 4, display: "inline-block", width: 10 }}>{ouvert ? "▾" : "▸"}</span>
        {sousGroupe.nom}
        {demarrerRedimension && (
          <span className="col-resizer" onMouseDown={demarrerRedimension} onClick={(e) => e.stopPropagation()} />
        )}
      </div>
      <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
        {gantt.ligneAujourdHui !== null && (
          <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
        )}
        <BarreChantierAvancement
          left={left}
          largeur={largeur}
          avancement={avancement}
          label={avancement !== null ? avancement + "%" : null}
          title={
            sousGroupe.nom +
            (avancement !== null ? " — " + avancement + "% fait" : "") +
            " — cliquer pour " +
            (ouvert ? "replier" : "déplier") +
            " les tâches"
          }
          onClick={onBasculer}
        />
      </div>
    </div>
  );
}

function GanttParPersonne({
  groupes,
  gantt,
  nomChantier,
  avancementParChantier,
  largeurTitre = 180,
  demarrerRedimension,
  onCliquerTache,
}) {
  const [chantiersOuverts, setChantiersOuverts] = useState(() => new Set());

  if (groupes.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Personne n'a de tâche datée ici.
      </p>
    );
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
    <div className="hscroll-auto" style={{ overflowX: "auto" }}>
      <div style={{ minWidth: gantt.largeurTotale + largeurTitre }}>
        <EnteteMois gantt={gantt} largeurTitre={largeurTitre} />
        {groupes.map((groupe) => {
          const sousGroupes = grouperParChantier(groupe.taches, nomChantier);
          return (
            <div key={groupe.nom} className="gantt-groupe">
              <div className="gantt-groupe-titre" style={{ width: largeurTitre }} title={groupe.nom}>
                {groupe.nom}
              </div>
              {sousGroupes.map((sg) => {
                const cleUnique = groupe.nom + "||" + sg.cle;
                const ouvert = chantiersOuverts.has(cleUnique);
                return (
                  <div key={cleUnique}>
                    <LigneChantierPliable
                      sousGroupe={{ ...sg, avancement: avancementParChantier.get(sg.cle) ?? null }}
                      gantt={gantt}
                      largeurTitre={largeurTitre}
                      demarrerRedimension={demarrerRedimension}
                      ouvert={ouvert}
                      onBasculer={() => basculer(cleUnique)}
                    />
                    {ouvert &&
                      sg.taches.map((t, i) => (
                        <LigneTache
                          key={t.id + "-" + i}
                          titre={t.titre}
                          tache={t}
                          gantt={gantt}
                          largeurTitre={largeurTitre}
                          demarrerRedimension={demarrerRedimension}
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
    </div>
  );
}
