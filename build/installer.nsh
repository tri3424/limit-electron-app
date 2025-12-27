!include "MUI2.nsh"

!define MUI_COMPONENTSPAGE_SMALLDESC
!define MUI_BRANDINGTEXT "Limit: Tends To Infinity"
!define MUI_WELCOMEPAGE_TITLE "Welcome to the Limit Installer"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Limit, your offline-first exam and practice companion.\r\n\r\nIt is recommended that you close all other applications before continuing."

!define MUI_FINISHPAGE_TITLE "Limit is ready to launch"
!define MUI_FINISHPAGE_TEXT "You're all set to continue your focused study sessions with Limit.\r\n\r\nClick Finish to close this wizard."

!macro customInstall
  Delete "$DESKTOP\\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\\$START_MENU_FOLDER\\${PRODUCT_FILENAME}.lnk"

  CreateDirectory "$SMPROGRAMS\\$START_MENU_FOLDER"

  CreateShortCut "$SMPROGRAMS\\$START_MENU_FOLDER\\${PRODUCT_FILENAME}.lnk" "$INSTDIR\\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\\${PRODUCT_FILENAME}.exe" 0
  CreateShortCut "$DESKTOP\\${PRODUCT_FILENAME}.lnk" "$INSTDIR\\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\\${PRODUCT_FILENAME}.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\\$START_MENU_FOLDER\\${PRODUCT_FILENAME}.lnk"
!macroend

