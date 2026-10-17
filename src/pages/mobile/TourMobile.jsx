import { useEffect, useMemo, useRef, useState } from "react";
import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { avancementItems, construireTour, estFait, majAvancement, pctItem, resumesPostes } from "../../lib/tourChantier";
import { suivreEcriture } from "../../lib/offline";
import { Barre, Feuille, afficherToast, eur, nf1, pct0 } from "../../components/mobile/Ui";
import { IcCheck, IcChevron, IcMoins, IcNote, IcPlus, IcRecherche } from "../../components/mobile/Icones";

const norm = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Écrit sur Firestore sans attendre le serveur : hors ligne, l'écran est déjà à
// jour (cache local) et l'envoi part tout seul au retour du réseau.
function ecrire(promesse) {
  suivreEcriture(promesse).catch(() => afficherToast("Modification refusée (droits insuffisants)"));
}
function majLignes(ids, maj) {
  if (ids.length === 1) {
    ecrire(updateDoc(doc(db, "elecLignes", ids[0]), maj));
    return;
  }
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, "elecLignes", id), maj));
  ecrire(batch.commit());
}

// Tour de chantier : on parcourt le devis, on touche une ligne, on règle son
// avancement. Tout est enregistré immédiatement (même sans réseau).
export default function TourMobile({ devis, toutesLignes, tousGroupes, tauxMo, peutGerer }) {
  const [devisId, setDevisId] = useState(devis[0]?.id || "");
  const [filtre, setFiltre] = useState("tout");
  const [recherche, setRecherche] = useState("");
  const [replies, setReplies] = useState(() => new Set());
  const [ouvertId, setOuvertId] = useState(null);

  useEffect(() => {
    if (!devis.some((d) => d.id === devisId)) setDevisId(devis[0]?.id || "");
  }, [devis, devisId]);

  const lignesDevis = useMemo(
    () => toutesLignes.filter((l) => l.devisId === devisId).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [toutesLignes, devisId]
  );
  const lignesParId = useMemo(() => new Map(lignesDevis.map((l) => [l.id, l])), [lignesDevis]);
  const items = useMemo(() => construireTour(lignesDevis, tousGroupes.filter((g) => g.devisId === devisId)), [lignesDevis, tousGroupes, devisId]);
  const resumes = useMemo(() => resumesPostes(items, tauxMo), [items, tauxMo]);
  const global = useMemo(() => avancementItems(items, tauxMo), [items, tauxMo]);

  const q = norm(recherche).trim();
  const filtreActif = filtre === "afaire" || q !== "";

  // Éléments à afficher : filtres, recherche et postes repliés.
  const visibles = useMemo(() => {
    const ok = items.map((it) =>
      it.type === "ligne"
        ? (filtre !== "afaire" || !estFait(it)) && (!q || norm(it.designation + " " + it.detail + " " + it.reference).includes(q))
        : null
    );
    const sortie = [];
    let finRepli = -1;
    let niveauRepli = 0;
    items.forEach((it, i) => {
      if (i < finRepli) return;
      if (it.type === "poste") {
        let j = i + 1;
        while (j < items.length && !(items[j].type === "poste" && items[j].niveau <= it.niveau)) j++;
        if (filtreActif && !ok.slice(i + 1, j).some(Boolean)) return;
        sortie.push(it);
        if (replies.has(it.id) && !q) {
          finRepli = j;
          niveauRepli = it.niveau;
        }
        return;
      }
      void niveauRepli;
      if (it.type === "commentaire") {
        if (!filtreActif) sortie.push(it);
        return;
      }
      if (ok[i]) sortie.push(it);
    });
    return sortie;
  }, [items, filtre, q, filtreActif, replies]);

  const basculer = (id) =>
    setReplies((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const toutReplier = () => {
    const postes = items.filter((i) => i.type === "poste").map((i) => i.id);
    setReplies((prev) => (prev.size >= postes.length ? new Set() : new Set(postes)));
  };

  const terminer = (it) => {
    const avant = it.ids.map((id) => ({ id, fo: lignesParId.get(id)?.avancementFo, mo: lignesParId.get(id)?.avancementMo, av: lignesParId.get(id)?.avancement }));
    majLignes(it.ids, majAvancement(it, { fo: 100, mo: 100 }));
    afficherToast("« " + abreger(it.designation) + " » terminée", {
      label: "Annuler",
      onClick: () => {
        const batch = writeBatch(db);
        avant.forEach((a) =>
          batch.update(doc(db, "elecLignes", a.id), {
            avancementFo: a.fo ?? a.av ?? 0,
            avancementMo: a.mo ?? a.av ?? 0,
          })
        );
        ecrire(batch.commit());
      },
    });
  };

  const ouvert = ouvertId ? items.find((i) => i.type === "ligne" && i.id === ouvertId) : null;
  const devisCourant = devis.find((d) => d.id === devisId);

  if (devis.length === 0) {
    return (
      <div className="m-vide">
        <strong>Aucun devis</strong>
        <span>Importez une minute depuis la version complète pour suivre l'avancement.</span>
      </div>
    );
  }

  return (
    <div className="m-tour">
      {devis.length > 1 && (
        <div className="m-devis-puces" role="tablist">
          {devis.map((d) => (
            <button key={d.id} type="button" className={d.id === devisId ? "actif" : ""} onClick={() => setDevisId(d.id)}>
              {d.nom || "Devis"}
            </button>
          ))}
        </div>
      )}

      <section className="m-carte-blanche m-tour-resume">
        <div className="m-tour-resume-tete">
          <div>
            <strong>{devisCourant?.nom || "Devis"}</strong>
            <span>
              {global.nFaites} / {global.n} lignes terminées
            </span>
          </div>
          <b>{pct0(global.pct)}</b>
        </div>
        <Barre valeur={global.pct} />
      </section>

      <div className="m-tour-outils">
        <label className="m-recherche">
          <IcRecherche taille={18} />
          <input type="search" placeholder="Rechercher une ligne…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <div className="m-tour-boutons">
          <div className="m-segments petit">
            <button type="button" className={filtre === "tout" ? "actif" : ""} onClick={() => setFiltre("tout")}>
              Tout
            </button>
            <button type="button" className={filtre === "afaire" ? "actif" : ""} onClick={() => setFiltre("afaire")}>
              À faire
            </button>
          </div>
          <button type="button" className="m-lien" onClick={toutReplier}>
            {replies.size > 0 ? "Tout déplier" : "Tout replier"}
          </button>
        </div>
      </div>

      {!peutGerer && <p className="m-lecture-seule">Lecture seule : seul le RA Électricité peut saisir l'avancement.</p>}

      {visibles.length === 0 ? (
        <div className="m-vide petit">
          <strong>{filtre === "afaire" && !q ? "Tout est terminé 🎉" : "Aucune ligne"}</strong>
          <span>{filtre === "afaire" && !q ? "Toutes les lignes de ce devis sont à 100 %." : "Modifiez la recherche ou le filtre."}</span>
        </div>
      ) : (
        <ul className="m-liste-tour">
          {visibles.map((it) => {
            if (it.type === "poste") {
              const r = resumes.get(it.id);
              const ferme = replies.has(it.id) && !q;
              return (
                <li key={it.id}>
                  <button type="button" className={"m-poste niv" + Math.min(it.niveau, 2) + (it.sousTitre ? " sous" : "")} onClick={() => basculer(it.id)} aria-expanded={!ferme}>
                    <span className={"m-poste-chevron" + (ferme ? " ferme" : "")}>
                      <IcChevron taille={18} />
                    </span>
                    <span className="m-poste-texte">
                      {it.code && <small>{it.code}</small>}
                      {it.texte}
                    </span>
                    {r && r.n > 0 && (
                      <span className="m-poste-av">
                        <b>{pct0(r.pct)}</b>
                        <small>
                          {r.nFaites}/{r.n}
                        </small>
                      </span>
                    )}
                  </button>
                </li>
              );
            }
            if (it.type === "commentaire") {
              return (
                <li key={it.id} className="m-commentaire">
                  {it.texte}
                </li>
              );
            }
            return (
              <li key={it.id}>
                <LigneTour it={it} tauxMo={tauxMo} onOuvrir={() => setOuvertId(it.id)} onTerminer={() => terminer(it)} peutGerer={peutGerer} />
              </li>
            );
          })}
        </ul>
      )}

      {ouvert && <SaisieLigne it={ouvert} tauxMo={tauxMo} peutGerer={peutGerer} onFermer={() => setOuvertId(null)} lignesParId={lignesParId} />}
    </div>
  );
}

const abreger = (t) => (t.length > 38 ? t.slice(0, 36) + "…" : t);

function LigneTour({ it, tauxMo, onOuvrir, onTerminer, peutGerer }) {
  const fait = estFait(it);
  const global = pctItem(it, tauxMo);
  return (
    <div className={"m-ligne" + (fait ? " fait" : global > 0 ? " en-cours" : "")}>
      <button type="button" className="m-ligne-corps" onClick={onOuvrir}>
        <span className="m-ligne-titre">{it.designation || "(sans désignation)"}</span>
        <span className="m-ligne-meta">
          {it.quantite > 0 && (
            <>
              {nf1.format(it.quantite)} {it.unite}
            </>
          )}
          {it.cout > 0 && <> · {eur(it.cout)}</>}
          {it.heures > 0 && <> · {nf1.format(it.heures)} h</>}
          {it.groupe && <> · groupe ×{it.groupe.nb}</>}
          {it.note && (
            <span className="m-ligne-note" title="Note de visite">
              <IcNote taille={13} />
            </span>
          )}
        </span>
        <span className="m-ligne-barres">
          {(it.mode === "fo" || it.mode === "fo+mo") && <MiniAv label="FO" valeur={it.pctFo} couleur="var(--m-vert)" />}
          {(it.mode === "mo" || it.mode === "fo+mo") && <MiniAv label="MO" valeur={it.pctMo} couleur="var(--m-bleu)" />}
          {it.mode === "simple" && <MiniAv label="Av." valeur={Math.max(it.pctFo, it.pctMo)} couleur="var(--m-vert)" />}
        </span>
      </button>
      <button
        type="button"
        className={"m-fait" + (fait ? " ok" : "")}
        disabled={!peutGerer}
        onClick={fait ? onOuvrir : onTerminer}
        aria-label={fait ? "Ligne terminée, modifier" : "Marquer la ligne comme terminée"}
      >
        <IcCheck taille={22} />
      </button>
    </div>
  );
}

function MiniAv({ label, valeur, couleur }) {
  return (
    <span className="m-miniav">
      <em>{label}</em>
      <Barre valeur={valeur} couleur={couleur} fin />
      <b>{Math.round(valeur)}%</b>
    </span>
  );
}

// Feuille de saisie : gros boutons, curseur, note de visite.
function SaisieLigne({ it, tauxMo, peutGerer, onFermer, lignesParId }) {
  const [fo, setFo] = useState(Math.round(it.mode === "simple" ? Math.max(it.pctFo, it.pctMo) : it.pctFo));
  const [mo, setMo] = useState(Math.round(it.pctMo));
  const [note, setNote] = useState(it.note);
  const minuteurs = useRef({ fo: null, mo: null });
  const aFo = it.mode === "fo" || it.mode === "fo+mo";
  const aMo = it.mode === "mo" || it.mode === "fo+mo";
  const simple = it.mode === "simple";

  // Valeurs de curseur pas encore envoyées : envoyées à la fermeture de la feuille.
  const enAttente = useRef({});
  const itRef = useRef(it);
  itRef.current = it;
  const peutRef = useRef(peutGerer);
  peutRef.current = peutGerer;
  useEffect(() => {
    const m = minuteurs.current;
    const att = enAttente.current;
    return () => {
      clearTimeout(m.fo);
      clearTimeout(m.mo);
      Object.entries(att).forEach(([axe, v]) => {
        if (peutRef.current) majLignes(itRef.current.ids, majAvancement(itRef.current, axe === "fo" ? { fo: v } : { mo: v }));
      });
    };
  }, []);

  // Curseur : on attend 350 ms sans mouvement avant d'enregistrer ; boutons : tout de suite.
  const regler = (axe, valeur, immediat = true) => {
    const v = Math.max(0, Math.min(100, Math.round(valeur)));
    if (axe === "fo") setFo(v);
    else setMo(v);
    if (!peutGerer) return;
    clearTimeout(minuteurs.current[axe]);
    const go = () => {
      delete enAttente.current[axe];
      majLignes(it.ids, majAvancement(it, axe === "fo" ? { fo: v } : { mo: v }));
    };
    if (immediat) go();
    else {
      enAttente.current[axe] = v;
      minuteurs.current[axe] = setTimeout(go, 350);
    }
  };
  const toutA100 = () => {
    setFo(100);
    setMo(100);
    clearTimeout(minuteurs.current.fo);
    clearTimeout(minuteurs.current.mo);
    Object.keys(enAttente.current).forEach((k) => delete enAttente.current[k]);
    if (peutGerer) majLignes(it.ids, majAvancement(it, { fo: 100, mo: 100 }));
  };
  const sauverNote = () => {
    if (!peutGerer || note.trim() === (it.note || "").trim()) return;
    ecrire(updateDoc(doc(db, "elecLignes", it.noteId), { noteTerrain: note.trim() }));
  };
  const fermer = () => {
    sauverNote();
    onFermer();
  };

  const global = simple ? fo : aFo && aMo ? pctItem({ ...it, pctFo: fo, pctMo: mo }, tauxMo) : aFo ? fo : mo;
  void lignesParId;

  return (
    <Feuille
      titre={it.designation || "Ligne"}
      sousTitre={[it.quantite > 0 && nf1.format(it.quantite) + " " + it.unite, it.cout > 0 && eur(it.cout), it.heures > 0 && nf1.format(it.heures) + " h"].filter(Boolean).join(" · ")}
      onFermer={fermer}
      pied={
        <div className="m-saisie-pied">
          <button type="button" className="m-bouton-plein" disabled={!peutGerer} onClick={toutA100}>
            <IcCheck taille={18} /> Tout à 100 %
          </button>
          <button type="button" className="m-bouton-sec" onClick={fermer}>
            OK
          </button>
        </div>
      }
    >
      {it.detail && <p className="m-saisie-detail">{it.detail}</p>}
      {it.groupe && <p className="m-saisie-groupe">Groupe de {it.groupe.nb} lignes : la valeur est appliquée à toutes.</p>}
      {!peutGerer && <p className="m-lecture-seule">Lecture seule.</p>}

      <p className="m-saisie-global">
        Avancement de la ligne <b>{pct0(global)}</b>
      </p>

      {(aFo || simple) && <Reglage label={simple ? "Avancement" : "Fourniture"} couleur="var(--m-vert)" valeur={fo} disabled={!peutGerer} onChange={(v, im) => regler("fo", v, im)} />}
      {aMo && <Reglage label="Main d'œuvre" couleur="var(--m-bleu)" valeur={mo} disabled={!peutGerer} onChange={(v, im) => regler("mo", v, im)} />}

      <label className="m-note">
        <span>
          <IcNote taille={16} /> Note de visite
        </span>
        <textarea value={note} rows={3} disabled={!peutGerer} placeholder="Ex. câblage fait, reste le repérage…" onChange={(e) => setNote(e.target.value)} onBlur={sauverNote} />
      </label>
    </Feuille>
  );
}

function Reglage({ label, couleur, valeur, onChange, disabled }) {
  return (
    <div className="m-reglage" style={{ "--m-c": couleur }}>
      <div className="m-reglage-tete">
        <span>{label}</span>
        <b>{valeur} %</b>
      </div>
      <div className="m-reglage-curseur">
        <button type="button" className="m-pas" disabled={disabled} onClick={() => onChange(valeur - 5, true)} aria-label="Moins 5 points">
          <IcMoins taille={20} />
        </button>
        <input type="range" min="0" max="100" step="1" value={valeur} style={{ "--m-pos": valeur + "%" }} disabled={disabled} onChange={(e) => onChange(Number(e.target.value), false)} aria-label={label} />
        <button type="button" className="m-pas" disabled={disabled} onClick={() => onChange(valeur + 5, true)} aria-label="Plus 5 points">
          <IcPlus taille={20} />
        </button>
      </div>
      <div className="m-rapides">
        {[0, 25, 50, 75, 100].map((v) => (
          <button key={v} type="button" disabled={disabled} className={valeur === v ? "actif" : ""} onClick={() => onChange(v, true)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
