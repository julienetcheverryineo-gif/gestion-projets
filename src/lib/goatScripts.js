// Gestionnaire du lien ineo-goat:// (installé avec le gestionnaire SAP, une
// fois par poste) : écrit les lignes de la table Fourniture de la base GOAT
// (Access) depuis l'appli. Même principe que SAP : l'appli dépose le lot dans
// %USERPROFILE%\PilotageSAP\exports\goat-entree.txt (UTF-16), ouvre le lien,
// puis lit le compte rendu dans statut-goat.txt (EN_COURS / OK / ERREUR).
//
// Script VBS 100 % ASCII (String.raw), validé champ par champ : une page
// quelconque peut ouvrir le lien, seules les données du fichier d'entrée,
// elles-mêmes revalidées ici, atteignent la base.

export const PROTOCOLE_GOAT = "ineo-goat";
export const CHEMIN_GOAT_DEFAUT = "C:\\GOAT\\0.21.0\\goat.accdb";

export function construireUrlGoat(mode = "fourniture") {
  return `${PROTOCOLE_GOAT}://run?m=${mode === "mo" ? "mo" : "fourniture"}`;
}

const GESTIONNAIRE_GOAT = String.raw`
' Gestionnaire du lien ineo-goat://run?m=fourniture
' Ecrit des lignes (budget + RAE) dans Fourniture ou MainOeuvre de la base GOAT (Access).
Option Explicit
Dim wsh, fso, BASE, EXPO, CHEMIN_STATUT, ARG_X86
Set wsh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
BASE = wsh.ExpandEnvironmentStrings("%USERPROFILE%") & "\PilotageSAP"
EXPO = BASE & "\exports\"
CHEMIN_STATUT = EXPO & "statut-goat.txt"
ARG_X86 = False

Sub Statut(etat, message)
  Dim f
  On Error Resume Next
  Set f = fso.CreateTextFile(CHEMIN_STATUT, True, False)
  f.WriteLine etat
  f.WriteLine Replace(Replace(message, vbCr, " "), vbLf, " ")
  f.Close
  On Error GoTo 0
End Sub

Sub Echec(message)
  Statut "ERREUR", message
  WScript.Quit 1
End Sub

Function Valide(motif, s)
  Dim r
  Set r = New RegExp
  r.Pattern = motif
  r.IgnoreCase = False
  Valide = r.Test(s)
End Function

Function Sq(s)
  Sq = Replace(s, "'", "''")
End Function

Function Aaaa(n, l)
  Aaaa = Right(String(l, "0") & CStr(n), l)
End Function

Function Horodatage()
  Dim d
  d = Now
  Horodatage = Aaaa(Year(d), 4) & Aaaa(Month(d), 2) & Aaaa(Day(d), 2) & "_" & Aaaa(Hour(d), 2) & Aaaa(Minute(d), 2) & Aaaa(Second(d), 2)
End Function

' Copie de securite de la base avant ecriture (5 dernieres conservees).
Function Sauvegarder(chemin)
  Dim dossier, dest, ext, fichiers, f, noms(), n, i, j, t
  Sauvegarder = ""
  On Error Resume Next
  dossier = BASE & "\sauvegardes-goat"
  If Not fso.FolderExists(dossier) Then fso.CreateFolder dossier
  ext = LCase(fso.GetExtensionName(chemin))
  dest = dossier & "\goat_" & Horodatage() & "." & ext
  fso.CopyFile chemin, dest, True
  If Err.Number <> 0 Then
    Sauvegarder = " (sauvegarde impossible : " & Err.Description & ")"
    Err.Clear
    Exit Function
  End If
  n = 0
  ReDim noms(fso.GetFolder(dossier).Files.Count)
  For Each f In fso.GetFolder(dossier).Files
    If LCase(Left(f.Name, 5)) = "goat_" Then
      noms(n) = f.Name
      n = n + 1
    End If
  Next
  For i = 0 To n - 2
    For j = i + 1 To n - 1
      If noms(j) < noms(i) Then
        t = noms(i) : noms(i) = noms(j) : noms(j) = t
      End If
    Next
  Next
  For i = 0 To n - 6
    fso.DeleteFile dossier & "\" & noms(i), True
  Next
  Err.Clear
  On Error GoTo 0
End Function

' Ouvre la base Access (fournisseur ACE 16 puis 12). Si le fournisseur n'est
' pas visible depuis ce processus 64 bits (Office 32 bits), on relance le
' gestionnaire en 32 bits.
Function OuvrirBase(chemin, ByRef msgErreur)
  Dim cn, provs, i, ok
  Set OuvrirBase = Nothing
  msgErreur = ""
  provs = Array("Microsoft.ACE.OLEDB.16.0", "Microsoft.ACE.OLEDB.12.0")
  For i = 0 To UBound(provs)
    On Error Resume Next
    Set cn = CreateObject("ADODB.Connection")
    cn.Open "Provider=" & provs(i) & ";Data Source=" & chemin & ";Persist Security Info=False;"
    If Err.Number = 0 Then
      Set OuvrirBase = cn
      On Error GoTo 0
      Exit Function
    End If
    msgErreur = Err.Description
    Err.Clear
    On Error GoTo 0
  Next
End Function

Function Lire(chemin)
  Dim f
  Set f = fso.OpenTextFile(chemin, 1, False, -1)
  Lire = f.ReadAll
  f.Close
End Function

Function Executer(cn, sql, ByRef msgErreur)
  On Error Resume Next
  cn.Execute sql
  If Err.Number <> 0 Then
    msgErreur = Err.Description
    Executer = False
    Err.Clear
  Else
    Executer = True
  End If
  On Error GoTo 0
End Function

Sub Principal()
  Dim url, chemin, txt, lignes, i, parts, affaire, rs, numAffaire, cmsg
  Dim typeId, code, lib, montant, tentatives, k, ok, errSql, idExistant, maxId
  Dim nbAjout, nbMaj, cn, sauv, x86, cols, vals, mode
  Dim tTable, tId, tCode, tLib, tMont, nbParts, motifCode, majType, setType, rae, nbRaeErr, raeErr, tRae, familles, nbFam, famErr, fams, f, idMo, idFam, nbFamIns, nbFamErr

  url = ""
  If WScript.Arguments.Count >= 1 Then url = WScript.Arguments(0)
  If WScript.Arguments.Count >= 2 Then
    If WScript.Arguments(1) = "--x86" Then ARG_X86 = True
  End If
  ' Le navigateur peut ajouter un "/" (ineo-goat://run/?m=fourniture) : on ne
  ' controle que le protocole et le parametre m.
  If LCase(Left(url, 10)) <> "ineo-goat:" Then Echec "Lien GOAT invalide : " & Left(url, 60)
  If InStr(url, "?m=fourniture") > 0 Then
    mode = "fourniture"
  ElseIf InStr(url, "?m=mo") > 0 Then
    mode = "mo"
  Else
    Echec "Lien GOAT invalide : " & Left(url, 60)
  End If
  If mode = "fourniture" Then
    tTable = "Fourniture" : tId = "FournitureID" : tCode = "Code" : tLib = "Libelle" : tMont = "MontantBudg" : tRae = "MontantRae"
    nbParts = 4 : motifCode = "^[A-Za-z0-9._-]{1,25}$"
  Else
    tTable = "MainOeuvre" : tId = "MainOeuvreID" : tCode = "SegmentCode" : tLib = "SegmentLibelle" : tMont = "HeuresBudget" : tRae = "HeuresRae"
    nbParts = 4 : motifCode = "^[A-Za-z0-9._ -]{1,50}$"
  End If

  Statut "EN_COURS", "Lecture du lot"
  If Not fso.FileExists(EXPO & "goat-entree.txt") Then Echec "Fichier goat-entree.txt introuvable."
  On Error Resume Next
  txt = Lire(EXPO & "goat-entree.txt")
  If Err.Number <> 0 Then Echec "Fichier du lot illisible."
  On Error GoTo 0
  txt = Replace(txt, vbCr, "")
  lignes = Split(txt, vbLf)
  If UBound(lignes) < 2 Then Echec "Lot vide."

  chemin = Trim(lignes(0))
  If Not Valide("^([A-Za-z]:|\\\\)[^<>""|?*]{3,240}\.(accdb|mdb)$", chemin) Then Echec "Chemin de la base GOAT invalide."
  If Not fso.FileExists(chemin) Then Echec "Base GOAT introuvable : " & chemin
  affaire = Trim(lignes(1))
  If Not Valide("^[0-9]{1,9}$", affaire) Then Echec "AffaireID GOAT invalide."

  If UBound(lignes) > 300 Then Echec "Trop de lignes."
  ' Validation de tout le lot avant la moindre ecriture.
  For i = 2 To UBound(lignes)
    If Trim(lignes(i)) <> "" Then
      parts = Split(lignes(i), vbTab)
      If UBound(parts) <> nbParts Then Echec "Ligne " & (i - 1) & " invalide."
      k = 0
      If mode = "fourniture" Then
        If Not Valide("^[12]$", Trim(parts(0))) Then Echec "TypeID invalide ligne " & (i - 1) & "."
        k = 1
      End If
      If Not Valide(motifCode, Trim(parts(k))) Then Echec "Code invalide ligne " & (i - 1) & " : " & Left(parts(k), 30)
      If Len(parts(k + 1)) > 255 Or Valide("[\x00-\x08\x0B-\x1F]", parts(k + 1)) Then Echec "Libelle invalide ligne " & (i - 1) & "."
      If Not Valide("^-?[0-9]{1,12}(\.[0-9]{1,4})?$", Trim(parts(k + 2))) Then Echec "Montant ou heures invalide ligne " & (i - 1) & "."
      If Not Valide("^-?[0-9]{1,12}(\.[0-9]{1,4})?$", Trim(parts(k + 3))) Then Echec "RAE invalide ligne " & (i - 1) & "."
      If mode = "mo" Then
        If Not Valide("^([A-Za-z0-9]{1,10}(\|[A-Za-z0-9]{1,10})*)?$", Trim(parts(4))) Then Echec "Familles invalides ligne " & (i - 1) & "."
      End If
    End If
  Next

  Statut "EN_COURS", "Ouverture de la base GOAT"
  Set cn = OuvrirBase(chemin, cmsg)
  If cn Is Nothing Then
    If Not ARG_X86 Then
      x86 = wsh.ExpandEnvironmentStrings("%SystemRoot%") & "\SysWOW64\wscript.exe"
      If fso.FileExists(x86) Then
        wsh.Run """" & x86 & """ """ & WScript.ScriptFullName & """ """ & url & """ --x86", 0, False
        WScript.Quit 0
      End If
    End If
    Echec "Impossible d'ouvrir la base GOAT (pilote Access ACE absent ou base protegee / ouverte en exclusif) : " & cmsg
  End If

  ' L'affaire doit exister.
  On Error Resume Next
  Set rs = cn.Execute("SELECT Numero FROM Affaire WHERE AffaireID=" & affaire)
  If Err.Number <> 0 Then
    cmsg = Err.Description
    cn.Close
    Echec "Lecture de la table Affaire impossible : " & cmsg
  End If
  On Error GoTo 0
  If rs.EOF Then
    rs.Close : cn.Close
    Echec "AffaireID " & affaire & " introuvable dans GOAT (verifiez le champ AffaireID GOAT)."
  End If
  numAffaire = rs.Fields(0).Value & ""
  rs.Close

  sauv = Sauvegarder(chemin)

  nbAjout = 0 : nbMaj = 0 : nbRaeErr = 0 : raeErr = "" : nbFamIns = 0 : nbFamErr = 0 : famErr = ""
  For i = 2 To UBound(lignes)
    If Trim(lignes(i)) <> "" Then
      parts = Split(lignes(i), vbTab)
      typeId = ""
      If mode = "fourniture" Then
        typeId = Trim(parts(0)) : code = Trim(parts(1)) : lib = parts(2) : montant = Trim(parts(3)) : rae = Trim(parts(4))
      Else
        code = Trim(parts(0)) : lib = parts(1) : montant = Trim(parts(2)) : rae = Trim(parts(3)) : familles = Trim(parts(4))
      End If
      Statut "EN_COURS", "Ecriture " & (i - 1) & "/" & (UBound(lignes) - 1) & " : " & code

      idExistant = ""
      Set rs = cn.Execute("SELECT " & tId & " FROM " & tTable & " WHERE AffaireID=" & affaire & " AND " & tCode & "='" & Sq(code) & "'")
      If Not rs.EOF Then idExistant = CStr(rs.Fields(0).Value)
      rs.Close

      If idExistant <> "" Then
        setType = ""
        If typeId <> "" Then setType = "TypeID=" & typeId & ", "
        ok = Executer(cn, "UPDATE " & tTable & " SET " & setType & tLib & "='" & Sq(lib) & "', " & tMont & "=" & montant & " WHERE " & tId & "=" & idExistant, errSql)
        If Not ok Then
          cn.Close
          Echec "Mise a jour de " & code & " impossible : " & errSql & sauv
        End If
        nbMaj = nbMaj + 1
      Else
        ' Insertion : champs utiles seulement. Si la base exige un identifiant
        ' ou l'horodatage technique (SSMA_TimeStamp), on les fournit aux
        ' tentatives suivantes.
        Set rs = cn.Execute("SELECT MAX(" & tId & ") FROM " & tTable)
        maxId = 0
        If Not IsNull(rs.Fields(0).Value) Then maxId = CLng(rs.Fields(0).Value)
        rs.Close
        If typeId <> "" Then
          cols = "AffaireID, TypeID, " & tCode & ", " & tLib & ", " & tMont
          vals = affaire & ", " & typeId & ", '" & Sq(code) & "', '" & Sq(lib) & "', " & montant
        Else
          cols = "AffaireID, " & tCode & ", " & tLib & ", " & tMont
          vals = affaire & ", '" & Sq(code) & "', '" & Sq(lib) & "', " & montant
        End If
        tentatives = Array( _
          "INSERT INTO " & tTable & " (" & cols & ") VALUES (" & vals & ")", _
          "INSERT INTO " & tTable & " (" & tId & ", " & cols & ") VALUES (" & (maxId + 1) & ", " & vals & ")", _
          "INSERT INTO " & tTable & " (" & cols & ", SSMA_TimeStamp) SELECT TOP 1 " & vals & ", SSMA_TimeStamp FROM " & tTable, _
          "INSERT INTO " & tTable & " (" & tId & ", " & cols & ", SSMA_TimeStamp) SELECT TOP 1 " & (maxId + 1) & ", " & vals & ", SSMA_TimeStamp FROM " & tTable)
        ok = False
        For k = 0 To UBound(tentatives)
          If Executer(cn, tentatives(k), errSql) Then
            ok = True
            Exit For
          End If
        Next
        If Not ok Then
          cn.Close
          Echec "Ajout de " & code & " impossible : " & errSql & sauv
        End If
        nbAjout = nbAjout + 1
      End If

      ' Reste a engager (RAE) : mise a jour a part, non bloquante.
      If Not Executer(cn, "UPDATE " & tTable & " SET " & tRae & "=" & rae & " WHERE AffaireID=" & affaire & " AND " & tCode & "='" & Sq(code) & "'", errSql) Then
        nbRaeErr = nbRaeErr + 1
        If raeErr = "" Then raeErr = errSql
      End If

      ' Main d'oeuvre : familles de personnel (MainOeuvreHasFamilleGroupe),
      ' Pourcent = 100. On remplace les liens existants de la tache.
      If mode = "mo" And familles <> "" Then
        idMo = ""
        Set rs = cn.Execute("SELECT MainOeuvreID FROM MainOeuvre WHERE AffaireID=" & affaire & " AND SegmentCode='" & Sq(code) & "'")
        If Not rs.EOF Then idMo = CStr(rs.Fields(0).Value)
        rs.Close
        If idMo <> "" Then
          If Executer(cn, "DELETE FROM MainOeuvreHasFamilleGroupe WHERE MainOeuvreID=" & idMo, errSql) Then
            fams = Split(familles, "|")
            For Each f In fams
              idFam = ""
              Set rs = cn.Execute("SELECT GroupeFamilleID FROM GroupeFamille WHERE Code='" & Sq(f) & "'")
              If Not rs.EOF Then idFam = CStr(rs.Fields(0).Value)
              rs.Close
              If idFam = "" Then
                nbFamErr = nbFamErr + 1
                If famErr = "" Then famErr = "famille " & f & " absente de GroupeFamille"
              Else
                ok = Executer(cn, "INSERT INTO MainOeuvreHasFamilleGroupe (MainOeuvreID, GroupeFamilleID, Pourcent) VALUES (" & idMo & ", " & idFam & ", 100)", errSql)
                If Not ok Then ok = Executer(cn, "INSERT INTO MainOeuvreHasFamilleGroupe (MainOeuvreID, GroupeFamilleID, Pourcent, SSMA_TimeStamp) SELECT TOP 1 " & idMo & ", " & idFam & ", 100, SSMA_TimeStamp FROM MainOeuvre", errSql)
                If ok Then
                  nbFamIns = nbFamIns + 1
                Else
                  nbFamErr = nbFamErr + 1
                  If famErr = "" Then famErr = errSql
                End If
              End If
            Next
          Else
            nbFamErr = nbFamErr + 1
            If famErr = "" Then famErr = errSql
          End If
        End If
      End If
    End If
  Next
  cn.Close
  If nbRaeErr > 0 Then sauv = " ATTENTION : champ " & tRae & " non renseigne sur " & nbRaeErr & " ligne(s) (" & raeErr & ")." & sauv
  If mode = "mo" Then
    sauv = " Familles de personnel : " & nbFamIns & " lien(s) ecrit(s)" & sauv
    If nbFamErr > 0 Then sauv = " ATTENTION : " & nbFamErr & " famille(s) non ecrite(s) (" & famErr & ")." & sauv
  End If
  Statut "OK", nbAjout & " ligne(s) ajoutee(s), " & nbMaj & " mise(s) a jour dans " & tTable & " (affaire GOAT " & affaire & " - " & numAffaire & ")." & sauv
End Sub

Principal
WScript.Quit 0
`;

export function genererGestionnaireGoat() {
  return GESTIONNAIRE_GOAT.replace(/\r?\n/g, "\r\n");
}
