' Starts Asset Prompter without a console window and opens it in the browser.
' Clicking again while it runs (or while it is still starting) only opens the browser.
Option Explicit

Const URL = "http://127.0.0.1:4777"
Dim shell, fso, here, lock, i

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' This file lives in scripts\; the app folder (lock, log, packages) is one level up.
here = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
lock = here & "\.starting"

Function IsUp()
  Dim http
  IsUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 1000, 1000
  http.Open "GET", URL & "/api/state", False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then IsUp = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

' A start begun by another click in the last 30 seconds is still coming up: wait for it instead.
Function StartingElsewhere()
  StartingElsewhere = False
  If fso.FileExists(lock) Then
    If DateDiff("s", fso.GetFile(lock).DateLastModified, Now) < 30 Then StartingElsewhere = True
  End If
End Function

If Not IsUp() Then
  If Not StartingElsewhere() Then
    fso.CreateTextFile(lock, True).Close
    shell.CurrentDirectory = here
    If Not fso.FolderExists(here & "\node_modules") Then shell.Run "cmd /c bun install", 0, True
    ' This script opens the browser itself, once, when the server answers.
    shell.Environment("PROCESS")("NO_OPEN") = "1"
    shell.Run "cmd /c bun start > server.log 2>&1", 0, False
  End If
  For i = 1 To 60
    If IsUp() Then Exit For
    WScript.Sleep 500
  Next
  If fso.FileExists(lock) Then fso.DeleteFile lock
End If

If IsUp() Then
  shell.Run URL
Else
  MsgBox "Asset Prompter did not start. See server.log in " & here, vbExclamation, "Asset Prompter"
End If
