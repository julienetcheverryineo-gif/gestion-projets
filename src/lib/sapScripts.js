import { genererGestionnaireGoat, PROTOCOLE_GOAT } from "./goatScripts";
// Pilotage de SAP GUI (extraction des achats ME2J et des pointages CATS
// ZCAT3) par VBScript.
//
// Les séquences reprennent celles de l'application Access GOAT (modules
// modSapMe2jExtractionFournitures et modSapZcat3ExtractionMainOeuvre) :
// mêmes transactions, mêmes identifiants d'écran SAP, même ordre d'actions.
//
// Une page web ne pouvant pas piloter SAP GUI (objet COM Windows), le moteur
// VBScript tourne sur le poste. Il existe sous deux formes :
//  - un script « manuel » à télécharger et lancer par double-clic (secours) ;
//  - un gestionnaire installé UNE fois par poste, qui répond au lien
//    ineo-sap://… ouvert par l'appli : un clic dans l'appli lance SAP, puis
//    l'appli lit le fichier exporté et l'importe (voir dossierExportSap.js).
//
// Tout le texte généré est volontairement en ASCII (pas d'accents) pour que
// les .vbs s'exécutent correctement quel que soit l'encodage du fichier.

export const PARAMS_SAP_DEFAUT = {
  systemeSap: "PE1 - SAP RISE", // entrée SAP Logon ouverte seulement si aucune connexion SAP n'est ouverte
  societeSap: "2726", // Agence.SapSocieteCode (IAQ1..IAQX)
  organisationAchats: "I001", // Societe.SapOrganisationAchatsCode (INEO)
  varianteListeFo: "ZINEO", // variante de sélection ME2J
  miseEnFormeFo: "/GOAT_FO", // mise en forme ALV ME2J
  varianteAlvMo: "ZCAT3_EXPORT_TXT", // mise en forme ALV ZCAT3 (ou la vôtre, ex. IAQ2_GUEST)
  ligneVarianteMo: "50", // ligne de la liste des mises en forme où GOAT lit la variante personnelle ("" = ignorer)
  afficherSap: false, // true = fenêtre SAP visible (dépannage)
  popupProjet: false, // utilisateurs "fenêtre projet" ME2J
  profilProjet: "aaa",
  // Utilisés uniquement par le script manuel : le gestionnaire installé
  // exporte toujours dans %USERPROFILE%\PilotageSAP\exports\.
  dossierFo: "C:\\temp-goat\\sap-fo\\",
  fichierFo: "export-fo-sap.txt",
  dossierMo: "C:\\temp-goat\\sap-mo\\",
  fichierMo: "export-mo-sap.txt",
};

export const PROTOCOLE_SAP = "ineo-sap";
export const DOSSIER_EXPORT_LOCAL = "%USERPROFILE%\\PilotageSAP\\exports";

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

// Les affaires d'agences différentes (AAQ5…, AAQ2…) ne peuvent pas être
// saisies ensemble dans SAP sans bug : on les traite en plusieurs passes,
// une par préfixe d'agence (4 premiers caractères du code OTP).
export function grouperParAgence(otp) {
  const groupes = new Map();
  otp.forEach((o) => {
    const prefixe = o.slice(0, 4);
    if (!groupes.has(prefixe)) groupes.set(prefixe, []);
    groupes.get(prefixe).push(o);
  });
  return [...groupes.entries()].map(([prefixe, codes]) => ({ prefixe, codes }));
}

// Validation commune ; renvoie la liste des problèmes (vide = OK).
export function validerParametres(params, otp, { dates = false, debut, fin, fo = false, mo = false, chemins = false }) {
  const erreurs = [];
  if (otp.length === 0) erreurs.push("Aucune affaire sélectionnée.");
  if (otp.length > 60) erreurs.push("Trop d'affaires sélectionnées (60 maximum).");
  if (otp.some((o) => !/^[A-Z0-9._-]{4,24}$/.test(o)))
    erreurs.push("Un code affaire contient des caractères non pris en charge.");
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
  const sur = /^[A-Za-z0-9_/. -]{0,40}$/;
  [params.varianteListeFo, params.miseEnFormeFo, params.varianteAlvMo, params.systemeSap].forEach((v) => {
    if (!sur.test(String(v || ""))) erreurs.push("Un paramètre SAP contient des caractères non pris en charge.");
  });
  if (!/^[A-Za-z0-9]{0,10}$/.test(String(params.societeSap || "")) ||
      !/^[A-Za-z0-9]{0,10}$/.test(String(params.organisationAchats || "")))
    erreurs.push("Code société ou organisation d'achats invalide.");
  if (chemins) {
    if (fo && (!avecAntiSlash(params.dossierFo) || !nettoyerNomFichier(params.fichierFo)))
      erreurs.push("Dossier ou nom de fichier d'export FO manquant.");
    if (mo && (!avecAntiSlash(params.dossierMo) || !nettoyerNomFichier(params.fichierMo)))
      erreurs.push("Dossier ou nom de fichier d'export MO manquant.");
  }
  return [...new Set(erreurs)];
}

// Lien de l'envoi d'un lot de tâches (le lot est dans taches-entree.txt).
export function construireUrlLotTaches(params) {
  const sy = String(params.systemeSap || "").trim().replace(/ /g, "+");
  return `${PROTOCOLE_SAP}://run?t=taches&m=lot&sy=${sy}`;
}

// Lien ouvert par l'appli pour lancer le gestionnaire installé. Jeu de
// caractères volontairement restreint (pas de « % » : le gestionnaire passe
// ce lien à une ligne de commande Windows) ; l'espace devient « + ».
export function construireUrlLancement(type, params, otp, debut, fin) {
  const q = [];
  const ajoute = (cle, valeur) => q.push(cle + "=" + String(valeur ?? "").replace(/ /g, "+"));
  ajoute("t", type);
  ajoute("o", otp.join(","));
  ajoute("ax", params.afficherSap ? "1" : "0");
  ajoute("sy", String(params.systemeSap || "").trim());
  if (type === "mo") {
    ajoute("d", dateSap(debut));
    ajoute("f", dateSap(fin));
    ajoute("s", params.societeSap);
    ajoute("va", params.varianteAlvMo);
    ajoute("lh", String(params.ligneVarianteMo ?? "").trim() === "" ? "-1" : params.ligneVarianteMo);
  } else {
    ajoute("oa", params.organisationAchats);
    ajoute("vl", params.varianteListeFo);
    ajoute("mf", params.miseEnFormeFo);
    ajoute("pp", params.popupProjet ? "1" : "0");
    ajoute("pr", params.profilProjet);
  }
  return `${PROTOCOLE_SAP}://run?` + q.join("&");
}

// ---------------------------------------------------------------------------
// Moteur VBScript (partagé entre le script manuel et le gestionnaire installé)
// ---------------------------------------------------------------------------

const DECLARATIONS = String.raw`Option Explicit

Dim SapGuiAuto, SapApp, SapCon, session, fso, wsh
Dim MODE_APPLI, TYPE_EXTRACTION, LISTE_OTP, DATE_DEB, DATE_FIN, SOCIETE, ORG_ACHATS
Dim VAR_LISTE_FO, MISE_FORME_FO, VAR_ALV_MO, LIGNE_HIST, POPUP_PROJET, PROFIL_PROJET
Dim CODE_TACHE, LIB_TACHE, CHAMPS_SAISIE, LOT_CODES, LOT_LIBS
Dim DOSSIER, FICHIER, CHEMIN, CHEMIN_STATUT, AFFICHER_SAP, SESSION_CREEE, SYSTEME_SAP, CONNEXION_OUVERTE

Const TABLE_SEL = "wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE"
Const LISTE_ALV = "wnd[0]/usr/cntlO_CONTAINER/shellcont/shell/shellcont[1]/shell"
Const GRILLE_TACHES = "wnd[0]/shellcont/shell"
Const SHELL_VAR = "wnd[1]/usr/subSUB_CONFIGURATION:SAPLSALV_CUL_LAYOUT_CHOOSE:0500/cntlD500_CONTAINER/shellcont/shell"

Set fso = CreateObject("Scripting.FileSystemObject")
Set wsh = CreateObject("WScript.Shell")
SESSION_CREEE = False
`;

