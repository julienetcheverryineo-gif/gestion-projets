// Nettoie le HTML produit par l'éditeur de notes (RichTextEditor) avant
// stockage et avant affichage : on ne garde qu'une liste blanche de
// balises de mise en forme simple (gras, italique, souligné, listes,
// paragraphes, alignement), tout le reste est jeté (mais le TEXTE des
// balises rejetées est conservé, pour ne rien perdre de ce que la
// personne a tapé/collé — un lien collé devient juste du texte, par
// exemple). Sert aussi de filet de sécurité pour les anciennes notes en
// texte brut (elles ne contiennent pas de balises, donc ressortent
// telles quelles).

const BALISES_AUTORISEES = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE",
  "UL", "OL", "LI", "P", "BR", "DIV", "SPAN",
]);

function nettoyerNoeud(noeud) {
  if (noeud.nodeType === Node.TEXT_NODE) {
    return noeud.cloneNode();
  }
  if (noeud.nodeType !== Node.ELEMENT_NODE) return null;

  if (!BALISES_AUTORISEES.has(noeud.tagName)) {
    // Balise non autorisée (lien, image, script, table collée...) : on
    // jette la balise mais on garde son contenu nettoyé.
    const fragment = document.createDocumentFragment();
    for (const enfant of noeud.childNodes) {
      const n = nettoyerNoeud(enfant);
      if (n) fragment.appendChild(n);
    }
    return fragment;
  }

  const propre = document.createElement(noeud.tagName);
  // Seul style conservé : l'alignement de texte (posé par les boutons
  // Aligner à gauche/centre/droite de l'éditeur).
  const align = noeud.style && noeud.style.textAlign;
  if (align === "center" || align === "right" || align === "left") {
    propre.style.textAlign = align;
  }
  for (const enfant of noeud.childNodes) {
    const n = nettoyerNoeud(enfant);
    if (n) propre.appendChild(n);
  }
  return propre;
}

export function nettoyerHtmlNote(html) {
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const conteneur = document.createElement("div");
  for (const enfant of doc.body.childNodes) {
    const n = nettoyerNoeud(enfant);
    if (n) conteneur.appendChild(n);
  }
  return conteneur.innerHTML;
}

// true si le contenu HTML n'a aucun texte visible (éditeur vide, ou juste
// des balises/espaces) — pour désactiver le bouton "Ajouter"/"Enregistrer".
export function htmlEstVide(html) {
  if (!html) return true;
  const conteneur = document.createElement("div");
  conteneur.innerHTML = html;
  return conteneur.textContent.trim().length === 0;
}

// Texte brut (sans balises), pour les aperçus courts (ex : synthèse des
// notes par affaire).
export function texteBrut(html) {
  if (!html) return "";
  const conteneur = document.createElement("div");
  conteneur.innerHTML = html;
  return conteneur.textContent.trim();
}
