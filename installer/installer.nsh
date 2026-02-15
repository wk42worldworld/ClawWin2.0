!macro customHeader
  !system "chcp 65001 > nul"
!macroend

!macro customInit
  ; 检查 Windows 版本 >= 10
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "OpenClaw 中文版需要 Windows 10 或更高版本。"
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
  CreateShortCut "$DESKTOP\OpenClaw 中文版.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0

  ; 创建开始菜单快捷方式
  CreateDirectory "$SMPROGRAMS\OpenClaw 中文版"
  CreateShortCut "$SMPROGRAMS\OpenClaw 中文版\OpenClaw 中文版.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\OpenClaw 中文版\卸载 OpenClaw 中文版.lnk" "$INSTDIR\Uninstall ${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\Uninstall ${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  ; 删除桌面快捷方式
  Delete "$DESKTOP\OpenClaw 中文版.lnk"

  ; 删除开始菜单快捷方式
  Delete "$SMPROGRAMS\OpenClaw 中文版\OpenClaw 中文版.lnk"
  Delete "$SMPROGRAMS\OpenClaw 中文版\卸载 OpenClaw 中文版.lnk"
  RMDir "$SMPROGRAMS\OpenClaw 中文版"
!macroend