const MOTEUR = String.raw`
Sub InitChemins()
  CHEMIN = DOSSIER & FICHIER
  CHEMIN_STATUT = DOSSIER & "statut-" & TYPE_EXTRACTION & ".txt"
End Sub

Sub EcrireStatut(etat, message)
  Dim f
  On Error Resume Next
  Set f = fso.CreateTextFile(CHEMIN_STATUT, True, False)
  f.WriteLine etat
  f.WriteLine Replace(Replace(message, vbCr, " "), vbLf, " ")
  f.Close
  On Error GoTo 0
End Sub

Sub Fin(message, code)
  FermerSessionDediee
  If MODE_APPLI Then
    If code = 64 Then
      EcrireStatut "OK", message
      WScript.Quit 0
    Else
      EcrireStatut "ERREUR", message
      WScript.Quit 1
    End If
  Else
    MsgBox message, code, "Extraction SAP"
    WScript.Quit
  End If
End Sub

' Fin sans donnee : ni achat ni heure pour ces affaires, ce n'est pas une erreur.
Sub FinVide(message)
  FermerSessionDediee
  If MODE_APPLI Then
    EcrireStatut "VIDE", message
    WScript.Quit 0
  Else
    MsgBox message, 64, "Extraction SAP"
    WScript.Quit
  End If
End Sub

Function Existe(id)
  Dim o
  Set o = Nothing
  On Error Resume Next
  Set o = session.findById(id)
  Existe = (Err.Number = 0)
  Err.Clear
  On Error GoTo 0
  If Existe Then
    If o Is Nothing Then Existe = False
  End If
End Function

Function SapPret()
  Dim erreur
  Set SapGuiAuto = Nothing
  On Error Resume Next
  Set SapGuiAuto = GetObject("SAPGUI")
  erreur = Err.Number
  Err.Clear
  On Error GoTo 0
  SapPret = (erreur = 0) And (Not SapGuiAuto Is Nothing)
End Function

' Demarre SAP Logon (chemin lu dans le registre, sinon emplacements usuels).
Sub LancerSapLogon()
  Dim c, chemins, i
  c = ""
  On Error Resume Next
  c = Replace(wsh.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\saplogon.exe\"), """", "")
  Err.Clear
  On Error GoTo 0
  If c <> "" Then
    If Not fso.FileExists(c) Then c = ""
  End If
  If c = "" Then
    chemins = Array(wsh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\SAP\FrontEnd\SAPgui\saplogon.exe", wsh.ExpandEnvironmentStrings("%ProgramFiles%") & "\SAP\FrontEnd\SAPgui\saplogon.exe")
    For i = 0 To UBound(chemins)
      If fso.FileExists(chemins(i)) Then c = chemins(i)
    Next
  End If
  If c = "" Then Fin "SAP Logon est introuvable sur ce poste : lancez SAP manuellement puis relancez.", 48
  wsh.Run """" & c & """", 1, False
End Sub

Sub Progression(message)
  If MODE_APPLI Then EcrireStatut "EN_COURS", message
End Sub

' Si la session est sur l'ecran de connexion (utilisateur vide), attend la
' fin de la connexion : automatique en authentification unique, sinon saisie
' des identifiants (2 minutes). Si l'etat de connexion est illisible, on ne
' bloque pas.
Sub AttendreConnexion()
  Dim i, u, lisible
  For i = 1 To 480
    u = ""
    lisible = False
    On Error Resume Next
    u = session.Info.User
    If Err.Number = 0 Then lisible = True
    Err.Clear
    On Error GoTo 0
    If lisible = False Or u <> "" Then Exit Sub
    If i = 24 And CONNEXION_OUVERTE And Not AFFICHER_SAP Then
      On Error Resume Next
      session.findById("wnd[0]").restore
      Err.Clear
      On Error GoTo 0
    End If
    If i = 1 Then Progression "En attente de la connexion a SAP (saisissez vos identifiants dans la fenetre SAP si besoin)"
    WScript.Sleep 250
  Next
  Fin "Connexion a SAP non effectuee (delai de 2 minutes depasse).", 48
End Sub

' Connexion a SAP : reutilise TOUJOURS une connexion deja ouverte (la
' premiere), et ne demarre SAP / n'ouvre l'entree SYSTEME_SAP de SAP Logon
' que s'il n'y en a aucune.
Sub ConnecterSap()
  Dim i, erreur
  CONNEXION_OUVERTE = False

  If Not SapPret() Then
    Progression "Demarrage de SAP..."
    LancerSapLogon
    For i = 1 To 120
      WScript.Sleep 250
      If SapPret() Then Exit For
    Next
    If Not SapPret() Then Fin "SAP GUI n'a pas demarre. Lancez SAP manuellement puis relancez.", 48
    WScript.Sleep 2000
  End If

  Set SapApp = Nothing
  On Error Resume Next
  Set SapApp = SapGuiAuto.GetScriptingEngine
  erreur = Err.Number
  Err.Clear
  On Error GoTo 0
  If erreur <> 0 Then Fin "Le scripting SAP n'est pas actif (options SAP GUI > Accessibilite et scripting).", 48
  If SapApp Is Nothing Then Fin "Le scripting SAP n'est pas actif (options SAP GUI > Accessibilite et scripting).", 48

  If SapApp.Children.Count = 0 Then
    If SYSTEME_SAP = "" Then Fin "Aucune connexion SAP n'est ouverte.", 48
    Progression "Ouverture de la connexion SAP " & SYSTEME_SAP & "..."
    Set SapCon = Nothing
    On Error Resume Next
    Set SapCon = SapApp.OpenConnection(SYSTEME_SAP, True)
    erreur = Err.Number
    Err.Clear
    On Error GoTo 0
    If erreur <> 0 Then Fin "Impossible d'ouvrir la connexion SAP " & SYSTEME_SAP & " (nom exact de l'entree dans SAP Logon).", 48
    If SapCon Is Nothing Then Fin "Impossible d'ouvrir la connexion SAP " & SYSTEME_SAP & " (nom exact de l'entree dans SAP Logon).", 48
    CONNEXION_OUVERTE = True
  Else
    Set SapCon = SapApp.Children(0)
  End If

  For i = 1 To 40
    If SapCon.Children.Count > 0 Then Exit For
    WScript.Sleep 250
  Next
  If SapCon.Children.Count = 0 Then Fin "Aucune session SAP active.", 48
  Set session = SapCon.Children(0)
  If CONNEXION_OUVERTE And Not AFFICHER_SAP Then
    On Error Resume Next
    session.findById("wnd[0]").iconify
    Err.Clear
    On Error GoTo 0
  End If
  AttendreConnexion
  Progression "Extraction SAP en cours..."
  OuvrirSessionDediee
End Sub

' Travaille dans une NOUVELLE session SAP, reduite dans la barre des taches :
' la session en cours de l'utilisateur n'est ni utilisee ni deplacee, et on
' ne voit pas les ecrans defiler. Si la creation echoue (6 sessions deja
' ouvertes...), on retombe sur la session existante.
Sub OuvrirSessionDediee()
  Dim avant, i, n
  avant = SapCon.Children.Count
  On Error Resume Next
  session.createSession
  Err.Clear
  On Error GoTo 0
  For i = 1 To 40
    If SapCon.Children.Count > avant Then Exit For
    WScript.Sleep 250
  Next
  If SapCon.Children.Count > avant Then
    n = SapCon.Children.Count
    Set session = SapCon.Children(n - 1)
    SESSION_CREEE = True
    WScript.Sleep 1000
  End If
  If Not AFFICHER_SAP Then
    On Error Resume Next
    session.findById("wnd[0]").iconify
    Err.Clear
    If CONNEXION_OUVERTE And SESSION_CREEE Then SapCon.Children(0).findById("wnd[0]").iconify
    Err.Clear
    On Error GoTo 0
  End If
End Sub

Sub FermerSessionDediee()
  If SESSION_CREEE Then
    SESSION_CREEE = False
    On Error Resume Next
    SapCon.CloseSession session.ID
    Err.Clear
    On Error GoTo 0
  End If
End Sub

' Saisie des affaires dans la fenetre de selection multiple (5 lignes
' visibles, defilement par blocs de 5).
Function SaisirSelectionMultiple(champSimple, boutonMultiple)
  Dim tbl, i, ligne, scroll, nb
  session.findById(champSimple).SetFocus
  session.findById(champSimple).caretPosition = 0
  session.findById(boutonMultiple).press
  Set tbl = session.findById(TABLE_SEL)
  ligne = 0 : scroll = 0 : nb = 0
  For i = 0 To UBound(LISTE_OTP)
    If Trim(LISTE_OTP(i)) <> "" Then
      If ligne = 5 Then
        scroll = scroll + 5
        tbl.verticalScrollbar.Position = scroll
        ligne = 0
      End If
      session.findById(TABLE_SEL & "/ctxtRSCSEL_255-SLOW_I[1," & ligne & "]").Text = LISTE_OTP(i)
      ligne = ligne + 1
      nb = nb + 1
    End If
  Next
  SaisirSelectionMultiple = nb
End Function

Sub PreparerDossier()
  Dim parties, i, cur
  parties = Split(DOSSIER, "\")
  cur = ""
  For i = 0 To UBound(parties)
    If parties(i) <> "" Then
      If cur = "" Then
        cur = parties(i) & "\"
      Else
        cur = cur & parties(i) & "\"
        If Not fso.FolderExists(cur) Then fso.CreateFolder cur
      End If
    End If
  Next
  If fso.FileExists(CHEMIN) Then fso.DeleteFile CHEMIN, True
End Sub

Function AttendreFichier(secondes)
  Dim t
  t = 0
  Do While t < secondes * 4
    If fso.FileExists(CHEMIN) Then
      AttendreFichier = True
      Exit Function
    End If
    WScript.Sleep 250
    t = t + 1
  Loop
  AttendreFichier = fso.FileExists(CHEMIN)
End Function

Sub Terminer(libelle, ongletImport)
  If AttendreFichier(20) Then
    WScript.Sleep 800
    Fin "Extraction " & libelle & " terminee. Fichier : " & CHEMIN & ongletImport, 64
  Else
    Fin "Extraction terminee, mais le fichier est introuvable : " & CHEMIN, 48
  End If
End Sub

Sub ExtraireFo()
  Dim nb, i, trouve, shell, v
  session.findById("wnd[0]/tbar[0]/okcd").Text = "ME2J"
  session.findById("wnd[0]/tbar[0]/btn[0]").press

  If POPUP_PROJET Then
    If Existe("wnd[1]/usr/ctxtTCNT-PROF_DB") Then
      session.findById("wnd[1]/usr/ctxtTCNT-PROF_DB").Text = PROFIL_PROJET
      session.findById("wnd[1]/usr/ctxtTCNT-PROF_DB").caretPosition = Len(PROFIL_PROJET)
      session.findById("wnd[1]").sendVKey 4
      If Existe("wnd[2]/tbar[0]/btn[0]") Then session.findById("wnd[2]/tbar[0]/btn[0]").press
      If Existe("wnd[1]/tbar[0]/btn[0]") Then session.findById("wnd[1]/tbar[0]/btn[0]").press
    End If
  End If

  nb = SaisirSelectionMultiple("wnd[0]/usr/ctxtCN_PSPNR-LOW", "wnd[0]/usr/btn%_CN_PSPNR_%_APP_%-VALU_PUSH")
  If nb = 0 Then
    If Existe("wnd[1]/tbar[0]/btn[12]") Then session.findById("wnd[1]/tbar[0]/btn[12]").press
    Fin "Aucune affaire exploitable.", 48
  End If
  session.findById("wnd[1]/tbar[0]/btn[8]").press

  session.findById("wnd[0]/usr/ctxtS_EKORG-LOW").Text = ORG_ACHATS
  session.findById("wnd[0]/usr/ctxtLISTU").Text = VAR_LISTE_FO
  session.findById("wnd[0]/usr/ctxtLISTU").SetFocus
  session.findById("wnd[0]/usr/ctxtLISTU").caretPosition = Len(session.findById("wnd[0]/usr/ctxtLISTU").Text)
  session.findById("wnd[0]/tbar[1]/btn[8]").press
  If Existe("wnd[0]/usr/ctxtS_EKORG-LOW") Then FinVide "Aucun achat pour ces affaires."

  If MISE_FORME_FO <> "" Then
    session.findById("wnd[0]/tbar[1]/btn[33]").press
    Set shell = session.findById(SHELL_VAR)
    trouve = False
    For i = 0 To shell.RowCount - 1
      v = ""
      On Error Resume Next
      v = shell.GetCellValue(i, "VARIANT")
      On Error GoTo 0
      If UCase(v) = UCase(MISE_FORME_FO) Then
        shell.currentCellRow = i
        shell.clickCurrentCell
        trouve = True
        Exit For
      End If
    Next
    If Not trouve Then Fin "La mise en forme SAP " & MISE_FORME_FO & " est introuvable.", 48
  End If

  session.findById("wnd[0]/tbar[1]/btn[45]").press
  If Existe("wnd[1]/tbar[0]/btn[0]") Then session.findById("wnd[1]/tbar[0]/btn[0]").press
  session.findById("wnd[1]/usr/ctxtDY_PATH").Text = DOSSIER
  session.findById("wnd[1]/usr/ctxtDY_FILENAME").Text = FICHIER
  session.findById("wnd[1]/usr/ctxtDY_FILENAME").caretPosition = Len(FICHIER)
  session.findById("wnd[1]/tbar[0]/btn[0]").press

  session.findById("wnd[0]/tbar[0]/btn[3]").press
  session.findById("wnd[0]/tbar[0]/btn[12]").press
  Terminer "ME2J", ""
End Sub

' Mise en forme ALV de ZCAT3 (logique de GOAT) : nom lu sur la ligne
' LIGNE_HIST de la liste (mise en forme personnelle, ex. IAQ2_GUEST), sinon
' nom configure, sinon clic direct sur cette ligne.
Sub ChargerMiseEnFormeMo()
  Dim shell, i, t, v, nomVar, cible
  If VAR_ALV_MO = "" And LIGNE_HIST < 0 Then Exit Sub
  session.findById(LISTE_ALV).pressToolbarContextButton "&MB_VARIANT"
  session.findById(LISTE_ALV).selectContextMenuItem "&LOAD"
  If Not Existe(SHELL_VAR) Then Fin "Impossible d'acceder a la liste des mises en forme SAP.", 48
  Set shell = session.findById(SHELL_VAR)
  nomVar = ""
  If LIGNE_HIST >= 0 Then
    On Error Resume Next
    nomVar = Trim(shell.GetCellValue(LIGNE_HIST, "TEXT"))
    If nomVar = "" Then nomVar = Trim(shell.GetCellValue(LIGNE_HIST, "VARIANT"))
    On Error GoTo 0
  End If
  If nomVar = "" Then nomVar = VAR_ALV_MO
  nomVar = LCase(Trim(nomVar))
  cible = -1
  If nomVar <> "" Then
    For i = 0 To shell.RowCount - 1
      t = "" : v = ""
      On Error Resume Next
      t = LCase(Trim(shell.GetCellValue(i, "TEXT")))
      v = LCase(Trim(shell.GetCellValue(i, "VARIANT")))
      On Error GoTo 0
      If t = nomVar Or v = nomVar Then
        cible = i
        Exit For
      End If
    Next
    If cible < 0 Then
      For i = 0 To shell.RowCount - 1
        t = "" : v = ""
        On Error Resume Next
        t = LCase(Trim(shell.GetCellValue(i, "TEXT")))
        v = LCase(Trim(shell.GetCellValue(i, "VARIANT")))
        On Error GoTo 0
        If InStr(t, nomVar) > 0 Or InStr(v, nomVar) > 0 Then
          cible = i
          Exit For
        End If
      Next
    End If
  End If
  If cible < 0 Then cible = LIGNE_HIST
  If cible < 0 Then Fin "Mise en forme SAP introuvable (renseignez son nom dans les parametres, ex. IAQ2_GUEST).", 48
  shell.firstVisibleRow = cible
  shell.setCurrentCell cible, "TEXT"
  shell.selectedRows = CStr(cible)
  shell.clickCurrentCell
End Sub

Sub ExtraireMo()
  Dim nb, ligneFocus, cellule
  session.findById("wnd[0]/tbar[0]/okcd").Text = "ZCAT3"
  session.findById("wnd[0]/tbar[0]/btn[0]").press
  session.findById("wnd[0]/usr/ctxtPNPBEGDA").Text = DATE_DEB
  session.findById("wnd[0]/usr/ctxtPNPENDDA").Text = DATE_FIN
  session.findById("wnd[0]/usr/ctxtPNPBUKRS-LOW").Text = SOCIETE

  nb = SaisirSelectionMultiple("wnd[0]/usr/ctxtS_RPROJ-LOW", "wnd[0]/usr/btn%_S_RPROJ_%_APP_%-VALU_PUSH")
  If nb = 0 Then
    If Existe("wnd[1]/tbar[0]/btn[12]") Then session.findById("wnd[1]/tbar[0]/btn[12]").press
    Fin "Aucune affaire exploitable.", 48
  End If
  If nb <= 1 Then
    ligneFocus = 0
  ElseIf nb = 2 Then
    ligneFocus = 1
  Else
    ligneFocus = 2
  End If
  cellule = TABLE_SEL & "/ctxtRSCSEL_255-SLOW_I[1," & ligneFocus & "]"
  session.findById(cellule).SetFocus
  session.findById(cellule).caretPosition = Len(session.findById(cellule).Text)
  session.findById("wnd[1]/tbar[0]/btn[6]").press
  If Existe("wnd[2]/tbar[0]/btn[12]") Then session.findById("wnd[2]/tbar[0]/btn[12]").press
  If Existe("wnd[1]/tbar[0]/btn[0]") Then session.findById("wnd[1]/tbar[0]/btn[0]").press
  session.findById("wnd[1]/tbar[0]/btn[8]").press
  session.findById("wnd[0]/usr/btn%_S_RPROJ_%_APP_%-VALU_PUSH").press
  session.findById("wnd[1]/tbar[0]/btn[8]").press

  session.findById("wnd[0]/tbar[1]/btn[8]").press
  If Existe("wnd[0]/usr/ctxtPNPBEGDA") Then FinVide "Aucune heure pour ces affaires sur la periode."
  ChargerMiseEnFormeMo

  session.findById(LISTE_ALV).pressToolbarContextButton "&MB_EXPORT"
  session.findById(LISTE_ALV).selectContextMenuItem "&PC"
  session.findById("wnd[1]/tbar[0]/btn[0]").press
  If Existe("wnd[1]/usr/ctxtDY_PATH") Then
    session.findById("wnd[1]/usr/ctxtDY_PATH").SetFocus
    session.findById("wnd[1]/usr/ctxtDY_PATH").caretPosition = 0
    session.findById("wnd[1]").sendVKey 4
  End If
  session.findById("wnd[2]/usr/ctxtDY_PATH").Text = DOSSIER
  session.findById("wnd[2]/usr/ctxtDY_FILENAME").Text = FICHIER
  session.findById("wnd[2]/usr/ctxtDY_FILENAME").caretPosition = Len(FICHIER)
  session.findById("wnd[2]/tbar[0]/btn[11]").press
  If Existe("wnd[1]/tbar[0]/btn[0]") Then session.findById("wnd[1]/tbar[0]/btn[0]").press

  session.findById("wnd[0]/tbar[0]/btn[3]").press
  session.findById("wnd[0]/tbar[0]/btn[0]").press
  session.findById("wnd[0]/tbar[0]/btn[3]").press
  session.findById("wnd[0]").sendVKey 0
  Terminer "ZCAT3", ""
End Sub

' ---- Test d'ecriture : transaction ZCA_TACHES (saisie SANS enregistrement) ----
Sub Collecter(obj, prof, sortie)
  Dim i, n, t, ch, id, tx, enf, coll, msg
  If prof > 14 Then Exit Sub
  If sortie.Count > 3000 Then Exit Sub
  On Error Resume Next
  t = "" : ch = "" : id = "" : tx = "" : msg = ""
  t = obj.Type
  ch = obj.Changeable
  id = obj.Id
  tx = obj.Text
  Err.Clear
  n = -1
  Set coll = Nothing
  Set coll = obj.Children
  If Err.Number <> 0 Then msg = msg & " [Children: " & Err.Description & "]"
  Err.Clear
  n = coll.Count
  If Err.Number <> 0 Then
    msg = msg & " [Count: " & Err.Description & "]"
    Err.Clear
    n = coll.Length
    If Err.Number <> 0 Then
      msg = msg & " [Length: " & Err.Description & "]"
      n = 0
    End If
  End If
  Err.Clear
  sortie.Add sortie.Count, String(prof * 2, " ") & id & " | " & t & " | chg=" & ch & " | n=" & n & " | " & Replace(Replace(tx, vbCr, " "), vbLf, " ") & msg
  If (t = "GuiTextField" Or t = "GuiCTextField") And ch = True Then CHAMPS_SAISIE.Add CHAMPS_SAISIE.Count, id
  For i = 0 To n - 1
    Set enf = Nothing
    Set enf = coll.Item(CLng(i))
    If Err.Number <> 0 Then
      Err.Clear
      Set enf = coll.ElementAt(CLng(i))
    End If
    If Err.Number = 0 Then
      Collecter enf, prof + 1, sortie
    Else
      sortie.Add sortie.Count, String(prof * 2 + 2, " ") & "(enfant " & i & " illisible : " & Err.Description & ")"
    End If
    Err.Clear
  Next
End Sub

Function ScannerEcran(nomFichier)
  Dim sortie, k, f, info
  Set sortie = CreateObject("Scripting.Dictionary")
  Set CHAMPS_SAISIE = CreateObject("Scripting.Dictionary")
  info = ""
  On Error Resume Next
  info = "Transaction=" & session.Info.Transaction & " | Programme=" & session.Info.Program & " | Ecran=" & session.Info.ScreenNumber & " | Titre=" & session.findById("wnd[0]").Text & " | Barre=" & session.findById("wnd[0]/sbar").Text
  Err.Clear
  On Error GoTo 0
  sortie.Add 0, info
  Collecter session.findById("wnd[0]"), 0, sortie
  DecrireGrille sortie
  On Error Resume Next
  Set f = fso.CreateTextFile(DOSSIER & nomFichier, True, False)
  For Each k In sortie.Keys
    f.WriteLine sortie(k)
  Next
  f.Close
  On Error GoTo 0
  ScannerEcran = CHAMPS_SAISIE.Count
End Function

' Description de la grille ALV de ZCA_TACHES : colonnes, lignes, boutons.
Sub DecrireGrille(sortie)
  Dim g, i, n, col, r, ligne, nr, tit
  If Not Existe("wnd[0]/shellcont/shell") Then Exit Sub
  Set g = session.findById(GRILLE_TACHES)
  On Error Resume Next
  nr = g.RowCount
  sortie.Add sortie.Count, "GRILLE lignes=" & nr & " colonnes=" & g.ColumnCount & " ligneCourante=" & g.CurrentCellRow & " colCourante=" & g.CurrentCellColumn
  Err.Clear
  n = g.ColumnOrder.Count
  For i = 0 To n - 1
    col = g.ColumnOrder.Item(CLng(i))
    tit = ""
    tit = g.GetColumnTitles(col).Item(0)
    Err.Clear
    sortie.Add sortie.Count, "GRILLE colonne " & i & " : " & col & " | titre=" & tit & " | modifiable(ligne0)=" & g.GetCellChangeable(0, col)
    Err.Clear
  Next
  For r = 0 To nr - 1
    If r > 15 Then Exit For
    ligne = ""
    For i = 0 To n - 1
      col = g.ColumnOrder.Item(CLng(i))
      ligne = ligne & g.GetCellValue(r, col) & " ; "
    Next
    sortie.Add sortie.Count, "GRILLE ligne " & r & " : " & ligne
    Err.Clear
  Next
  n = g.ToolbarButtonCount
  For i = 0 To n - 1
    sortie.Add sortie.Count, "GRILLE bouton " & i & " : id=" & g.GetToolbarButtonId(i) & " | texte=" & g.GetToolbarButtonText(i) & " | info=" & g.GetToolbarButtonToolTip(i) & " | type=" & g.GetToolbarButtonType(i)
    Err.Clear
  Next
  Err.Clear
End Sub

' Identifiant du bouton de la barre d'outils de la grille correspondant a un motif.
Function BoutonGrille(g, motif)
  Dim i, n, id, tx, re
  BoutonGrille = ""
  Set re = New RegExp
  re.IgnoreCase = True
  re.Pattern = motif
  On Error Resume Next
  n = g.ToolbarButtonCount
  For i = 0 To n - 1
    id = "" : tx = ""
    id = g.GetToolbarButtonId(i)
    tx = g.GetToolbarButtonText(i) & " " & g.GetToolbarButtonToolTip(i)
    Err.Clear
    If re.Test(id) Or re.Test(tx) Then
      BoutonGrille = id
      Exit Function
    End If
  Next
End Function

' Ligne de la grille dont la colonne code est vide (la ligne qu'on vient d'ajouter).
Function LigneVide(g, colCode)
  Dim r, nr
  LigneVide = -1
  nr = g.RowCount
  For r = 0 To nr - 1
    If Trim(g.GetCellValue(r, colCode)) = "" Then
      LigneVide = r
      Exit Function
    End If
  Next
End Function

' Retour a l'ecran d'accueil SAP.
Sub RetourAccueil()
  On Error Resume Next
  session.findById("wnd[0]/tbar[0]/okcd").Text = "/n"
  session.findById("wnd[0]/tbar[0]/btn[0]").press
  WScript.Sleep 800
  Err.Clear
  On Error GoTo 0
End Sub

Sub EcrireTaches()
  Dim n, g, idChamp, bouton, nl, ligne, i, j, nc, col, cibles, barre, msgFenetre
  Dim colCode, colLib, existants, aEnvoyer, cree, deja, code, lib, nbAvant
  EcrireStatut "EN_COURS", "Ouverture de ZCA_TACHES"
  session.findById("wnd[0]/tbar[0]/okcd").Text = "/nZCA_TACHES"
  session.findById("wnd[0]/tbar[0]/btn[0]").press
  WScript.Sleep 2000
  n = ScannerEcran("zca-taches-ecran-1.txt")
  If Existe("wnd[0]/usr/ctxtP_CHARGE") Then
    idChamp = "wnd[0]/usr/ctxtP_CHARGE"
  ElseIf n > 0 Then
    idChamp = CHAMPS_SAISIE(0)
  Else
    Fin "ZCA_TACHES : champ Imputation introuvable (voir zca-taches-ecran-1.txt).", 48
  End If
  session.findById(idChamp).Text = LISTE_OTP(0)
  session.findById("wnd[0]/tbar[1]/btn[8]").press
  WScript.Sleep 2500
  n = ScannerEcran("zca-taches-ecran-2.txt")
  If Not Existe(GRILLE_TACHES) Then Fin "ZCA_TACHES : la grille des taches n'est pas affichee (voir zca-taches-ecran-2.txt).", 48
  Set g = session.findById(GRILLE_TACHES)
  nbAvant = g.RowCount

  bouton = BoutonGrille(g, "APPEND")
  If bouton = "" Then bouton = BoutonGrille(g, "INSERT_ROW")
  If bouton = "" Then bouton = BoutonGrille(g, "Ajouter|Cr.er|Nouvelle|Ins.rer")
  If bouton = "" Then Fin "ZCA_TACHES : aucun bouton d'ajout de ligne trouve dans la grille (voir zca-taches-ecran-2.txt).", 48

  ' Une premiere ligne vide sert a reperer les colonnes de saisie (code, libelle).
  g.pressToolbarButton bouton
  WScript.Sleep 1200
  If Existe("wnd[1]") Then Fin "ZCA_TACHES : une fenetre s'est ouverte apres l'ajout de ligne.", 48
  Set g = session.findById(GRILLE_TACHES)
  If g.RowCount > nbAvant Then
    ligne = g.CurrentCellRow
  Else
    ligne = g.CurrentCellRow
  End If
  Set cibles = CreateObject("Scripting.Dictionary")
  nc = g.ColumnOrder.Count
  For i = 0 To nc - 1
    col = g.ColumnOrder.Item(CLng(i))
    If g.GetCellChangeable(ligne, col) Then cibles.Add cibles.Count, col
  Next
  If cibles.Count < 2 Then Fin "ZCA_TACHES : moins de 2 colonnes modifiables sur la nouvelle ligne.", 48
  colCode = cibles(0)
  colLib = cibles(1)

  ' Taches deja presentes dans SAP pour ce compte : on ne les recree pas.
  Set existants = CreateObject("Scripting.Dictionary")
  For j = 0 To g.RowCount - 1
    code = UCase(Trim(g.GetCellValue(j, colCode)))
    If code <> "" Then existants(code) = True
  Next
  Set aEnvoyer = CreateObject("Scripting.Dictionary")
  deja = 0
  For i = 0 To LOT_CODES.Count - 1
    code = LOT_CODES(i)
    If existants.Exists(UCase(code)) Then
      deja = deja + 1
    Else
      existants(UCase(code)) = True
      aEnvoyer.Add aEnvoyer.Count, i
    End If
  Next
  If aEnvoyer.Count = 0 Then
    SESSION_CREEE = False
    Fin "ZCA_TACHES : compte " & LISTE_OTP(0) & " - rien a creer, les " & deja & " tache(s) existent deja. Une ligne vide non enregistree reste dans la fenetre SAP : fermez-la sans enregistrer.", 64
  End If

  cree = 0
  For j = 0 To aEnvoyer.Count - 1
    i = aEnvoyer(j)
    If j > 0 Then
      g.pressToolbarButton bouton
      WScript.Sleep 1200
      Set g = session.findById(GRILLE_TACHES)
      ligne = LigneVide(g, colCode)
      If ligne < 0 Then ligne = g.CurrentCellRow
    End If
    g.ModifyCell ligne, colCode, LOT_CODES(i)
    g.ModifyCell ligne, colLib, LOT_LIBS(i)
    g.SetCurrentCell ligne, colLib
    g.PressEnter
    WScript.Sleep 500
    cree = cree + 1
    EcrireStatut "EN_COURS", "Saisie " & cree & "/" & aEnvoyer.Count
  Next
  n = ScannerEcran("zca-taches-ecran-3.txt")

  session.findById("wnd[0]").sendVKey 11
  WScript.Sleep 1800
  msgFenetre = ""
  If Existe("wnd[1]") Then
    On Error Resume Next
    msgFenetre = " Fenetre SAP : " & session.findById("wnd[1]").Text & " " & session.findById("wnd[1]/usr").Text
    Err.Clear
    On Error GoTo 0
  End If
  n = ScannerEcran("zca-taches-ecran-4.txt")
  barre = ""
  On Error Resume Next
  barre = session.findById("wnd[0]/sbar").Text
  Err.Clear
  On Error GoTo 0
  RetourAccueil
  SESSION_CREEE = False
  Fin "ZCA_TACHES : compte " & LISTE_OTP(0) & ", " & cree & " tache(s) saisie(s) et enregistree(s)" & IIf2(deja > 0, ", " & deja & " deja presente(s)", "") & ". Message SAP : " & barre & msgFenetre, 64
End Sub

Function IIf2(c, a, b)
  If c Then
    IIf2 = a
  Else
    IIf2 = b
  End If
End Function

Sub Lancer()
  InitChemins
  PreparerDossier
  ConnecterSap
  If TYPE_EXTRACTION = "taches" Then
    EcrireTaches
  ElseIf TYPE_EXTRACTION = "fo" Then
    ExtraireFo
  Else
    ExtraireMo
  End If
End Sub
`;

