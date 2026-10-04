import { useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";
import { correspondARecherche } from "../lib/recherche";
import { analyserListePoints } from "../lib/importListePoints";
import { STATUTS_POINT } from "../lib/testsExcel";

// Import du fichier "Listing des points et équipements" d'un chantier :
// chaque ligne devient un point de test, groupé par équipement (bâtiment +
// niveau + équipement). Un équipement déjà présent (même nom) est complété
// plutôt que dupliqué, ce qui permet de ré-importer une révision plus
// récente du fichier sans tout recréer.
function ImporterListePointsModal({ chantierId, equipements, tousPoints, onClose }) {
  const [analyse, setAnalyse] = useState(null);
  const [nomFichier, setNomFichier] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resultat, setResultat] = useState(null);

  const choisirFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setResultat(null);
    setAnalyse(null);
    setNomFichier(fichier.name);
    try {
      const buffer = await fichier.arrayBuffer();
      const r = analyserListePoints(buffer);
      if (r.erreur) setErreur(r.erreur);
      else setAnalyse(r);
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
    }
  };

  const importer = async () => {
    if (!analyse) return;
    setEnCours(true);
    setErreur("");
    try {
      const TAILLE_LOT = 450;

      // 1) Équipements : on réutilise ceux qui existent déjà pour ce
      // chantier (même nom), on crée les autres.
      const equipementIdParNom = new Map(
        equipements.map((e) => [e.nom.trim().toLowerCase(), e.id])
      );
      const nouveauxEquipements = [];
      const resolutions = analyse.equipementsGroupes.map((groupe) => {
        const cle = groupe.nom.trim().toLowerCase();
        let id = equipementIdParNom.get(cle);
        if (!id) {
          const ref = doc(collection(db, "testEquipements"));
          id = ref.id;
          equipementIdParNom.set(cle, id);
          nouveauxEquipements.push({ ref, groupe });
        }
        return { groupe, equipementId: id };
      });

      for (let depart = 0; depart < nouveauxEquipements.length; depart += TAILLE_LOT) {
        const lot = nouveauxEquipements.slice(depart, depart + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach(({ ref, groupe }, i) => {
          batch.set(ref, {
            nom: groupe.nom,
            batiment: groupe.batiment,
            niveau: groupe.niveau,
            equipement: groupe.equipement,
            chantierId,
            ordre: Date.now() + depart + i,
            creeLe: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      // 2) Points : ajoutés à la suite des points déjà existants de chaque
      // équipement (le sien, pas ceux des autres équipements).
      const nbExistantsParEquip = new Map();
      tousPoints.forEach((p) => {
        nbExistantsParEquip.set(
          p.testEquipementId,
          (nbExistantsParEquip.get(p.testEquipementId) || 0) + 1
        );
      });

      const tousNouveauxPoints = [];
      resolutions.forEach(({ groupe, equipementId }) => {
        const depart = nbExistantsParEquip.get(equipementId) || 0;
        groupe.points.forEach((pt, i) => {
          tousNouveauxPoints.push({ ...pt, testEquipementId: equipementId, ordre: depart + i });
        });
        nbExistantsParEquip.set(equipementId, depart + groupe.points.length);
      });

      for (let depart = 0; depart < tousNouveauxPoints.length; depart += TAILLE_LOT) {
        const lot = tousNouveauxPoints.slice(depart, depart + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach((pt) => {
          const ref = doc(collection(db, "testPoints"));
          batch.set(ref, {
            ...pt,
            chantierId,
            statut: "non_teste",
            valeurMesuree: "",
            commentaire: "",
            testePar: null,
            testeLe: null,
            creeLe: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      setResultat({
        nbPoints: tousNouveauxPoints.length,
        nbEquipements: nouveauxEquipements.length,
        nbEquipementsReutilises: resolutions.length - nouveauxEquipements.length,
      });
      setAnalyse(null);
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <h2>Importer une liste de points (Excel)</h2>
        <p className="empty-state-description" style={{ margin: "0 0 10px" }}>
          Fichier au format « Listing des points et équipements » (feuille ListePoints) : chaque
          ligne devient un point de test, groupé par bâtiment/niveau/équipement. Un équipement déjà
          présent avec le même nom est complété plutôt que dupliqué — vous pouvez donc ré-importer
          une révision plus récente du fichier.
        </p>
        {!resultat && <input type="file" accept=".xlsx,.xls" onChange={choisirFichier} />}
        {nomFichier && !analyse && !erreur && !resultat && (
          <p className="page-subtitle">Analyse de {nomFichier}…</p>
        )}
        {erreur && <div className="form-error">{erreur}</div>}
        {analyse && !resultat && (
          <>
            <p className="page-subtitle" style={{ margin: "10px 0" }}>
              {analyse.equipementsGroupes.length} équipement(s), {analyse.nbPoints} point(s)
              détecté(s)
              {analyse.nbIgnores > 0 &&
                " (" +
                  analyse.nbIgnores +
                  " ligne(s) ignorée(s) : vide, supprimée ou sans équipement)"}
              .
            </p>
            <ul style={{ maxHeight: 220, overflow: "auto", margin: "0 0 12px", paddingLeft: 18 }}>
              {analyse.equipementsGroupes.map((g) => (
                <li key={g.nom}>
                  {g.nom} — {g.points.length} point(s)
                  {equipements.some((e) => e.nom.trim().toLowerCase() === g.nom.trim().toLowerCase()) && (
                    <span className="simple-list-meta"> (équipement existant, complété)</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {resultat && (
          <p className="page-subtitle" style={{ margin: "10px 0" }}>
            Import terminé : {resultat.nbPoints} point(s) ajouté(s)
            {resultat.nbEquipements > 0 &&
              ", " + resultat.nbEquipements + " nouvel(aux) équipement(s)"}
            {resultat.nbEquipementsReutilises > 0 &&
              " (" + resultat.nbEquipementsReutilises + " équipement(s) existant(s) complété(s))"}
            .
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {resultat ? "Fermer" : "Annuler"}
          </button>
          {analyse && !resultat && (
            <button type="button" className="btn-primary" disabled={enCours} onClick={importer}>
              {enCours ? "Import…" : "Importer " + analyse.nbPoints + " point(s)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const COLONNES_TRIABLES = [
  { champ: "batiment", label: "Bâtiment" },
  { champ: "niveau", label: "Niveau" },
  { champ: "equipement", label: "Équipement" },
  { champ: "sousEquipement", label: "Sous-équipement" },
  { champ: "repere", label: "Repère" },
  { champ: "designation", label: "Désignation" },
  { champ: "typeImport", label: "Type" },
  { champ: "entreprise", label: "Entreprise" },
  { champ: "statut", label: "Statut test" },
];

function EnteteTriable({ champ, label, triChamp, triSens, onTrier }) {
  const actif = triChamp === champ;
  return (
    <th>
      <button type="button" className="th-tri-btn" onClick={() => onTrier(champ)}>
        {label}
        {actif ? (triSens === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

export default function ListePointsPanel({ chantierId, peutGerer }) {
  const { documents: toutesEquipements } = useCollection("testEquipements");
  const { documents: tousPoints } = useCollection("testPoints");
  const equipements = toutesEquipements.filter((e) => e.chantierId === chantierId);
  const points = tousPoints.filter((p) => p.chantierId === chantierId);

  const [afficherImport, setAfficherImport] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [triChamp, setTriChamp] = useState("equipement");
  const [triSens, setTriSens] = useState("asc");
  const [nbAffiches, setNbAffiches] = useState(50);

  const statutLabel = (statut) => STATUTS_POINT.find((s) => s.value === statut)?.label || statut;

  const filtres = points.filter((p) =>
    correspondARecherche(recherche, [
      p.batiment,
      p.niveau,
      p.equipement,
      p.sousEquipement,
      p.repere,
      p.designation,
      p.typeImport,
      p.type,
      p.entreprise,
      p.commentaireImport,
      p.adresse,
    ])
  );

  const trier = (champ) => {
    if (triChamp === champ) setTriSens(triSens === "asc" ? "desc" : "asc");
    else {
      setTriChamp(champ);
      setTriSens("asc");
    }
  };

  const valeurTri = (p, champ) =>
    champ === "statut" ? statutLabel(p.statut).toLowerCase() : String(p[champ] ?? "").toLowerCase();
  const tries = [...filtres].sort((a, b) => {
    const cmp = valeurTri(a, triChamp).localeCompare(valeurTri(b, triChamp), "fr");
    return triSens === "asc" ? cmp : -cmp;
  });

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Liste des points</h2>
        {peutGerer && (
          <button className="btn-primary" onClick={() => setAfficherImport(true)}>
            📥 Importer un fichier Excel
          </button>
        )}
      </div>

      {points.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun point importé pour l'instant</p>
          <p className="empty-state-description">
            Importez le fichier « Listing des points et équipements » de ce chantier : les
            équipements et leurs points seront créés ici et dans l'onglet Tests, prêts à être
            testés sur le terrain.
          </p>
        </div>
      ) : (
        <>
          <p className="page-subtitle" style={{ margin: "-6px 0 14px" }}>
            {equipements.length} équipement(s), {points.length} point(s)
          </p>
          <input
            placeholder="Rechercher (ex. chaufferie ventilateur, ou TA;TS)"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {COLONNES_TRIABLES.map((c) => (
                    <EnteteTriable
                      key={c.champ}
                      champ={c.champ}
                      label={c.label}
                      triChamp={triChamp}
                      triSens={triSens}
                      onTrier={trier}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {tries.slice(0, nbAffiches).map((p) => (
                  <tr key={p.id}>
                    <td data-label="Bâtiment">{p.batiment}</td>
                    <td data-label="Niveau">{p.niveau}</td>
                    <td data-label="Équipement">{p.equipement}</td>
                    <td data-label="Sous-équipement">{p.sousEquipement}</td>
                    <td data-label="Repère" style={{ fontFamily: "var(--font-mono)" }}>
                      {p.repere}
                    </td>
                    <td data-label="Désignation">{p.designation}</td>
                    <td data-label="Type">{p.typeImport || p.type}</td>
                    <td data-label="Entreprise">{p.entreprise}</td>
                    <td data-label="Statut test">{statutLabel(p.statut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tries.length > nbAffiches && (
            <button
              className="btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => setNbAffiches((n) => n + 50)}
            >
              Afficher plus ({tries.length - nbAffiches} restants)
            </button>
          )}
        </>
      )}

      {afficherImport && (
        <ImporterListePointsModal
          chantierId={chantierId}
          equipements={equipements}
          tousPoints={points}
          onClose={() => setAfficherImport(false)}
        />
      )}
    </section>
  );
}
