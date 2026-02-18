!macro customHeader
  !system "chcp 65001 > nul"
!macroend

!macro customInit
  ; 杀掉旧的 ClawWin.exe 进程（失败也不影响安装继续）
  nsExec::ExecToLog 'taskkill /F /IM ClawWin.exe'
  ; 杀掉占用 39527 端口的 gateway 进程
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 39527 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $$_.OwningProcess -Force -ErrorAction SilentlyContinue }"'

  ; 检查 Windows 版本 >= 10
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "ClawWin 需要 Windows 10 或更高版本。"
    Quit
  ${EndIf}

  ; 检查磁盘空间 >= 2GB
  ${GetRoot} $INSTDIR $0
  ${DriveSpace} $0 "/D=F /S=M" $1
  ${If} $1 < 2048
    MessageBox MB_OK|MB_ICONSTOP "磁盘空间不足，至少需要 2GB 可用空间。$\n当前可用: $1 MB"
    Quit
  ${EndIf}
!macroend

!macro customInstall
  ; 创建桌面快捷方式
  CreateShortCut "$DESKTOP\ClawWin.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0

  ; 创建开始菜单快捷方式
  CreateDirectory "$SMPROGRAMS\ClawWin"
  CreateShortCut "$SMPROGRAMS\ClawWin\ClawWin.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\ClawWin\卸载 ClawWin.lnk" "$INSTDIR\Uninstall ${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\Uninstall ${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  ; 删除桌面快捷方式
  Delete "$DESKTOP\ClawWin.lnk"

  ; 删除开始菜单快捷方式
  Delete "$SMPROGRAMS\ClawWin\ClawWin.lnk"
  Delete "$SMPROGRAMS\ClawWin\卸载 ClawWin.lnk"
  RMDir "$SMPROGRAMS\ClawWin"
!macroend
