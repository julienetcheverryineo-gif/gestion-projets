import { useEffect, useRef } from "react";

// Petit éditeur de texte enrichi (gras, italique, souligné, alignement,
// listes à puces/numérotées) basé sur contentEditable + document.execCommand.
// Volontairement pas de librairie externe (Tiptap/Quill...) pour un besoin
// aussi simple — moins de poids, moins de dépendances à maintenir.
const BOUTONS = [
  { cmd: "bold", label: "G", titre: "Gras", style: { fontWeight: 700 } },
  { cmd: "italic", label: "I", titre: "Italique", style: { fontStyle: "italic" } },
  { cmd: "underline", label: "S", titre: "Souligné", style: { textDecoration: "underline" } },
  { separateur: true },
  { cmd: "justifyLeft", label: "⯇", titre: "Aligner à gauche" },
  { cmd: "justifyCenter", label: "≡", titre: "Centrer" },
  { cmd: "justifyRight", label: "⯈", titre: "Aligner à droite" },
  { separateur: true },
  { cmd: "insertUnorderedList", label: "•", titre: "Liste à puces" },
  { cmd: "insertOrderedList", label: "1.", titre: "Liste numérotée" },
  { separateur: true },
  { cmd: "removeFormat", label: "✕", titre: "Effacer la mise en forme" },
];

export default function RichTextEditor({ value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null);
  const derniereValeurEmise = useRef(value || "");

  // On ne réécrit le contenu du contentEditable que quand la valeur
  // change de l'EXTÉRIEUR (ex : on annule une édition, ou on ouvre une
  // autre note) — jamais à chaque frappe, sinon le curseur saute au
  // début à chaque caractère tapé.
  useEffect(() => {
    if (ref.current && (value || "") !== derniereValeurEmise.current) {
      ref.current.innerHTML = value || "";
      derniereValeurEmise.current = value || "";
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emettre = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    derniereValeurEmise.current = html;
    onChange(html);
  };

  const appliquer = (cmd) => {
    ref.current?.focus();
    document.execCommand(cmd, false, null);
    emettre();
  };

  return (
    <div className="rte">
      <div className="rte-barre">
        {BOUTONS.map((b, i) =>
          b.separateur ? (
            <span key={"sep" + i} className="rte-separateur" aria-hidden="true" />
          ) : (
            <button
              key={b.cmd}
              type="button"
              className="rte-btn"
              title={b.titre}
              aria-label={b.titre}
              style={b.style}
              // preventDefault sur mousedown : sinon le clic sur le bouton
              // fait d'abord perdre le focus/la sélection dans la zone de
              // texte, et la commande s'applique au mauvais endroit (ou à
              // rien du tout).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => appliquer(b.cmd)}
            >
              {b.label}
            </button>
          )
        )}
      </div>
      <div
        ref={ref}
        className="rte-zone"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emettre}
        onBlur={emettre}
      />
    </div>
  );
}
