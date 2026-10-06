// Lit un fichier texte exporté de SAP. SAP écrit souvent en ANSI
// (Windows-1252) : lu en UTF-8, « ADHÉSIF BÂTIMENT » devient « ADH�SIF B�TIMENT ».
// On essaie donc UTF-8 strict, puis on retombe sur Windows-1252.
export function decoderTexteSap(octets) {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(vue);
  } catch {
    return new TextDecoder("windows-1252").decode(vue);
  }
}

export async function lireTexteSap(fichier) {
  return decoderTexteSap(await fichier.arrayBuffer());
}
