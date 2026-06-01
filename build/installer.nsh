; NSIS 自定义脚本：卸载时询问是否同时清除用户数据
; electron-builder 会把这段插入到生成的 NSIS installer 里

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "是否同时清除你和桌宠的所有记忆和日记？$\n$\n包含：长期记忆 / 日记 / 塔罗 / 图鉴 / 待办 / 纪念日 / 设置（含 API Key）。$\n$\n选「否」可保留这些数据，将来重装时桌宠会记得你。" \
      /SD IDNO IDNO skipDataCleanup
      ; APPDATA 目录在 NSIS 里就是 $APPDATA
      RMDir /r "$APPDATA\desktop-pet-live2d"
    skipDataCleanup:
  ${endIf}
!macroend
