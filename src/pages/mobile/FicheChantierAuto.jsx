import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDonneesAuto, tacheEnRetard } from "../../lib/useDonneesAuto";
import { formatStatutChantier } from "../../components/SiteFormModal";
import { Anneau, Barre, FeuilleSynchro, PuceSynchro, Squelette, pct0 } from "../../components/mobile/Ui";
import { IcRetour } from "../../components/mobile/Icones";
import { ListeTaches } from "./TachesAuto";
import TestsAuto from "./TestsAuto";
import ReservesAuto from "./ReservesAuto";
import NotesAuto from "./NotesAuto";

const CLE = "ficheAutoOnglet";
const ONGLETS = [
  ["synthese", "Synthèse"],
  ["tests", "Tests"],
  ["taches", "Tâches"],
  ["reserves", "Réserves"],
  ["notes", "Notes"],
];
const lire = () => {
  try {
    const v = sessionStorage.getItem(CLE);
    return ONGLETS.some(([k]) => k === v) ? v : "synthese";
  } catch {
    return "synthese";
  }
};

// Fiche chantier Automatisme & GTB, version téléphone.
export default function FicheChantierAuto() {
  const { chantierId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const d = useDonneesAuto(profile);
  const [onglet, setOnglet] = useState(lire);
  const [synchro, setSynchro] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(CLE, onglet);
    } catch {
      // stockage indisponible
    }
    window.scrollTo?.(0, 0);
  }, [onglet]);

  const chantier = d.chantiers.find((c) => c.id === chantierId);
  if (d.chargement) return <Squelette />;
  if (!chantier) {
    return (
      <div className="m-page">
        <header className="m-entete">
          <button type="button" className="m-retour" onClick={() => navigate("/chantiers")}>
            <IcRetour taille={20} /> Chantiers
          </button>
        </header>
        <div className="m-vide">
          <strong>Chantier introuvable</strong>
          <span>Il a peut-être été supprimé, ou n'est pas encore chargé sur ce téléphone.</span>
        </div>
      </div>
    );
  }
  const r = d.resume[chantier.id];
  const taches = d.taches.filter((t) => t.chantierId === chantierId).sort((a, b) => String(a.echeance || "9999").localeCompare(String(b.echeance || "9999")));
  const reserves = d.reserves.filter((x) => x.chantierId === chantierId);
  const equipements = d.testEquipements.filter((e) => e.chantierId === chantierId);
  const points = d.testPoints.filter((p) => p.chantierId === chantierId);
  const badge = { tests: r.tests.restants, taches: r.tachesRetard, reserves: r.reservesOuvertes };

  return (
    <div className="m-page m-fiche">
      <header className="m-entete collant">
        <div className="m-entete-ligne">
          <button type="button" className="m-icone-btn" onClick={() => navigate("/chantiers")} aria-label="Retour aux chantiers">
            <IcRetour />
          </button>
          <div className="m-fiche-titres">
            <h1>{chantier.nom}</h1>
            <p>{[chantier.client, chantier.compte].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </div>
        <div className="m-onglets-fiche" role="tablist">
          {ONGLETS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={onglet === k} className={onglet === k ? "actif" : ""} onClick={() => setOnglet(k)}>
              {l}
              {badge[k] > 0 && <i className={k === "taches" ? "danger" : ""}>{badge[k]}</i>}
            </button>
          ))}
        </div>
      </header>

      {onglet === "synthese" && (
        <div className="m-tour">
          <div className="m-carte-blanche m-hero-auto">
            <Anneau valeur={r.avancement ?? 0}>
              <b>{r.avancement == null ? "—" : pct0(r.avancement)}</b>
              <small>avancement</small>
            </Anneau>
            <div className="m-hero-auto-txt">
              <strong>{formatStatutChantier(chantier.statut)}</strong>
              <span>{r.nbTaches} tâche(s)</span>
              {chantier.responsableChantier && <span>Resp. : {chantier.responsableChantier}</span>}
              {chantier.automaticiens?.length > 0 && <span>Auto. : {chantier.automaticiens.join(", ")}</span>}
              {chantier.electriciens?.length > 0 && <span>Élec. : {chantier.electriciens.join(", ")}</span>}
            </div>
          </div>
          <button type="button" className="m-carte-blanche m-tuile-lien" onClick={() => setOnglet("tests")}>
            <div>
              <strong>Tests point à point</strong>
              <span>
                {r.tests.total === 0 ? "Aucun point" : r.tests.faits + " / " + r.tests.total + " traités"}
                {r.tests.ko > 0 && <b className="m-txt-alerte"> · {r.tests.ko} KO</b>}
              </span>
              <Barre valeur={r.tests.pct ?? 0} fin couleur={r.tests.ko > 0 ? "var(--m-rouge)" : "var(--m-vert)"} />
            </div>
            <b>{r.tests.pct == null ? "—" : r.tests.pct + " %"}</b>
          </button>
          <button type="button" className="m-carte-blanche m-tuile-lien" onClick={() => setOnglet("reserves")}>
            <div>
              <strong>Réserves</strong>
              <span>
                {r.reservesOuvertes} ouverte(s)
                {r.reservesRetard > 0 && <b className="m-txt-alerte"> · {r.reservesRetard} en retard</b>}
              </span>
            </div>
            <b>{r.reservesOuvertes}</b>
          </button>
          <h2 className="m-titre-section">Tâches à suivre</h2>
          <ListeTaches taches={taches.filter((t) => t.statut !== "termine" && (tacheEnRetard(t) || t.statut === "en_cours")).slice(0, 6)} chantiers={d.chantiers} vide="Rien d'urgent" />
        </div>
      )}
      {onglet === "tests" && <TestsAuto equipements={equipements} points={points} nomTesteur={profile?.nom || "?"} />}
      {onglet === "taches" && (
        <div className="m-tour">
          <ListeTaches taches={taches} chantiers={d.chantiers} vide="Aucune tâche sur ce chantier" />
        </div>
      )}
      {onglet === "reserves" && (
        <div className="m-tour">
          <ReservesAuto reserves={reserves} />
        </div>
      )}
      {onglet === "notes" && (
        <div className="m-tour">
          <NotesAuto chantierId={chantierId} />
        </div>
      )}
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
    </div>
  );
}
