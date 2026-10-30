; Let TVs on the local network reach the app (HTTP/WebSocket + UDP discovery).
; Limited to the local subnet so nothing is opened to the internet.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Ayva"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Ayva" dir=in action=allow program="$INSTDIR\Ayva.exe" enable=yes profile=any remoteip=localsubnet'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Ayva"'
!macroend