// ---------------------------------------------------------------------------
// Script manuel (téléchargé, valeurs figées)
// ---------------------------------------------------------------------------

function enteteManuel(titre, otp, suite) {
  return [
    "' ============================================================",
    `' ${titre}`,
    `' Affaires : ${otp.join(", ")}${suite ? " - " + suite : ""}`,
    "' Genere par l'application Pilotage de projets.",
    "' Prerequis : SAP GUI ouvert et connecte, scripting active.",
    "' Lancement : double-clic sur ce fichier.",
    "' ============================================================",
    "",
  ].join("\r\n");
}

export function genererScriptManuel(type, params, otp, debut, fin) {
  const fo = type === "fo";
  const dossier = avecAntiSlash(fo ? params.dossierFo : params.dossierMo);
  const fichier = nettoyerNomFichier(fo ? params.fichierFo : params.fichierMo);
  const ligneHist = Number.parseInt(params.ligneVarianteMo, 10);
  const valeurs = [
    `MODE_APPLI = False`,
    `TYPE_EXTRACTION = ${chaineVbs(type)}`,
    `LISTE_OTP = Array(${otp.map(chaineVbs).join(", ")})`,
    `SYSTEME_SAP = ${chaineVbs(String(params.systemeSap || "").trim())}`,
    `DATE_DEB = ${chaineVbs(dateSap(debut))}`,
    `DATE_FIN = ${chaineVbs(dateSap(fin))}`,
    `SOCIETE = ${chaineVbs(params.societeSap)}`,
    `ORG_ACHATS = ${chaineVbs(params.organisationAchats)}`,
    `VAR_LISTE_FO = ${chaineVbs(params.varianteListeFo)}`,
    `MISE_FORME_FO = ${chaineVbs(String(params.miseEnFormeFo || "").trim())}`,
    `VAR_ALV_MO = ${chaineVbs(String(params.varianteAlvMo || "").trim())}`,
    `LIGNE_HIST = ${Number.isFinite(ligneHist) && ligneHist >= 0 ? ligneHist : -1}`,
    `POPUP_PROJET = ${params.popupProjet ? "True" : "False"}`,
    `AFFICHER_SAP = ${params.afficherSap ? "True" : "False"}`,
    `PROFIL_PROJET = ${chaineVbs(params.profilProjet)}`,
    `DOSSIER = ${chaineVbs(dossier)}`,
    `FICHIER = ${chaineVbs(fichier)}`,
    "Lancer",
    "",
  ].join("\r\n");
  const titre = fo ? "Extraction SAP ME2J (achats / fournitures)" : "Extraction SAP ZCAT3 (pointages / main d'oeuvre)";
  const corps = (DECLARATIONS + "\n" + valeurs + MOTEUR).replace(/\r?\n/g, "\r\n");
  return enteteManuel(titre, otp, fo ? "" : `du ${dateSap(debut)} au ${dateSap(fin)}`) + corps + "\r\n";
}

