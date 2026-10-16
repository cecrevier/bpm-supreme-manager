Unicode True
!include "MUI2.nsh"

Name "BPM Supreme Manager"
OutFile "../../../outputs/BPM-Supreme-Manager-Windows-x64-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\BPM Supreme Manager"
InstallDirRegKey HKCU "Software\BPM Supreme Manager" "InstallDir"
RequestExecutionLevel user

!define MUI_ABORTWARNING
!define MUI_ICON "../dist/.icon-ico/icon.ico"
!define MUI_UNICON "../dist/.icon-ico/icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Spanish"

Section "BPM Supreme Manager" MainSection
  SetOutPath "$INSTDIR"
  File /r "../dist/win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\BPM Supreme Manager" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BPM Supreme Manager" "DisplayName" "BPM Supreme Manager"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BPM Supreme Manager" "DisplayIcon" "$INSTDIR\BPM Supreme Manager.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BPM Supreme Manager" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BPM Supreme Manager" "DisplayVersion" "1.0.0"
  CreateDirectory "$SMPROGRAMS\BPM Supreme Manager"
  CreateShortcut "$SMPROGRAMS\BPM Supreme Manager\BPM Supreme Manager.lnk" "$INSTDIR\BPM Supreme Manager.exe"
  CreateShortcut "$DESKTOP\BPM Supreme Manager.lnk" "$INSTDIR\BPM Supreme Manager.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\BPM Supreme Manager.lnk"
  Delete "$SMPROGRAMS\BPM Supreme Manager\BPM Supreme Manager.lnk"
  RMDir "$SMPROGRAMS\BPM Supreme Manager"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BPM Supreme Manager"
  DeleteRegKey HKCU "Software\BPM Supreme Manager"
  RMDir /r "$INSTDIR"
SectionEnd
