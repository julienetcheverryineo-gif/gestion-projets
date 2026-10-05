// Génération des scripts VBScript de pilotage de SAP GUI (extraction des
// achats ME2J et des pointages CATS ZCAT3).
//
// Les séquences reprennent à l'identique celles de l'application Access
// GOAT (modules modSapMe2jExtractionFournitures et
// modSapZcat3ExtractionMainOeuvre) : mêmes transactions, mêmes identifiants
// d'écran SAP, même ordre d'actions. Une page web ne pouvant pas piloter SAP
// GUI (objet COM Windows), l'appli produit un fichier .vbs à lancer en local
// (double-clic) sur le poste où SAP est ouvert ; le fichier .txt exporté est
// ensuite importé via la page « Import SAP ».
//
// Tout le texte généré est volontairement en ASCII (pas d'accents) pour que
// le .vbs s'exécute correctement quel que soit l'encodage du fichier.

export const PARAMS_SAP_DEFAUT = {
  societeSap: "2726", // Agence.SapSocieteCode (IAQ1..IAQX)
  organisationAchats: "I001", // Societe.SapOrganisationAchatsCode (INEO)
  varianteListeFo: "ZINEO", // variante de sélection ME2J
  miseEnFormeFo: "/GOAT_FO", // mise en forme ALV ME2J
  varianteAlvMo: "ZCAT3_EXPORT_TXT", // mise en forme ALV ZCAT3 (ou la vôtre, ex. IAQ2_GUEST)
  ligneVarianteMo: "50", // ligne de la liste des mises en forme où GOAT lit la variante personnelle ("" = ignorer)
  popupProjet: false, // utilisateurs "fenêtre projet" ME2J
  profilProjet: "aaa",
  dossierFo: "C:\\temp-goat\\sap-fo\\",
  fichierFo: "export-fo-sap.txt",
  dossierMo: "C:\\temp-goat\\sap-mo\\",
  fichierMo: "export-mo-sap.txt",
};

