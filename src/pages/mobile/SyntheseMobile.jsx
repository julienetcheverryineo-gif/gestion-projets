import { useMemo } from "react";
import { construireTour } from "../../lib/tourChantier";
import { alertesChantier } from "../../lib/alertesChantier";
import { statutFactureSap } from "../../lib/indicateursChantier";
import { Anneau, Barre, eur, eurCourt, nf1, pct0, pct1 } from "../../components/mobile/Ui";
import { IcAlerte, IcBasDroite, IcCheck, IcHautDroite } from "../../components/mobile/Icones";

const STATUT_FACTURE = { payee: "Payée", attente: "À régler", retard: "En retard", annulee: "Avoir" };

function avancementsDevis(lignesDevis, groupes) {
  const items = construireTour(lignesDevis, groupes).filter((i) => i.type === "ligne");
  const ponderer = (champ, pctChamp, applicable) => {
    let total = 0;
    let fait = 0;
    items.filter(applicable).forEach((i) => {
      total += i[champ];
      fait += (i[champ] * i[pctChamp]) / 100;
    });
    return total > 0 ? (fait / total) * 100 : null;
  };
  return {
    fo: ponderer("cout", "pctFo", (i) => i.mode === "fo" || i.mode === "fo+mo"),
    mo: ponderer("heures", "pctMo", (i) => i.mode === "mo" || i.mode === "fo+mo"),
    n: items.length,
  };
}