// ---------------------------------------------------------------------------
// Gestionnaire du lien ineo-sap:// (installé une fois par poste)
// ---------------------------------------------------------------------------

const GESTIONNAIRE_MAIN = String.raw`
' Gestionnaire du lien ineo-sap://run?... ouvert par l'application.
' Mode normal : valide le lien, puis relance ce meme script en mode moteur
' (cscript masque) et consigne le resultat dans statut-<type>.txt.
Dim msgMoteur
If WScript.Arguments.Count >= 2 Then
  If WScript.Arguments(0) = "--engine" Then
    MODE_APPLI = True
    msgMoteur = ChargerDepuisUrl(WScript.Arguments(1))
    InitChemins
    If msgMoteur <> "" Then Fin msgMoteur, 48
    Lancer
    WScript.Quit 0
  End If
End If
If WScript.Arguments.Count = 1 Then Wrapper
WScript.Quit 0
`;

const GESTIONNAIRE_FONCTIONS = String.raw`
Function Valide(motif, s)
  Dim r
  Set r = New RegExp
  r.Pattern = motif
  r.IgnoreCase = False
  Valide = r.Test(s)
End Function

' Charge et VALIDE les parametres du lien (liste blanche de caracteres) :
' une page quelconque peut ouvrir ce lien, rien d'autre que ces valeurs
' ne doit pouvoir atteindre SAP ou le disque.
' Lot de taches a envoyer dans ZCA_TACHES : fichier taches-entree.txt (Unicode)
' ecrit par l'application dans le dossier d'export. 1re ligne : compte ;
' ensuite une tache par ligne : code <tab> libelle.
Function ChargerLot()
  Dim chemin, f, txt, lignes, i, parts, code, lib, c, k, v
  ChargerLot = ""
  chemin = DOSSIER & "taches-entree.txt"
  If Not fso.FileExists(chemin) Then
    ChargerLot = "Fichier des taches introuvable."
    Exit Function
  End If
  On Error Resume Next
  Set f = fso.OpenTextFile(chemin, 1, False, -1)
  txt = f.ReadAll
  f.Close
  If Err.Number <> 0 Then
    ChargerLot = "Fichier des taches illisible."
    Exit Function
  End If
  On Error GoTo 0
  lignes = Split(Replace(txt, vbCr, ""), vbLf)
  Set LOT_CODES = CreateObject("Scripting.Dictionary")
  Set LOT_LIBS = CreateObject("Scripting.Dictionary")
  c = ""
  For i = 0 To UBound(lignes)
    If Trim(lignes(i)) <> "" Then
      If c = "" Then
        c = Trim(lignes(i))
        If Not Valide("^[A-Z0-9._-]{4,24}$", c) Then
          ChargerLot = "Numero de compte invalide."
          Exit Function
        End If
      Else
        parts = Split(lignes(i), vbTab, 2)
        If UBound(parts) < 1 Then
          ChargerLot = "Ligne de tache invalide."
          Exit Function
        End If
        code = Trim(parts(0))
        lib = ""
        For k = 1 To Len(parts(1))
          v = Mid(parts(1), k, 1)
          If AscW(v) >= 32 Then lib = lib & v
        Next
        lib = Left(Trim(lib), 40)
        If Not Valide("^[A-Za-z0-9]{1,8}$", code) Then
          ChargerLot = "Code tache invalide (8 caracteres maxi) : " & Left(code, 12)
          Exit Function
        End If
        If lib = "" Then
          ChargerLot = "Libelle vide pour le code " & code
          Exit Function
        End If
        LOT_CODES.Add LOT_CODES.Count, code
        LOT_LIBS.Add LOT_LIBS.Count, lib
      End If
    End If
  Next
  If c = "" Or LOT_CODES.Count = 0 Then
    ChargerLot = "Aucune tache a envoyer."
    Exit Function
  End If
  If LOT_CODES.Count > 300 Then
    ChargerLot = "Trop de taches."
    Exit Function
  End If
  LISTE_OTP = Array(c)
End Function

Function ChargerDepuisUrl(url)
  Dim p, parts, i, kv, d, otps, j, base
  ChargerDepuisUrl = ""
  base = wsh.ExpandEnvironmentStrings("%USERPROFILE%") & "\PilotageSAP\exports\"
  DOSSIER = base
  TYPE_EXTRACTION = "fo"
  p = InStr(url, "?")
  If p = 0 Then
    ChargerDepuisUrl = "Lien invalide."
    Exit Function
  End If
  Set d = CreateObject("Scripting.Dictionary")
  parts = Split(Mid(url, p + 1), "&")
  For i = 0 To UBound(parts)
    kv = Split(parts(i), "=", 2)
    If UBound(kv) = 1 Then d(kv(0)) = Replace(kv(1), "+", " ")
  Next
  If Not d.Exists("t") Then
    ChargerDepuisUrl = "Type d'extraction manquant."
    Exit Function
  End If
  If Not Valide("^(fo|mo|taches)$", d("t")) Then
    ChargerDepuisUrl = "Type d'extraction invalide."
    Exit Function
  End If
  TYPE_EXTRACTION = d("t")
  If TYPE_EXTRACTION = "fo" Then FICHIER = "export-fo-sap.txt" Else FICHIER = "export-mo-sap.txt"
  If TYPE_EXTRACTION = "taches" Then
    If d.Exists("m") Then
      If d("m") <> "lot" Then
        ChargerDepuisUrl = "Mode invalide."
        Exit Function
      End If
      ChargerDepuisUrl = ChargerLot()
      If ChargerDepuisUrl <> "" Then Exit Function
      DATE_DEB = "" : DATE_FIN = "" : SOCIETE = "" : ORG_ACHATS = ""
      VAR_LISTE_FO = "" : MISE_FORME_FO = "" : VAR_ALV_MO = "" : LIGNE_HIST = -1
      POPUP_PROJET = False : PROFIL_PROJET = "" : AFFICHER_SAP = True : SYSTEME_SAP = ""
      If d.Exists("sy") Then
        If Not Valide("^[A-Za-z0-9_ .-]{0,40}$", d("sy")) Then
          ChargerDepuisUrl = "Systeme SAP invalide."
          Exit Function
        End If
        SYSTEME_SAP = Trim(d("sy"))
      End If
      Exit Function
    End If
    If Not (d.Exists("o") And d.Exists("c") And d.Exists("l")) Then
      ChargerDepuisUrl = "Parametres ZCA_TACHES manquants."
      Exit Function
    End If
    If Not Valide("^[A-Z0-9._-]{4,24}$", d("o")) Then
      ChargerDepuisUrl = "Numero de compte invalide."
      Exit Function
    End If
    If Not Valide("^[A-Za-z0-9]{1,8}$", d("c")) Then
      ChargerDepuisUrl = "Code tache invalide (8 caracteres maxi)."
      Exit Function
    End If
    If Not Valide("^[A-Za-z0-9 _.-]{1,40}$", d("l")) Then
      ChargerDepuisUrl = "Libelle de tache invalide."
      Exit Function
    End If
    LISTE_OTP = Array(d("o"))
    CODE_TACHE = d("c") : LIB_TACHE = d("l")
    Set LOT_CODES = CreateObject("Scripting.Dictionary")
    Set LOT_LIBS = CreateObject("Scripting.Dictionary")
    LOT_CODES.Add 0, CODE_TACHE
    LOT_LIBS.Add 0, LIB_TACHE
    DATE_DEB = "" : DATE_FIN = "" : SOCIETE = "" : ORG_ACHATS = ""
    VAR_LISTE_FO = "" : MISE_FORME_FO = "" : VAR_ALV_MO = "" : LIGNE_HIST = -1
    POPUP_PROJET = False : PROFIL_PROJET = "" : AFFICHER_SAP = True : SYSTEME_SAP = ""
    If d.Exists("sy") Then
      If Not Valide("^[A-Za-z0-9_ .-]{0,40}$", d("sy")) Then
        ChargerDepuisUrl = "Systeme SAP invalide."
        Exit Function
      End If
      SYSTEME_SAP = Trim(d("sy"))
    End If
    Exit Function
  End If
  If Not d.Exists("o") Then
    ChargerDepuisUrl = "Aucune affaire dans le lien."
    Exit Function
  End If
  otps = Split(d("o"), ",")
  If UBound(otps) > 59 Then
    ChargerDepuisUrl = "Trop d'affaires."
    Exit Function
  End If
  For j = 0 To UBound(otps)
    If Not Valide("^[A-Z0-9._-]{4,24}$", otps(j)) Then
      ChargerDepuisUrl = "Code affaire invalide : " & Left(otps(j), 30)
      Exit Function
    End If
  Next
  LISTE_OTP = otps
  DATE_DEB = "" : DATE_FIN = "" : SOCIETE = "" : ORG_ACHATS = ""
  VAR_LISTE_FO = "" : MISE_FORME_FO = "" : VAR_ALV_MO = "" : LIGNE_HIST = -1
  POPUP_PROJET = False : PROFIL_PROJET = "" : AFFICHER_SAP = False : SYSTEME_SAP = ""
  If d.Exists("sy") Then
    If Not Valide("^[A-Za-z0-9_ .-]{0,40}$", d("sy")) Then
      ChargerDepuisUrl = "Systeme SAP invalide."
      Exit Function
    End If
    SYSTEME_SAP = Trim(d("sy"))
  End If
  If d.Exists("ax") Then
    If Not Valide("^[01]$", d("ax")) Then
      ChargerDepuisUrl = "Parametre invalide."
      Exit Function
    End If
    AFFICHER_SAP = (d("ax") = "1")
  End If
  If TYPE_EXTRACTION = "mo" Then
    If Not (d.Exists("d") And d.Exists("f") And d.Exists("s")) Then
      ChargerDepuisUrl = "Dates ou societe manquantes."
      Exit Function
    End If
    If Not (Valide("^\d{2}\.\d{2}\.\d{4}$", d("d")) And Valide("^\d{2}\.\d{2}\.\d{4}$", d("f"))) Then
      ChargerDepuisUrl = "Dates invalides."
      Exit Function
    End If
    If Not Valide("^[A-Za-z0-9]{1,10}$", d("s")) Then
      ChargerDepuisUrl = "Code societe invalide."
      Exit Function
    End If
    DATE_DEB = d("d") : DATE_FIN = d("f") : SOCIETE = d("s")
    If d.Exists("va") Then
      If Not Valide("^[A-Za-z0-9_/. -]{0,40}$", d("va")) Then
        ChargerDepuisUrl = "Mise en forme invalide."
        Exit Function
      End If
      VAR_ALV_MO = Trim(d("va"))
    End If
    If d.Exists("lh") Then
      If Not Valide("^-?[0-9]{1,3}$", d("lh")) Then
        ChargerDepuisUrl = "Ligne de mise en forme invalide."
        Exit Function
      End If
      LIGNE_HIST = CInt(d("lh"))
    End If
  Else
    If Not d.Exists("oa") Then
      ChargerDepuisUrl = "Organisation d'achats manquante."
      Exit Function
    End If
    If Not Valide("^[A-Za-z0-9]{1,10}$", d("oa")) Then
      ChargerDepuisUrl = "Organisation d'achats invalide."
      Exit Function
    End If
    ORG_ACHATS = d("oa")
    If d.Exists("vl") Then
      If Not Valide("^[A-Za-z0-9_/. -]{0,40}$", d("vl")) Then
        ChargerDepuisUrl = "Variante invalide."
        Exit Function
      End If
      VAR_LISTE_FO = Trim(d("vl"))
    End If
    If d.Exists("mf") Then
      If Not Valide("^[A-Za-z0-9_/. -]{0,40}$", d("mf")) Then
        ChargerDepuisUrl = "Mise en forme invalide."
        Exit Function
      End If
      MISE_FORME_FO = Trim(d("mf"))
    End If
    If d.Exists("pp") Then
      If Not Valide("^[01]$", d("pp")) Then
        ChargerDepuisUrl = "Parametre invalide."
        Exit Function
      End If
      POPUP_PROJET = (d("pp") = "1")
    End If
    If d.Exists("pr") Then
      If Not Valide("^[A-Za-z0-9_]{0,12}$", d("pr")) Then
        ChargerDepuisUrl = "Profil projet invalide."
        Exit Function
      End If
      PROFIL_PROJET = d("pr")
    End If
  End If
End Function

Function LirePremiereLigne(chemin)
  Dim f
  LirePremiereLigne = ""
  On Error Resume Next
  If fso.FileExists(chemin) Then
    Set f = fso.OpenTextFile(chemin, 1)
    LirePremiereLigne = Trim(f.ReadLine)
    f.Close
  End If
  On Error GoTo 0
End Function

Sub Wrapper()
  Dim url, msg, tmp, cmd, rc, txt, f
  url = WScript.Arguments(0)
  MODE_APPLI = True
  msg = ChargerDepuisUrl(url)
  InitChemins
  If msg <> "" Then
    EcrireStatut "ERREUR", msg
    WScript.Quit 1
  End If
  PreparerDossier
  EcrireStatut "EN_COURS", "Lancement"
  tmp = wsh.ExpandEnvironmentStrings("%TEMP%") & "\pilotage-sap-" & TYPE_EXTRACTION & ".log"
  cmd = "cmd /c ""cscript.exe //nologo """ & WScript.ScriptFullName & """ --engine """ & url & """ > """ & tmp & """ 2>&1"""
  rc = wsh.Run(cmd, 0, True)
  If rc <> 0 Then
    If LirePremiereLigne(CHEMIN_STATUT) <> "ERREUR" Then
      txt = ""
      On Error Resume Next
      If fso.FileExists(tmp) Then
        Set f = fso.OpenTextFile(tmp, 1)
        txt = Left(f.ReadAll, 300)
        f.Close
      End If
      On Error GoTo 0
      EcrireStatut "ERREUR", "Erreur pendant le pilotage de SAP. " & txt
    End If
  End If
End Sub
`;