// Retire les accents et caractères non ASCII, double les guillemets : valeur
// sûre à insérer dans une chaîne VBScript.
function chaineVbs(valeur) {
  const ascii = String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
  return '"' + ascii.replace(/"/g, '""') + '"';
}

function avecAntiSlash(dossier) {
  const d = String(dossier || "").trim();
  return d && !d.endsWith("\\") ? d + "\\" : d;
}

function nettoyerNomFichier(nom, extension = ".txt") {
  const n = String(nom || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
  if (!n) return "";
  const pos = n.lastIndexOf(".");
  return (pos > 0 ? n.slice(0, pos) : n) + extension;
}

// "2025-03-01" ou "01/03/2025" -> "01.03.2025" (format attendu par SAP).
export function dateSap(valeur) {
  const v = String(valeur || "").trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
  return "";
}

export function listerOtp(brut) {
  const vus = new Set();
  const liste = [];
  String(brut || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .forEach((o) => {
      if (!vus.has(o)) {
        vus.add(o);
        liste.push(o);
      }
    });
  return liste;
}

// Validation commune ; renvoie la liste des problèmes (vide = OK).
export function validerParametres(params, otp, { dates = false, debut, fin, fo = false, mo = false }) {
  const erreurs = [];
  if (otp.length === 0) erreurs.push("Aucun code affaire (OTP) renseigné.");
  if (fo && !String(params.organisationAchats || "").trim())
    erreurs.push("L'organisation d'achats SAP est obligatoire (ME2J).");
  if (mo && !String(params.societeSap || "").trim())
    erreurs.push("Le code société SAP est obligatoire (ZCAT3).");
  if (dates) {
    const d = dateSap(debut);
    const f = dateSap(fin);
    if (!d) erreurs.push("Date de début invalide.");
    if (!f) erreurs.push("Date de fin invalide.");
    if (d && f) {
      const [jd, md, ad] = d.split(".").map(Number);
      const [jf, mf, af] = f.split(".").map(Number);
      if (new Date(ad, md - 1, jd) > new Date(af, mf - 1, jf))
        erreurs.push("La date de début est postérieure à la date de fin.");
    }
  }
  if (fo && (!avecAntiSlash(params.dossierFo) || !nettoyerNomFichier(params.fichierFo)))
    erreurs.push("Dossier ou nom de fichier d'export FO manquant.");
  if (mo && (!avecAntiSlash(params.dossierMo) || !nettoyerNomFichier(params.fichierMo)))
    erreurs.push("Dossier ou nom de fichier d'export MO manquant.");
  return erreurs;
}

// Fonctions VBScript communes (connexion, existence d'un élément, saisie
// multiple, attente du fichier). Reprises de modSapExtractionCommun.
const SOCLE_VBS = [
  "Option Explicit",
  "",
  "Dim SapGuiAuto, SapApp, SapCon, session, fso",
  "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
  "",
  "Sub Fin(message, code)",
  "  MsgBox message, code, TITRE",
  "  WScript.Quit",
  "End Sub",
  "",
  "Function Existe(id)",
  "  Dim o",
  "  On Error Resume Next",
  "  Set o = session.findById(id)",
  "  Existe = (Err.Number = 0) And (Not o Is Nothing)",
  "  Err.Clear",
  "  On Error GoTo 0",
  "End Function",
  "",
  "Sub ConnecterSap()",
  "  On Error Resume Next",
  "  Set SapGuiAuto = GetObject(\"SAPGUI\")",
  "  If Err.Number <> 0 Or SapGuiAuto Is Nothing Then Fin \"SAP GUI n'est pas accessible. Ouvrez SAP et connectez-vous, puis relancez le script.\", 48",
  "  Set SapApp = SapGuiAuto.GetScriptingEngine",
  "  If Err.Number <> 0 Or SapApp Is Nothing Then Fin \"Le scripting SAP n'est pas actif (voir options SAP GUI > Accessibilite et scripting).\", 48",
  "  If SapApp.Children.Count = 0 Then Fin \"Aucune connexion SAP n'est ouverte.\", 48",
  "  Set SapCon = SapApp.Children(0)",
  "  If SapCon.Children.Count = 0 Then Fin \"Aucune session SAP active.\", 48",
  "  Set session = SapCon.Children(0)",
  "  On Error GoTo 0",
  "End Sub",
  "",
  "' Saisie des affaires dans la fenetre de selection multiple (5 lignes visibles,",
  "' defilement par blocs de 5).",
  "Function SaisirSelectionMultiple(champSimple, boutonMultiple, tableId, valeurs)",
  "  Dim tbl, i, ligne, scroll, nb",
  "  session.findById(champSimple).SetFocus",
  "  session.findById(champSimple).caretPosition = 0",
  "  session.findById(boutonMultiple).press",
  "  Set tbl = session.findById(tableId)",
  "  ligne = 0 : scroll = 0 : nb = 0",
  "  For i = 0 To UBound(valeurs)",
  "    If Trim(valeurs(i)) <> \"\" Then",
  "      If ligne = 5 Then",
  "        scroll = scroll + 5",
  "        tbl.verticalScrollbar.Position = scroll",
  "        ligne = 0",
  "      End If",
  "      session.findById(tableId & \"/ctxtRSCSEL_255-SLOW_I[1,\" & ligne & \"]\").Text = valeurs(i)",
  "      ligne = ligne + 1",
  "      nb = nb + 1",
  "    End If",
  "  Next",
  "  SaisirSelectionMultiple = nb",
  "End Function",
  "",
  "Sub PreparerDossier(dossier, chemin)",
  "  Dim parties, i, cur",
  "  parties = Split(dossier, \"\\\")",
  "  cur = \"\"",
  "  For i = 0 To UBound(parties)",
  "    If parties(i) <> \"\" Then",
  "      If cur = \"\" Then cur = parties(i) & \"\\\" Else cur = cur & parties(i) & \"\\\"",
  "      If i > 0 Then If Not fso.FolderExists(cur) Then fso.CreateFolder cur",
  "    End If",
  "  Next",
  "  If fso.FileExists(chemin) Then fso.DeleteFile chemin, True",
  "End Sub",
  "",
  "Function AttendreFichier(chemin, secondes)",
  "  Dim t",
  "  t = 0",
  "  Do While t < secondes * 4",
  "    If fso.FileExists(chemin) Then",
  "      AttendreFichier = True",
  "      Exit Function",
  "    End If",
  "    WScript.Sleep 250",
  "    t = t + 1",
  "  Loop",
  "  AttendreFichier = fso.FileExists(chemin)",
  "End Function",
  "",
  "Function Valeurs()",
  "  Valeurs = Array(OTP_LISTE)",
  "End Function",
];

function ligneOtp(otp) {
  return otp.map(chaineVbs).join(", ");
}

function entete(titre, description) {
  return [
    "' ============================================================",
    `' ${titre}`,
    `' ${description}`,
    "' Genere par l'application Pilotage de projets.",
    "' Prerequis : SAP GUI ouvert et connecte, scripting active.",
    "' Lancement : double-clic sur ce fichier.",
    "' ============================================================",
  ];
}

function socle(titre, otp) {
  return SOCLE_VBS.map((l) =>
    l.replace("OTP_LISTE", ligneOtp(otp)).replace("TITRE", chaineVbs(titre))
  );
}

// ME2J : liste des commandes par élément d'OTP -> export texte (achats).
// Les dates ne sont pas utilisées par la transaction (comme dans GOAT).
export function genererScriptMe2j(params, otp) {
  const dossier = avecAntiSlash(params.dossierFo);
  const fichier = nettoyerNomFichier(params.fichierFo);
  const chemin = dossier + fichier;
  const L = [];
  L.push(...entete("Extraction SAP ME2J (achats / fournitures)", `Affaires : ${otp.join(", ")}`));
  L.push("");
  L.push(...socle("Extraction ME2J", otp));
  L.push("");
  L.push("Const DOSSIER = " + chaineVbs(dossier));
  L.push("Const FICHIER = " + chaineVbs(fichier));
  L.push("Const CHEMIN = " + chaineVbs(chemin));
  L.push("Const TABLE_SEL = \"wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE\"");
  L.push("");
  L.push("Dim nb, i, trouve, shell, v");
  L.push("PreparerDossier DOSSIER, CHEMIN");
  L.push("ConnecterSap");
  L.push("");
  L.push("' Ouverture de la transaction ME2J");
  L.push("session.findById(\"wnd[0]\").Maximize");
  L.push("session.findById(\"wnd[0]/tbar[0]/okcd\").Text = \"ME2J\"");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[0]\").press");
  if (params.popupProjet) {
    L.push("");
    L.push("' Popup projet (profil specifique a certains utilisateurs)");
    L.push("If Existe(\"wnd[1]/usr/ctxtTCNT-PROF_DB\") Then");
    L.push("  session.findById(\"wnd[1]/usr/ctxtTCNT-PROF_DB\").Text = " + chaineVbs(params.profilProjet));
    L.push("  session.findById(\"wnd[1]/usr/ctxtTCNT-PROF_DB\").caretPosition = " + String(String(params.profilProjet || "").length));
    L.push("  session.findById(\"wnd[1]\").sendVKey 4");
    L.push("  If Existe(\"wnd[2]/tbar[0]/btn[0]\") Then session.findById(\"wnd[2]/tbar[0]/btn[0]\").press");
    L.push("  If Existe(\"wnd[1]/tbar[0]/btn[0]\") Then session.findById(\"wnd[1]/tbar[0]/btn[0]\").press");
    L.push("End If");
  }
  L.push("");
  L.push("' Selection multiple des affaires (elements d'OTP)");
  L.push("nb = SaisirSelectionMultiple(\"wnd[0]/usr/ctxtCN_PSPNR-LOW\", \"wnd[0]/usr/btn%_CN_PSPNR_%_APP_%-VALU_PUSH\", TABLE_SEL, Valeurs())");
  L.push("If nb = 0 Then");
  L.push("  If Existe(\"wnd[1]/tbar[0]/btn[12]\") Then session.findById(\"wnd[1]/tbar[0]/btn[12]\").press");
  L.push("  Fin \"Aucune affaire exploitable.\", 48");
  L.push("End If");
  L.push("session.findById(\"wnd[1]/tbar[0]/btn[8]\").press");
  L.push("");
  L.push("' Organisation d'achats + variante de liste, puis execution");
  L.push("session.findById(\"wnd[0]/usr/ctxtS_EKORG-LOW\").Text = " + chaineVbs(params.organisationAchats));
  L.push("session.findById(\"wnd[0]/usr/ctxtLISTU\").Text = " + chaineVbs(params.varianteListeFo));
  L.push("session.findById(\"wnd[0]/usr/ctxtLISTU\").SetFocus");
  L.push("session.findById(\"wnd[0]/usr/ctxtLISTU\").caretPosition = Len(session.findById(\"wnd[0]/usr/ctxtLISTU\").Text)");
  L.push("session.findById(\"wnd[0]/tbar[1]/btn[8]\").press");
  L.push("");
  if (String(params.miseEnFormeFo || "").trim()) {
    L.push("' Mise en forme ALV " + String(params.miseEnFormeFo).trim());
    L.push("session.findById(\"wnd[0]/tbar[1]/btn[33]\").press");
    L.push("Set shell = session.findById(\"wnd[1]/usr/subSUB_CONFIGURATION:SAPLSALV_CUL_LAYOUT_CHOOSE:0500/cntlD500_CONTAINER/shellcont/shell\")");
    L.push("trouve = False");
    L.push("For i = 0 To shell.RowCount - 1");
    L.push("  v = \"\"");
    L.push("  On Error Resume Next");
    L.push("  v = shell.GetCellValue(i, \"VARIANT\")");
    L.push("  On Error GoTo 0");
    L.push("  If UCase(v) = UCase(" + chaineVbs(params.miseEnFormeFo.trim()) + ") Then");
    L.push("    shell.currentCellRow = i");
    L.push("    shell.clickCurrentCell");
    L.push("    trouve = True");
    L.push("    Exit For");
    L.push("  End If");
    L.push("Next");
    L.push("If Not trouve Then Fin \"La mise en forme SAP " + String(params.miseEnFormeFo).trim().replace(/"/g, "") + " est introuvable.\", 48");
    L.push("");
  }
  L.push("' Export de la liste en fichier texte");
  L.push("session.findById(\"wnd[0]/tbar[1]/btn[45]\").press");
  L.push("If Existe(\"wnd[1]/tbar[0]/btn[0]\") Then session.findById(\"wnd[1]/tbar[0]/btn[0]\").press");
  L.push("session.findById(\"wnd[1]/usr/ctxtDY_PATH\").Text = DOSSIER");
  L.push("session.findById(\"wnd[1]/usr/ctxtDY_FILENAME\").Text = FICHIER");
  L.push("session.findById(\"wnd[1]/usr/ctxtDY_FILENAME\").caretPosition = Len(FICHIER)");
  L.push("session.findById(\"wnd[1]/tbar[0]/btn[0]\").press");
  L.push("");
  L.push("' Retour a l'ecran principal");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[3]\").press");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[12]\").press");
  L.push("");
  L.push("If AttendreFichier(CHEMIN, 15) Then");
  L.push("  Fin \"Extraction ME2J terminee.\" & vbCrLf & \"Fichier genere : \" & CHEMIN & vbCrLf & vbCrLf & \"Importez-le dans l'application (Import SAP > Achats).\", 64");
  L.push("Else");
  L.push("  Fin \"Extraction terminee, mais le fichier est introuvable :\" & vbCrLf & CHEMIN, 48");
  L.push("End If");
  return L.join("\r\n") + "\r\n";
}

// ZCAT3 : pointages CATS sur la période -> export texte (main d'oeuvre).
export function genererScriptZcat3(params, otp, debut, fin) {
  const dossier = avecAntiSlash(params.dossierMo);
  const fichier = nettoyerNomFichier(params.fichierMo);
  const chemin = dossier + fichier;
  const d = dateSap(debut);
  const f = dateSap(fin);
  const L = [];
  L.push(...entete("Extraction SAP ZCAT3 (pointages / main d'oeuvre)", `Affaires : ${otp.join(", ")} - du ${d} au ${f}`));
  L.push("");
  L.push(...socle("Extraction ZCAT3", otp));
  L.push("");
  L.push("Const DOSSIER = " + chaineVbs(dossier));
  L.push("Const FICHIER = " + chaineVbs(fichier));
  L.push("Const CHEMIN = " + chaineVbs(chemin));
  L.push("Const TABLE_SEL = \"wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE\"");
  L.push("Const LISTE_ALV = \"wnd[0]/usr/cntlO_CONTAINER/shellcont/shell/shellcont[1]/shell\"");
  L.push("");
  L.push("Dim nb, i, ligneFocus, cellule, shell, v, t, nomVar, cible, ligneHist");
  L.push("PreparerDossier DOSSIER, CHEMIN");
  L.push("ConnecterSap");
  L.push("");
  L.push("' Ouverture de la transaction ZCAT3 et criteres (dates + societe)");
  L.push("session.findById(\"wnd[0]\").Maximize");
  L.push("session.findById(\"wnd[0]/tbar[0]/okcd\").Text = \"ZCAT3\"");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[0]\").press");
  L.push("session.findById(\"wnd[0]/usr/ctxtPNPBEGDA\").Text = " + chaineVbs(d));
  L.push("session.findById(\"wnd[0]/usr/ctxtPNPENDDA\").Text = " + chaineVbs(f));
  L.push("session.findById(\"wnd[0]/usr/ctxtPNPBUKRS-LOW\").Text = " + chaineVbs(params.societeSap));
  L.push("");
  L.push("' Selection multiple des affaires");
  L.push("nb = SaisirSelectionMultiple(\"wnd[0]/usr/ctxtS_RPROJ-LOW\", \"wnd[0]/usr/btn%_S_RPROJ_%_APP_%-VALU_PUSH\", TABLE_SEL, Valeurs())");
  L.push("If nb = 0 Then");
  L.push("  If Existe(\"wnd[1]/tbar[0]/btn[12]\") Then session.findById(\"wnd[1]/tbar[0]/btn[12]\").press");
  L.push("  Fin \"Aucune affaire exploitable.\", 48");
  L.push("End If");
  L.push("If nb <= 1 Then");
  L.push("  ligneFocus = 0");
  L.push("ElseIf nb = 2 Then");
  L.push("  ligneFocus = 1");
  L.push("Else");
  L.push("  ligneFocus = 2");
  L.push("End If");
  L.push("cellule = TABLE_SEL & \"/ctxtRSCSEL_255-SLOW_I[1,\" & ligneFocus & \"]\"");
  L.push("session.findById(cellule).SetFocus");
  L.push("session.findById(cellule).caretPosition = Len(session.findById(cellule).Text)");
  L.push("session.findById(\"wnd[1]/tbar[0]/btn[6]\").press");
  L.push("If Existe(\"wnd[2]/tbar[0]/btn[12]\") Then session.findById(\"wnd[2]/tbar[0]/btn[12]\").press");
  L.push("If Existe(\"wnd[1]/tbar[0]/btn[0]\") Then session.findById(\"wnd[1]/tbar[0]/btn[0]\").press");
  L.push("session.findById(\"wnd[1]/tbar[0]/btn[8]\").press");
  L.push("session.findById(\"wnd[0]/usr/btn%_S_RPROJ_%_APP_%-VALU_PUSH\").press");
  L.push("session.findById(\"wnd[1]/tbar[0]/btn[8]\").press");
  L.push("");
  L.push("' Execution");
  L.push("session.findById(\"wnd[0]/tbar[1]/btn[8]\").press");
  L.push("");
  const ligneHist = Number.parseInt(params.ligneVarianteMo, 10);
  const nomVariante = String(params.varianteAlvMo || "").trim();
  if (nomVariante || ligneHist >= 0) {
    const SHELL_VAR =
      "wnd[1]/usr/subSUB_CONFIGURATION:SAPLSALV_CUL_LAYOUT_CHOOSE:0500/cntlD500_CONTAINER/shellcont/shell";
    L.push("' Chargement de la mise en forme ALV (logique de GOAT) :");
    L.push("' 1) nom lu sur la ligne de la liste ou se trouve la mise en forme personnelle (ex. IAQ2_GUEST),");
    L.push("' 2) sinon nom configure, 3) sinon, clic direct sur cette ligne.");
    L.push("session.findById(LISTE_ALV).pressToolbarContextButton \"&MB_VARIANT\"");
    L.push("session.findById(LISTE_ALV).selectContextMenuItem \"&LOAD\"");
    L.push("If Not Existe(\"" + SHELL_VAR + "\") Then Fin \"Impossible d'acceder a la liste des mises en forme SAP.\", 48");
    L.push("Set shell = session.findById(\"" + SHELL_VAR + "\")");
    L.push("ligneHist = " + (ligneHist >= 0 ? ligneHist : -1));
    L.push("nomVar = \"\"");
    L.push("If ligneHist >= 0 Then");
    L.push("  On Error Resume Next");
    L.push("  nomVar = Trim(shell.GetCellValue(ligneHist, \"TEXT\"))");
    L.push("  If nomVar = \"\" Then nomVar = Trim(shell.GetCellValue(ligneHist, \"VARIANT\"))");
    L.push("  On Error GoTo 0");
    L.push("End If");
    L.push("If nomVar = \"\" Then nomVar = " + chaineVbs(nomVariante));
    L.push("nomVar = LCase(Trim(nomVar))");
    L.push("cible = -1");
    L.push("If nomVar <> \"\" Then");
    L.push("  For i = 0 To shell.RowCount - 1");
    L.push("    t = \"\" : v = \"\"");
    L.push("    On Error Resume Next");
    L.push("    t = LCase(Trim(shell.GetCellValue(i, \"TEXT\")))");
    L.push("    v = LCase(Trim(shell.GetCellValue(i, \"VARIANT\")))");
    L.push("    On Error GoTo 0");
    L.push("    If t = nomVar Or v = nomVar Then cible = i : Exit For");
    L.push("  Next");
    L.push("  If cible < 0 Then");
    L.push("    For i = 0 To shell.RowCount - 1");
    L.push("      t = \"\" : v = \"\"");
    L.push("      On Error Resume Next");
    L.push("      t = LCase(Trim(shell.GetCellValue(i, \"TEXT\")))");
    L.push("      v = LCase(Trim(shell.GetCellValue(i, \"VARIANT\")))");
    L.push("      On Error GoTo 0");
    L.push("      If InStr(t, nomVar) > 0 Or InStr(v, nomVar) > 0 Then cible = i : Exit For");
    L.push("    Next");
    L.push("  End If");
    L.push("End If");
    L.push("If cible < 0 Then cible = ligneHist");
    L.push("If cible < 0 Then Fin \"Mise en forme SAP introuvable (renseignez son nom dans les parametres, ex. IAQ2_GUEST).\", 48");
    L.push("shell.firstVisibleRow = cible");
    L.push("shell.setCurrentCell cible, \"TEXT\"");
    L.push("shell.selectedRows = CStr(cible)");
    L.push("shell.clickCurrentCell");
    L.push("");
  }
  L.push("' Export de la liste en fichier texte (menu Exporter > Fichier local)");
  L.push("session.findById(LISTE_ALV).pressToolbarContextButton \"&MB_EXPORT\"");
  L.push("session.findById(LISTE_ALV).selectContextMenuItem \"&PC\"");
  L.push("session.findById(\"wnd[1]/tbar[0]/btn[0]\").press");
  L.push("If Existe(\"wnd[1]/usr/ctxtDY_PATH\") Then");
  L.push("  session.findById(\"wnd[1]/usr/ctxtDY_PATH\").SetFocus");
  L.push("  session.findById(\"wnd[1]/usr/ctxtDY_PATH\").caretPosition = 0");
  L.push("  session.findById(\"wnd[1]\").sendVKey 4");
  L.push("End If");
  L.push("session.findById(\"wnd[2]/usr/ctxtDY_PATH\").Text = DOSSIER");
  L.push("session.findById(\"wnd[2]/usr/ctxtDY_FILENAME\").Text = FICHIER");
  L.push("session.findById(\"wnd[2]/usr/ctxtDY_FILENAME\").caretPosition = Len(FICHIER)");
  L.push("session.findById(\"wnd[2]/tbar[0]/btn[11]\").press");
  L.push("If Existe(\"wnd[1]/tbar[0]/btn[0]\") Then session.findById(\"wnd[1]/tbar[0]/btn[0]\").press");
  L.push("");
  L.push("' Retour a l'ecran principal");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[3]\").press");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[0]\").press");
  L.push("session.findById(\"wnd[0]/tbar[0]/btn[3]\").press");
  L.push("session.findById(\"wnd[0]\").sendVKey 0");
  L.push("");
  L.push("If AttendreFichier(CHEMIN, 15) Then");
  L.push("  Fin \"Extraction ZCAT3 terminee.\" & vbCrLf & \"Fichier genere : \" & CHEMIN & vbCrLf & vbCrLf & \"Importez-le dans l'application (Import SAP > Pointages).\", 64");
  L.push("Else");
  L.push("  Fin \"Extraction terminee, mais le fichier est introuvable :\" & vbCrLf & CHEMIN, 48");
  L.push("End If");
  return L.join("\r\n") + "\r\n";
}
