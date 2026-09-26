import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

// Largeurs de colonnes par défaut (px), redimensionnables et mémorisées —
// même logique que TaskTable / MaterielTablePlat.
const LARGEURS_DEFAUT = {
  chantier: 170,
  designation: 260,
  responsable: 150,
  signalee: 118,
  echeance: 118,
  statut: 120,
  remarque: 200,
  actions: 90,
};

const CLE_STOCKAGE = "reservesTableColWidths";

function chargerLargeurs() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return { ...LARGEURS_DEFAUT };
    return { ...LARGEURS_DEFAUT, ...JSON.parse(brut) };
  } catch {
    return { ...LARGEURS_DEFAUT };
  }
}

function valeurColonne(r, colonne, nomChantier) {
  switch (colonne) {
    case "chantier":
      return r.chantierId ? nomChantier(r.chantierId) : "À affecter";
    case "designation":
      return r.designation || "";
    case "responsable":
      return r.responsable || "";
    case "signalee":
      return r.dateSignalement || "";
    case "echeance":
      return r.dateEcheance || "";
    case "statut":
      return r.statut || "";
    case "remarque":
      return r.remarque || "";
    default:
      return "";
  }
}

// Vue "à plat" des réserves : un seul tableau triable/filtrable/
// redimensionnable par colonne, plutôt que des cartes dépliables par
// chantier — même pattern que TaskTable et MaterielTablePlat.
// `afficherChantier` est à true dans la vue globale (toutes chantiers) et
// à false dans l'onglet Réserves d'un chantier (colonne inutile là).
export default function ReservesTablePlat({
  reserves,
  peutGerer,
  afficherChantier,
  nomChantier,
  onModifier,
  onSupprimer,
}) {
  const [largeurs, setLargeurs] = useState(chargerLargeurs);
  const [tri, setTri] = useState({ colonne: null, sens: 1 });
  const [filtres, setFiltres] = useState({});
  const redimensionRef = useRef(null);

  const reservesFiltrees = useMemo(() => {
    const entreesFiltre = Object.entries(filtres).filter(([, v]) => v && v.trim());
    if (entreesFiltre.length === 0) return reserves;
    return reserves.filter((r) =>
      entreesFiltre.every(([colonne, valeur]) =>
        String(valeurColonne(r, colonne, nomChantier))
          .toLowerCase()
          .includes(valeur.trim().toLowerCase())
      )
    );
  }, [reserves, filtres, nomChantier]);

  const reservesTriees = useMemo(() => {
    const copie = [...reservesFiltrees];
    if (tri.colonne) {
      copie.sort((a, b) => {
        const va = valeurColonne(a, tri.colonne, nomChantier);
        const vb = valeurColonne(b, tri.colonne, nomChantier);
        if (va < vb) return -1 * tri.sens;
        if (va > vb) return 1 * tri.sens;
        return 0;
      });
    } else {
      copie.sort((a, b) => (a.dateEcheance || "").localeCompare(b.dateEcheance || ""));
    }
    return copie;
  }, [reservesFiltrees, tri, nomChantier]);

  useEffect(() => {
    const onMove = (e) => {
      const info = redimensionRef.current;
      if (!info) return;
      const deltaX = e.clientX - info.startX;
      const nouvelle = Math.max(50, info.startWidth + deltaX);
      setLargeurs((prev) => ({ ...prev, [info.colonne]: nouvelle }));
    };
    const onUp = () => {
      if (!redimensionRef.current) return;
      redimensionRef.current = null;
      setLargeurs((actuelles) => {
        try {
          localStorage.setItem(CLE_STOCKAGE, JSON.stringify(actuelles));
        } catch {
          // stockage indisponible : tant pis, on garde juste la taille en mémoire
        }
        return actuelles;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const demarrerRedimension = (colonne) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    redimensionRef.current = { colonne, startX: e.clientX, startWidth: largeurs[colonne] };
  };

  const basculerTri = (colonne) => {
    setTri((t) => {
      if (t.colonne !== colonne) return { colonne, sens: 1 };
      if (t.sens === 1) return { colonne, sens: -1 };
      return { colonne: null, sens: 1 };
    });
  };

  const changerFiltre = (colonne, valeur) => setFiltres((f) => ({ ...f, [colonne]: valeur }));

  const basculerStatut = async (r) => {
    await updateDoc(doc(db, "reserves", r.id), {
      statut: r.statut === "levee" ? "ouverte" : "levee",
    });
  };

  const Entete = ({ colonne, children }) => (
    <th style={{ width: largeurs[colonne], position: "relative" }}>
      <button type="button" className="th-tri-btn" onClick={() => basculerTri(colonne)} title="Trier">
        {children}
        {tri.colonne === colonne ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
      </button>
      <span className="col-resizer" onMouseDown={demarrerRedimension(colonne)} />
    </th>
  );

  const FiltreCell = ({ colonne }) => (
    <th style={{ width: largeurs[colonne] }}>
      <input
        className="th-filtre-input"
        placeholder="Filtrer…"
        value={filtres[colonne] ?? ""}
        onChange={(e) => changerFiltre(colonne, e.target.value)}
      />
    </th>
  );

  if (reserves.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucune réserve.
      </p>
    );
  }

  const nbColonnes = 6 + (afficherChantier ? 1 : 0) + (peutGerer ? 1 : 0);

  return (
    <table className="data-table" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          {afficherChantier && <Entete colonne="chantier">Chantier</Entete>}
          <Entete colonne="designation">Désignation</Entete>
          <Entete colonne="responsable">Responsable</Entete>
          <Entete colonne="signalee">Signalée le</Entete>
          <Entete colonne="echeance">Échéance</Entete>
          <Entete colonne="statut">Statut</Entete>
          <Entete colonne="remarque">Remarque</Entete>
          {peutGerer && <th style={{ width: largeurs.actions }}></th>}
        </tr>
        <tr>
          {afficherChantier && <FiltreCell colonne="chantier" />}
          <FiltreCell colonne="designation" />
          <FiltreCell colonne="responsable" />
          <FiltreCell colonne="signalee" />
          <FiltreCell colonne="echeance" />
          <FiltreCell colonne="statut" />
          <FiltreCell colonne="remarque" />
          {peutGerer && <th></th>}
        </tr>
      </thead>
      <tbody>
        {reservesTriees.length === 0 ? (
          <tr>
            <td colSpan={nbColonnes} style={{ textAlign: "center", padding: "16px 0" }}>
              <span className="simple-list-meta">Aucune réserve ne correspond aux filtres.</span>
            </td>
          </tr>
        ) : (
          reservesTriees.map((r) => (
            <tr key={r.id}>
              {afficherChantier && (
                <td data-label="Chantier" style={{ fontFamily: "var(--font-ui)" }}>
                  {r.chantierId ? (
                    <Link to={"/chantiers/" + r.chantierId}>{nomChantier(r.chantierId)}</Link>
                  ) : (
                    "À affecter"
                  )}
                </td>
              )}
              <td data-label="Désignation" style={{ fontFamily: "var(--font-ui)" }}>
                {r.designation}
              </td>
              <td data-label="Responsable" style={{ fontFamily: "var(--font-ui)" }}>
                {r.responsable || "—"}
              </td>
              <td data-label="Signalée le">{r.dateSignalement || "—"}</td>
              <td data-label="Échéance">{r.dateEcheance || "—"}</td>
              <td data-label="Statut">
                <button
                  className={"btn-ghost" + (r.statut === "levee" ? "" : " btn-danger")}
                  onClick={() => basculerStatut(r)}
                >
                  {r.statut === "levee" ? "Levée ✓" : "Ouverte"}
                </button>
              </td>
              <td data-label="Remarque">
                <span className="simple-list-meta">{r.remarque || "—"}</span>
              </td>
              {peutGerer && (
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" onClick={() => onModifier(r)}>
                      Modifier
                    </button>
                    <button className="btn-ghost btn-danger" onClick={() => onSupprimer(r.id)}>
                      ×
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
