// Estimation de la largeur (en px) d'un texte, pour décider si l'étiquette
// d'une barre du Gantt (heures, %, responsable...) rentre DEDANS la barre
// ou doit sortir à côté quand la barre est trop courte. On mesure via un
// <canvas> hors-écran, avec la même police que l'étiquette interne
// (.gantt-barre-label-interne) ; repli approximatif si canvas est
// indisponible (SSR, tests).
let ctx = null;
function getCtx(taillePolice) {
  if (typeof document === "undefined") return null;
  if (!ctx) {
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
  }
  if (ctx) ctx.font = `600 ${taillePolice}px "Inter", system-ui, sans-serif`;
  return ctx;
}

export function estimerLargeurTexte(texte, taillePolice = 11) {
  if (!texte) return 0;
  const c = getCtx(taillePolice);
  if (c) return c.measureText(texte).width;
  // Repli grossier si canvas indisponible : ~0.58 * taille par caractère.
  return texte.length * taillePolice * 0.58;
}
