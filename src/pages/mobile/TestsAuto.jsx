import { useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { statsTests } from "../../lib/useDonneesAuto";
import { correspondARecherche } from "../../lib/recherche";
import { ecrire } from "../../lib/ecritureMobile";
import { Barre, afficherToast } from "../../components/mobile/Ui";
import { IcChevron, IcRecherche, IcTest } from "../../components/mobile/Icones";

const LIB = { ok: "OK", ko: "KO", annule: "Annulé", non_teste: "Non testé" };

function dateHeure(ts) {
  if (!ts?.toDate) return "à l'instant";
  const d = ts.toDate();
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Tests point à point : le cœur de la mise en service, au doigt.
export default function TestsAuto({ equipements, points, nomTesteur }) {
  const [filtre, setFiltre] = useState("restants");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [detail, setDetail] = useState(null);

  const eqTries = useMemo(() => equipements.slice().sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)), [equipements]);
  const parEq = useMemo(() => {
    const m = {};
    points.forEach((p) => (m[p.testEquipementId] ||= []).push(p));
    Object.values(m).forEach((l) => l.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)));
    return m;
  }, [points]);
  const global = statsTests(points);
  const ouvertEffectif = ouvert ?? eqTries.find((e) => statsTests(parEq[e.id] || []).restants > 0)?.id ?? eqTries[0]?.id;

  const passe = (p) => (filtre === "restants" ? p.statut !== "ok" && p.statut !== "ko" && p.statut !== "annule" : filtre === "ko" ? p.statut === "ko" : true);
  const q = recherche.trim();

  const changer = (p, statut) => {
    const avant = { statut: p.statut ?? "non_teste", testePar: p.testePar ?? null, testeLe: p.testeLe ?? null };
    const cible = p.statut === statut ? "non_teste" : statut;
    const decision = cible !== "non_teste";
    ecrire(
      updateDoc(doc(db, "testPoints", p.id), {
        statut: cible,
        testePar: decision ? nomTesteur : null,
        testeLe: decision ? serverTimestamp() : null,
      })
    );
    afficherToast(p.repere + " : " + LIB[cible], {
      label: "Annuler",
      onClick: () => ecrire(updateDoc(doc(db, "testPoints", p.id), avant)),
    });
  };
  const champ = (p, nom, valeur) => {
    if ((p[nom] || "") === valeur) return;
    ecrire(updateDoc(doc(db, "testPoints", p.id), { [nom]: valeur }));
  };

  if (eqTries.length === 0) {
    return (
      <div className="m-vide">
        <IcTest taille={34} />
        <strong>Aucun test sur ce chantier</strong>
        <span>La liste des points à tester se prépare depuis la version complète (import Excel ou saisie).</span>
      </div>
    );
  }

  const carte = (p, avecEq) => (
    <li key={p.id} className={"m-point s-" + (p.statut || "non_teste")}>
      <div className="m-point-tete">
        <b>{p.repere}</b>
        {p.type && <span className="m-puce-type">{p.type}</span>}
        <span className="m-point-des">{p.designation}</span>
      </div>
      {avecEq && <span className="m-point-eq">{eqTries.find((e) => e.id === p.testEquipementId)?.nom}</span>}
      <div className="m-point-boutons">
        <button type="button" className={"ok" + (p.statut === "ok" ? " actif" : "")} onClick={() => changer(p, "ok")}>
          OK
        </button>
        <button type="button" className={"ko" + (p.statut === "ko" ? " actif" : "")} onClick={() => changer(p, "ko")}>
          KO
        </button>
        <button type="button" className={"annule" + (p.statut === "annule" ? " actif" : "")} onClick={() => changer(p, "annule")}>
          N/A
        </button>
      </div>
      {p.testePar && (
        <span className="m-point-meta">
          {LIB[p.statut]} · {p.testePar} · {dateHeure(p.testeLe)}
        </span>
      )}
      {(p.valeurMesuree || p.commentaire) && detail !== p.id && (
        <span className="m-point-meta">
          {p.valeurMesuree ? "Mesure : " + p.valeurMesuree : ""}
          {p.valeurMesuree && p.commentaire ? " · " : ""}
          {p.commentaire}
        </span>
      )}
      <button type="button" className="m-lien" onClick={() => setDetail(detail === p.id ? null : p.id)}>
        {detail === p.id ? "Masquer" : "Valeur mesurée / commentaire"}
      </button>
      {detail === p.id && (
        <div className="m-point-saisie">
          <label>
            Valeur mesurée
            <input defaultValue={p.valeurMesuree ?? ""} inputMode="decimal" onBlur={(e) => champ(p, "valeurMesuree", e.target.value)} />
          </label>
          <label>
            Commentaire
            <textarea rows={2} defaultValue={p.commentaire ?? ""} onBlur={(e) => champ(p, "commentaire", e.target.value)} />
          </label>
        </div>
      )}
    </li>
  );

  return (
    <div className="m-tests">
      <div className="m-carte-blanche m-tests-resume">
        <div className="m-tests-chiffres">
          <b>{global.pct == null ? "—" : global.pct + " %"}</b>
          <span>
            {global.faits} / {global.total} points traités
          </span>
        </div>
        <Barre valeur={global.pct ?? 0} />
        <div className="m-puces">
          <span className="m-puce ok">{global.ok} OK</span>
          {global.ko > 0 && <span className="m-puce danger">{global.ko} KO</span>}
          {global.annule > 0 && <span className="m-puce info">{global.annule} N/A</span>}
          <span className="m-puce">{global.restants} restants</span>
        </div>
      </div>

      <label className="m-recherche">
        <IcRecherche taille={18} />
        <input type="search" placeholder="Repère, désignation…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </label>
      <div className="m-filtres">
        {[
          ["restants", "Non testés"],
          ["ko", "KO"],
          ["tous", "Tous"],
        ].map(([k, l]) => (
          <button key={k} type="button" className={filtre === k ? "actif" : ""} onClick={() => setFiltre(k)}>
            {l}
          </button>
        ))}
      </div>

      {q ? (
        (() => {
          const trouves = points.filter((p) => passe(p) && correspondARecherche(q, [p.repere, p.designation, p.type, p.commentaire])).sort((a, b) => String(a.repere).localeCompare(String(b.repere), "fr", { numeric: true }));
          return trouves.length === 0 ? <p className="m-note-source">Aucun point ne correspond.</p> : <ul className="m-points">{trouves.slice(0, 80).map((p) => carte(p, true))}</ul>;
        })()
      ) : (
        <ul className="m-equipements">
          {eqTries.map((e) => {
            const pts = parEq[e.id] || [];
            const s = statsTests(pts);
            const visibles = pts.filter(passe);
            const estOuvert = ouvertEffectif === e.id;
            return (
              <li key={e.id} className="m-equipement">
                <button type="button" className="m-equipement-tete" onClick={() => setOuvert(estOuvert ? "-" : e.id)} aria-expanded={estOuvert}>
                  <div className="m-equipement-titres">
                    <strong>{e.nom}</strong>
                    <span>
                      {s.faits} / {s.total}
                      {s.ko > 0 && <b className="m-txt-alerte"> · {s.ko} KO</b>}
                    </span>
                    <Barre valeur={s.pct ?? 0} fin couleur={s.ko > 0 ? "var(--m-rouge)" : "var(--m-vert)"} />
                  </div>
                  <span className={"m-chevron" + (estOuvert ? " ouvert" : "")}>
                    <IcChevron taille={20} />
                  </span>
                </button>
                {estOuvert && (visibles.length === 0 ? <p className="m-note-source">{pts.length === 0 ? "Aucun point." : "Rien à afficher avec ce filtre 🎉"}</p> : <ul className="m-points">{visibles.map((p) => carte(p, false))}</ul>)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
