import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useDonneesAuto, formatDateCourte, tacheEnRetard } from "../../lib/useDonneesAuto";
import { champsAvancement } from "../../lib/statutTache";
import { pourcentageAvancementTache } from "../../lib/avancement";
import { normaliserAssignes } from "../../lib/assignes";
import { libelleChantier } from "../../lib/usePlanningData";
import { ecrire } from "../../lib/ecritureMobile";
import { Barre, Feuille, FeuilleSynchro, PuceSynchro, Squelette, afficherToast, pct0 } from "../../components/mobile/Ui";
import { IcTaches } from "../../components/mobile/Icones";

export const STATUTS_TACHE = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
  { value: "suspendu", label: "Suspendu" },
];
const libStatut = (s) => STATUTS_TACHE.find((x) => x.value === (s || "a_faire"))?.label || "À faire";

// Liste de tâches (cartes), partagée entre l'onglet Tâches et la fiche chantier.
export function ListeTaches({ taches, chantiers, afficherChantier, vide }) {
  const [ouverte, setOuverte] = useState(null);
  const tache = taches.find((t) => t.id === ouverte) || null;
  const chantierDe = (t) => chantiers.find((c) => c.id === t.chantierId);
  if (taches.length === 0) {
    return (
      <div className="m-vide">
        <IcTaches taille={34} />
        <strong>{vide || "Aucune tâche"}</strong>
      </div>
    );
  }
  return (
    <>
      <ul className="m-liste-simple">
        {taches.map((t) => {
          const pct = pourcentageAvancementTache(t);
          const retard = tacheEnRetard(t);
          return (
            <li key={t.id}>
              <button type="button" className={"m-ligne-auto" + (retard ? " retard" : "")} onClick={() => setOuverte(t.id)}>
                <div className="m-ligne-auto-tete">
                  <strong>{t.titre}</strong>
                  <span className={"m-statut-tache s-" + (t.statut || "a_faire")}>{libStatut(t.statut)}</span>
                </div>
                {afficherChantier && <span className="m-ligne-auto-sous">{libelleChantier(chantierDe(t))}</span>}
                <div className="m-ligne-auto-pied">
                  <Barre valeur={pct} fin couleur={retard ? "var(--m-rouge)" : "var(--m-vert)"} />
                  <b>{pct0(pct)}</b>
                  <span className={retard ? "m-txt-alerte" : ""}>{t.echeance ? "avant le " + formatDateCourte(t.echeance) : "sans échéance"}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {tache && <FeuilleTache tache={tache} chantier={chantierDe(tache)} onFermer={() => setOuverte(null)} />}
    </>
  );
}

function FeuilleTache({ tache, chantier, onFermer }) {
  const [valeur, setValeur] = useState(pourcentageAvancementTache(tache));
  const dernier = useRef(valeur);
  const envoye = useRef(valeur);
  useEffect(() => {
    // rafraîchit si la tâche change ailleurs
    setValeur(pourcentageAvancementTache(tache));
    dernier.current = envoye.current = pourcentageAvancementTache(tache);
  }, [tache.avancement, tache.statut]); // eslint-disable-line react-hooks/exhaustive-deps

  const valider = (v) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v) / 5) * 5));
    if (n === envoye.current) return;
    envoye.current = n;
    ecrire(updateDoc(doc(db, "tasks", tache.id), champsAvancement(tache, n)));
  };
  // enregistre la dernière valeur si la feuille se ferme en plein geste
  useEffect(() => () => valider(dernier.current), []); // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = (v) => {
    setValeur(v);
    dernier.current = v;
    valider(v);
  };
  const statut = (s) => {
    const avant = tache.statut ?? "a_faire";
    if (s === avant) return;
    ecrire(updateDoc(doc(db, "tasks", tache.id), { statut: s }));
    afficherToast("« " + tache.titre + " » : " + libStatut(s), {
      label: "Annuler",
      onClick: () => ecrire(updateDoc(doc(db, "tasks", tache.id), { statut: avant })),
    });
  };
  const resp = normaliserAssignes(tache.assigneA);
  return (
    <Feuille titre={tache.titre} sousTitre={libelleChantier(chantier)} onFermer={onFermer}>
      <div className="m-infos-tache">
        {resp.length > 0 && <span>👤 {resp.join(", ")}</span>}
        {(tache.dateDebut || tache.echeance) && (
          <span>
            📅 {formatDateCourte(tache.dateDebut)} → {formatDateCourte(tache.echeance)}
          </span>
        )}
        {tache.heuresPrevues ? <span>⏱ {tache.heuresPrevues} h prévues</span> : null}
      </div>
      <h3 className="m-sous-titre">Statut</h3>
      <div className="m-choix-grille">
        {STATUTS_TACHE.map((s) => (
          <button key={s.value} type="button" className={(tache.statut ?? "a_faire") === s.value ? "actif" : ""} onClick={() => statut(s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      <h3 className="m-sous-titre">
        Avancement <b className="m-valeur-grande">{pct0(valeur)}</b>
      </h3>
      <input
        className="m-curseur"
        type="range"
        min="0"
        max="100"
        step="5"
        value={valeur}
        onChange={(e) => {
          setValeur(Number(e.target.value));
          dernier.current = Number(e.target.value);
        }}
        onPointerUp={() => valider(dernier.current)}
        onTouchEnd={() => valider(dernier.current)}
        onKeyUp={() => valider(dernier.current)}
        onBlur={() => valider(dernier.current)}
        aria-label="Avancement"
      />
      <div className="m-rapides-pct">
        {[0, 25, 50, 75, 100].map((v) => (
          <button key={v} type="button" onClick={() => choisir(v)}>
            {v} %
          </button>
        ))}
      </div>
    </Feuille>
  );
}

// Onglet « Tâches » : les miennes d'abord, filtrables.
export default function TachesAuto() {
  const { profile } = useAuth();
  const d = useDonneesAuto(profile);
  const [portee, setPortee] = useState("miennes");
  const [filtre, setFiltre] = useState("encours");
  const [synchro, setSynchro] = useState(false);
  const base = portee === "miennes" ? d.mesTaches : d.taches.filter((t) => d.chantiers.some((c) => c.id === t.chantierId));
  const rang = (t) => (tacheEnRetard(t) ? 0 : 1);
  const liste = base
    .filter((t) => (filtre === "encours" ? t.statut !== "termine" : filtre === "retard" ? tacheEnRetard(t) : true))
    .slice()
    .sort((a, b) => rang(a) - rang(b) || String(a.echeance || "9999").localeCompare(String(b.echeance || "9999")));
  const nbRetard = base.filter(tacheEnRetard).length;
  return (
    <div className="m-page">
      <header className="m-entete">
        <div className="m-entete-ligne">
          <h1>Tâches</h1>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </div>
        <p className="m-entete-sous">
          {d.chargement ? "Chargement…" : base.length + " tâche(s)"}
          {nbRetard > 0 && (
            <>
              {" · "}
              <b className="m-txt-alerte">{nbRetard} en retard</b>
            </>
          )}
        </p>
        <div className="m-segments" role="tablist">
          <button type="button" className={portee === "miennes" ? "actif" : ""} onClick={() => setPortee("miennes")}>
            Mes tâches
          </button>
          <button type="button" className={portee === "toutes" ? "actif" : ""} onClick={() => setPortee("toutes")}>
            Toutes
          </button>
        </div>
        <div className="m-filtres">
          {[
            ["encours", "À faire"],
            ["retard", "En retard"],
            ["tout", "Toutes"],
          ].map(([k, l]) => (
            <button key={k} type="button" className={filtre === k ? "actif" : ""} onClick={() => setFiltre(k)}>
              {l}
            </button>
          ))}
        </div>
      </header>
      {d.chargement ? <Squelette /> : <ListeTaches taches={liste} chantiers={d.chantiers} afficherChantier vide={portee === "miennes" ? "Aucune tâche ne vous est assignée" : "Aucune tâche"} />}
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
    </div>
  );
}