export function genererGestionnaire() {
  return (DECLARATIONS + MOTEUR + GESTIONNAIRE_FONCTIONS + GESTIONNAIRE_MAIN).replace(/\r?\n/g, "\r\n");
}

// Installateur (à lancer une fois par poste, sans droits administrateur) :
// écrit le gestionnaire dans %USERPROFILE%\PilotageSAP et déclare le lien
// ineo-sap:// pour l'utilisateur courant (HKCU).
export function genererInstallateur() {
  const ecrire = (texte) =>
    texte.split("\r\n").map((l) => `f.WriteLine "${l.replace(/"/g, '""')}"`);
  const lignes = ecrire(genererGestionnaire());
  const lignesGoat = ecrire(genererGestionnaireGoat());
  return [
    "' Installation de Pilotage SAP sur ce poste (une seule fois).",
    "' Cree %USERPROFILE%\\PilotageSAP et declare le lien " + PROTOCOLE_SAP + ":// pour l'utilisateur courant.",
    "Option Explicit",
    "Dim wsh, fso, base, expo, hand, handGoat, f",
    'Set wsh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'base = wsh.ExpandEnvironmentStrings("%USERPROFILE%") & "\\PilotageSAP"',
    'expo = base & "\\exports"',
    "If Not fso.FolderExists(base) Then fso.CreateFolder base",
    "If Not fso.FolderExists(expo) Then fso.CreateFolder expo",
    'hand = base & "\\pilotage-sap.vbs"',
    "Set f = fso.CreateTextFile(hand, True, False)",
    ...lignes,
    "f.Close",
    'handGoat = base & "\\pilotage-goat.vbs"',
    "Set f = fso.CreateTextFile(handGoat, True, False)",
    ...lignesGoat,
    "f.Close",
    `wsh.RegWrite "HKCU\\Software\\Classes\\${PROTOCOLE_GOAT}\\", "URL:Pilotage GOAT", "REG_SZ"`,
    `wsh.RegWrite "HKCU\\Software\\Classes\\${PROTOCOLE_GOAT}\\URL Protocol", "", "REG_SZ"`,
    `wsh.RegWrite "HKCU\\Software\\Classes\\${PROTOCOLE_GOAT}\\shell\\open\\command\\", "wscript.exe """ & handGoat & """ ""%1""", "REG_SZ"`,
    `wsh.RegWrite "HKCU\\Software\\Classes\\${PROTOCOLE_SAP}\\", "URL:Pilotage SAP", "REG_SZ"`,
    `wsh.RegWrite "HKCU\\Software\\Classes\\${PROTOCOLE_SAP}\\URL Protocol", "", "REG_SZ"`,
    `wsh.RegWrite "HKCU\\Software\\Classes\\${PROTOCOLE_SAP}\\shell\\open\\command\\", "wscript.exe """ & hand & """ ""%1""", "REG_SZ"`,
    'MsgBox "Installation terminee." & vbCrLf & vbCrLf & "Dossier d\'export a choisir dans l\'application (une seule fois) :" & vbCrLf & expo, 64, "Pilotage SAP"',
    "",
  ].join("\r\n");
}
