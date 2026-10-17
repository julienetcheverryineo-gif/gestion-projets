import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "../../lib/firestoreHooks";
import { libelleChantier } from "../../lib/usePlanningData";
import { texteBrut } from "../../lib/sanitizeHtml";
import { estChantierAutomatisme } from "../../components/SiteFormModal";
import ReservesAuto from "./ReservesAuto";
import NotesAuto from "./NotesAuto";
import { FeuilleSynchro, PuceSynchro, Squelette } from "../../components/mobile/Ui";
import { IcNote } from "../../components/mobile/Icones";

function Tete({ titre, sous, children }) {
  const [synchro, setSynchro] = useState(false);
  return (
    <header className="m-entete">
      <div className="m-entete-ligne">
        <h1>{titre}</h1>
        <PuceSynchro onClick={() => setSynchro(true)} />
      </div>
      {sous && <p className="m-entete-sous">{sous}</p>}
      {children}
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
    </header>
  );
}

// Toutes les réserves, tous chantiers confondus (version téléphone).
export function ReservesGlobalMobile() {
  const { documents: reserves, chargement } = useCollection("reserves");
  const { documents: chantiers } = useCollection("sites");
  const nomChantier = (id) => libelleChantier(chantiers.find((c) => c.id === id));
  return (
    <div className="m-page">
      <Tete titre="Réserves" sous="Tous les chantiers" />
      <div className="m-tour">{chargement ? <Squelette /> : <ReservesAuto reserves={reserves} nomChantier={nomChantier} />}</div>
    </div>
  );
}

function dateCourte(ts) {
  return ts?.toDate ? ts.toDate().toLocaleDateString("fr-FR") : "";
}

// Notes générales + synthèse par affaire (version téléphone).
export function NotesGlobalMobile() {
  const navigate = useNavigate();
  const [vue, setVue] = useState("generales");
  const { documents: chantiers } = useCollection("sites");
  const { documents: notes, chargement } = useCollection("notes");
  const synthese = useMemo(() => {
    const m = new Map();
    notes.forEach((n) => {
      if (!n.chantierId) return;
      if (!m.has(n.chantierId)) m.set(n.chantierId, []);
      m.get(n.chantierId).push(n);
    });
    return [...m.entries()]
      .map(([id, l]) => ({ id, chantier: chantiers.find((c) => c.id === id), nb: l.length, derniere: l[0] }))
      .filter((x) => x.chantier && estChantierAutomatisme(x.chantier))
      .sort((a, b) => (b.derniere?.creeLe?.seconds || 0) - (a.derniere?.creeLe?.seconds || 0));
  }, [notes, chantiers]);
  const ouvrir = (id) => {
    try {
      sessionStorage.setItem("ficheAutoOnglet", "notes");
    } catch {
      // stockage indisponible
    }
    navigate("/chantiers/" + id);
  };
  return (
    <div className="m-page">
      <Tete titre="Notes">
        <div className="m-segments" role="tablist">
          <button type="button" className={vue === "generales" ? "actif" : ""} onClick={() => setVue("generales")}>
            Générales
          </button>
          <button type="button" className={vue === "affaires" ? "actif" : ""} onClick={() => setVue("affaires")}>
            Par affaire
          </button>
        </div>
      </Tete>
      <div className="m-tour">
        {vue === "generales" ? (
          <NotesAuto vide="Aucune note générale" />
        ) : chargement ? (
          <Squelette />
        ) : synthese.length === 0 ? (
          <div className="m-vide">
            <IcNote taille={34} />
            <strong>Aucune note sur un chantier</strong>
          </div>
        ) : (
          <ul className="m-liste-simple">
            {synthese.map((x) => (
              <li key={x.id}>
                <button type="button" className="m-ligne-auto" onClick={() => ouvrir(x.id)}>
                  <div className="m-ligne-auto-tete">
                    <strong>{libelleChantier(x.chantier)}</strong>
                    <span className="m-statut-tache">{x.nb}</span>
                  </div>
                  <span className="m-ligne-auto-sous m-extrait">{texteBrut(x.derniere?.texte)}</span>
                  <span className="m-point-meta">
                    {dateCourte(x.derniere?.creeLe)} · {x.derniere?.auteur}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Problèmes rencontrés (espace Électricité) : note partagée.
export function ProblemesElecMobile() {
  return (
    <div className="m-page">
      <Tete titre="Problèmes" sous="Note partagée de l'espace Électricité" />
      <div className="m-tour">
        <NotesAuto portee="elec-problemes" vide="Aucun problème noté pour l'instant" />
      </div>
    </div>
  );
}