// Synthèse d'un chantier : on doit comprendre l'état en quelques secondes.
export default function SyntheseMobile({ chantier, ind, devis, toutesLignes, tousGroupes, onTour }) {
  const alertes = useMemo(() => alertesChantier(ind), [ind]);
  const parDevis = useMemo(
    () =>
      devis.map((d) => ({
        devis: d,
        ...avancementsDevis(
          toutesLignes.filter((l) => l.devisId === d.id).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
          tousGroupes.filter((g) => g.devisId === d.id)
        ),
      })),
    [devis, toutesLignes, tousGroupes]
  );
  const factures = useMemo(() => {
    const f = chantier?.sapFacturation?.factures || [];
    const tri = (d) => String(d || "").split(".").reverse().join("");
    return f
      .slice()
      .sort((a, b) => tri(b.date).localeCompare(tri(a.date)))
      .slice(0, 6);
  }, [chantier]);

  if (!ind) {
    return (
      <div className="m-vide">
        <strong>Pas encore de devis</strong>
        <span>Importez une minute depuis la version complète pour voir la synthèse.</span>
      </div>
    );
  }

  const pctAv = ind.avancementPct;
  const pctFact = ind.marche > 0 ? (ind.facture / ind.marche) * 100 : null;
  const pctDep = ind.budget > 0 && ind.sapDisponible ? (ind.reelSap / ind.budget) * 100 : null;
  const reste = Math.max(0, ind.marche - ind.facture);
  const attention = alertes.filter((a) => a.niveau !== "info");
  const infos = alertes.filter((a) => a.niveau === "info");
  const ecartFactAv = pctAv != null && pctFact != null ? pctFact - pctAv : null;

  return (
    <div className="m-synthese">
      <section className="m-carte-blanche m-hero">
        <Anneau valeur={pctAv ?? 0}>
          <b>{pctAv == null ? "—" : pct0(pctAv)}</b>
          <span>avancement</span>
        </Anneau>
        <dl className="m-hero-chiffres">
          <div>
            <dt>Marché HT</dt>
            <dd>{eurCourt(ind.marche)}</dd>
          </div>
          <div>
            <dt>Facturé</dt>
            <dd>
              {eurCourt(ind.facture)}
              {pctFact != null && <small> · {pct0(pctFact)}</small>}
            </dd>
          </div>
          <div>
            <dt>Reste à facturer</dt>
            <dd>{eurCourt(reste)}</dd>
          </div>
        </dl>
      </section>

      <section className="m-carte-blanche">
        <h2 className="m-titre-section">Facturation face au terrain</h2>
        <div className="m-comparatif">
          <LigneComparatif label="Avancement suivi" valeur={pctAv} couleur="var(--m-vert)" />
          <LigneComparatif label="Facturé" valeur={pctFact} couleur="var(--m-bleu)" />
          <LigneComparatif label="Dépensé (SAP)" valeur={pctDep} couleur="var(--m-ambre)" sous={ind.sapDisponible ? eurCourt(ind.reelSap) + " sur " + eurCourt(ind.budget) + " de budget" : "Pas de données SAP"} />
        </div>
        {ecartFactAv != null && (
          <p className={"m-verdict " + (Math.abs(ecartFactAv) <= 2 ? "ok" : ecartFactAv < 0 ? "warn" : "info")}>
            {Math.abs(ecartFactAv) <= 2 ? <IcCheck taille={16} /> : ecartFactAv < 0 ? <IcBasDroite taille={16} /> : <IcHautDroite taille={16} />}
            {Math.abs(ecartFactAv) <= 2
              ? "Facturation alignée sur l'avancement"
              : ecartFactAv < 0
                ? "Facturé " + nf1.format(-ecartFactAv) + " pts sous l'avancement"
                : "Facturé " + nf1.format(ecartFactAv) + " pts au-dessus de l'avancement"}
          </p>
        )}
      </section>

      <section className="m-carte-blanche">
        <h2 className="m-titre-section">
          À surveiller
          {attention.length > 0 && <span className="m-compteur">{attention.length}</span>}
        </h2>
        {attention.length === 0 && infos.length === 0 ? (
          <p className="m-tout-vert">
            <IcCheck taille={18} /> Rien à signaler sur ce chantier
          </p>
        ) : (
          <ul className="m-alertes">
            {[...attention, ...infos].map((a) => (
              <li key={a.id} className={"m-alerte " + a.niveau}>
                <span className="m-alerte-ic">{a.niveau === "info" ? <IcHautDroite taille={16} /> : <IcAlerte taille={16} />}</span>
                <div>
                  <strong>{a.titre}</strong>
                  <span>{a.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="m-carte-blanche">
        <h2 className="m-titre-section">Avancement par devis</h2>
        <ul className="m-devis-liste">
          {parDevis.map(({ devis: d, fo, mo, n }) => (
            <li key={d.id}>
              <div className="m-devis-nom">
                <strong>{d.nom || "Devis"}</strong>
                <small>{n} lignes</small>
              </div>
              <div className="m-devis-barres">
                <div>
                  <span>Fourniture</span>
                  <Barre valeur={fo ?? 0} couleur="var(--m-vert)" fin />
                  <b>{fo == null ? "—" : pct0(fo)}</b>
                </div>
                <div>
                  <span>Main d'œuvre</span>
                  <Barre valeur={mo ?? 0} couleur="var(--m-bleu)" fin />
                  <b>{mo == null ? "—" : pct0(mo)}</b>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="m-bouton-plein" onClick={onTour}>
          Faire le tour de chantier
        </button>
      </section>

      {factures.length > 0 && (
        <section className="m-carte-blanche">
          <h2 className="m-titre-section">Dernières factures SAP</h2>
          <ul className="m-factures">
            {factures.map((f, i) => {
              const st = statutFactureSap(f);
              return (
                <li key={f.numero || i}>
                  <div>
                    <strong>{f.numero || "—"}</strong>
                    <small>{String(f.date || "").replace(/\./g, "/")}</small>
                  </div>
                  <b>{eur(f.montantHt)}</b>
                  <span className={"m-statut-facture " + st}>{STATUT_FACTURE[st]}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="m-carte-blanche m-chiffres-sap">
        <h2 className="m-titre-section">Budget et dépenses</h2>
        <dl>
          <div>
            <dt>Budget chiffré</dt>
            <dd>{eur(ind.budget)}</dd>
          </div>
          <div>
            <dt>Dépense réelle SAP</dt>
            <dd>{ind.sapDisponible ? eur(ind.reelSap) : "—"}</dd>
          </div>
          <div>
            <dt>Reste à dépenser</dt>
            <dd className={ind.sapDisponible && ind.budget - ind.reelSap < 0 ? "neg" : ""}>{ind.sapDisponible ? eur(ind.budget - ind.reelSap) : "—"}</dd>
          </div>
        </dl>
        <p className="m-note-source">
          {ind.sapImporteLe ? "Facturation SAP au " + new Date(ind.sapImporteLe).toLocaleDateString("fr-FR") + ". " : ""}
          Données consultables sans réseau.
        </p>
      </section>
    </div>
  );
}

function LigneComparatif({ label, valeur, couleur, sous }) {
  return (
    <div className="m-comp">
      <div className="m-comp-tete">
        <span>{label}</span>
        <b>{valeur == null ? "—" : pct1(valeur)}</b>
      </div>
      <Barre valeur={valeur ?? 0} couleur={couleur} />
      {sous && <small>{sous}</small>}
    </div>
  );
}
