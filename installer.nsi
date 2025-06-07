; installer.nsi
; Script for i2v dashboard

;--------------------------------
; Defines
!define APPNAME "i2v dashboard"
!define COMPANYNAME "I2V PVT limited"
!define EXENAME "SoftwareDashboardApp.exe"
!define SERVICENAME "i2v dashboard"
!define DESCRIPTION "I2V Dashboard Application Service."
!define VERSION "1.0"
!define INSTALLER_OUTPUT_FILENAME "i2vdashboard_installer.exe"
!define MAIN_APP_EXE "$INSTDIR\${EXENAME}"
!define NSSM_EXE "$INSTDIR\nssm.exe"

; MUI 2.0 modern interface
!include "MUI2.nsh"
!include "LogicLib.nsh"

; Installer Attributes
Name "${APPNAME} ${VERSION}"
OutFile "${INSTALLER_OUTPUT_FILENAME}"
InstallDir "$PROGRAMFILES\i2vdashboard"
InstallDirRegKey HKLM "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel admin

; Icons
!define MUI_ICON "dashboard.ico"
!define MUI_UNICON "dashboard.ico"

;--------------------------------
; Interface Settings
!define MUI_ABORTWARNING

;--------------------------------
; Pages
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

;--------------------------------
; Languages
!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Version Information
VIProductVersion "1.0.0.1"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${COMPANYNAME}"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2024 ${COMPANYNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Installer"
VIAddVersionKey "FileVersion" "${VERSION}"

;--------------------------------
; Installer Sections

Section "Application" SEC_APP
  SetOutPath $INSTDIR

  ; Copy files from dist
  File /r "dist\*.*"

  ; Copy icon
  File "dashboard.ico"

  ; Write registry
  WriteRegStr HKLM "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$INSTDIR\dashboard.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANYNAME}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoRepair" 1

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Service" SEC_SERVICE
  nsExec::ExecToLog '"$SYSDIR\sc.exe" stop "${SERVICENAME}"'
  Sleep 2000

  nsExec::ExecToLog '"$INSTDIR\nssm.exe" stop "${SERVICENAME}"'
  Sleep 1000
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" remove "${SERVICENAME}" confirm'
  Sleep 1000

  nsExec::ExecToLog '"$INSTDIR\nssm.exe" install "${SERVICENAME}" "$INSTDIR\${EXENAME}"'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_OK|MB_ICONSTOP "Failed to install the '${SERVICENAME}' service. Rolling back."
    Call ServiceInstallationRollback
    SetAutoClose false
    Abort
  ${EndIf}

  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICENAME}" DisplayName "${SERVICENAME}"'
  Pop $1
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICENAME}" Description "${DESCRIPTION}"'
  Pop $2
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICENAME}" Start SERVICE_AUTO_START'
  Pop $3

  ${If} $1 != "0"
  ${OrIf} $2 != "0"
  ${OrIf} $3 != "0"
    MessageBox MB_OK|MB_ICONSTOP "Failed to configure service. Rolling back."
    Call ServiceInstallationRollback
    SetAutoClose false
    Abort
  ${EndIf}

  nsExec::ExecToLog '"$SYSDIR\sc.exe" start "${SERVICENAME}"'
  Pop $4
  ${If} $4 != "0"
    MessageBox MB_YESNO|MB_ICONQUESTION "Service installed but failed to start. Continue?" IDYES ServiceInstallationComplete
    Call ServiceInstallationRollback
    SetAutoClose false
    Abort
  ${EndIf}

  ServiceInstallationComplete:
    DetailPrint "Service installed successfully."
SectionEnd

Section "Start Menu Shortcuts" SEC_SHORTCUTS
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "${MAIN_APP_EXE}" "" "$INSTDIR\dashboard.ico"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\dashboard.ico"
SectionEnd

;--------------------------------
; Rollback Function
Function ServiceInstallationRollback
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" stop "${SERVICENAME}"'
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" remove "${SERVICENAME}" confirm'
  nsExec::ExecToLog '"$SYSDIR\sc.exe" delete "${SERVICENAME}"'

  Delete "$INSTDIR\${EXENAME}"
  Delete "$INSTDIR\nssm.exe"
  Delete "$INSTDIR\uninstall.exe"
  Delete "$INSTDIR\dashboard.ico"
  RMDir /r "$INSTDIR"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKLM "Software\${APPNAME}"

  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
FunctionEnd

;--------------------------------
; Descriptions
LangString DESC_SEC_APP ${LANG_ENGLISH} "Main application files."
LangString DESC_SEC_SERVICE ${LANG_ENGLISH} "Install application as a Windows service."
LangString DESC_SEC_SHORTCUTS ${LANG_ENGLISH} "Create Start Menu shortcuts."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_APP} $(DESC_SEC_APP)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_SERVICE} $(DESC_SEC_SERVICE)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_SHORTCUTS} $(DESC_SEC_SHORTCUTS)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

;--------------------------------
; Uninstall
Section "Uninstall"
  SetOutPath $INSTDIR

  nsExec::ExecToLog '"$SYSDIR\sc.exe" stop "${SERVICENAME}"'
  Sleep 2000
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" stop "${SERVICENAME}"'
  Sleep 1000
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" remove "${SERVICENAME}" confirm'
  nsExec::ExecToLog '"$SYSDIR\sc.exe" delete "${SERVICENAME}"'

  Delete "$INSTDIR\${EXENAME}"
  Delete "$INSTDIR\nssm.exe"
  Delete "$INSTDIR\uninstall.exe"
  Delete "$INSTDIR\dashboard.ico"
  Delete "$INSTDIR\license.txt"
  RMDir /r "$INSTDIR"

  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKLM "Software\${APPNAME}"
SectionEnd
