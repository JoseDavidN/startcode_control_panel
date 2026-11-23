cmake_minimum_required(VERSION 3.21)

project(StartCodePanel VERSION 1.0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.9 REQUIRED COMPONENTS Core Gui Network Qml Quick QuickControls2 WebSockets DBus)

qt_standard_project_setup(REQUIRES 6.9)

# URL base del API REST (sin barra final). Equivale al VITE_API_URL del
# frontend web; en ejecución la sustituye la variable STARTCODE_API_URL.
set(STARTCODE_API_URL "http://localhost:3001/api/v1" CACHE STRING "URL base del API REST")

qt_add_executable(startcode-panel
    src/main.cpp
)

set_source_files_properties(qml/theme/Theme.qml qml/theme/Format.qml qml/components/Toasts.qml
    qml/components/Sudo.qml qml/app/AppNav.qml qml/app/NotificationState.qml qml/assistant/AssistantBridge.qml qml/servers/ServiceLogos.qml qml/servers/TerminalSessions.qml
    PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

# El precompilador de QML genera C++ inválido para este archivo (fallo de la
# herramienta con una de sus cadenas): se carga interpretado, sin más efecto.
set_source_files_properties(
    qml/databases/redis/RedisBrowser.qml
    qml/databases/redis/RedisValuePanel.qml
    PROPERTIES QT_QML_SKIP_CACHEGEN TRUE)

qt_add_qml_module(startcode-panel
    URI StartCode
    VERSION 1.0
    SOURCES
        src/core/ApiClient.h src/core/ApiClient.cpp
        src/core/SessionStore.h src/core/SessionStore.cpp
        src/core/AuthController.h src/core/AuthController.cpp
        src/core/SocketIoClient.h src/core/SocketIoClient.cpp
        src/core/Realtime.h src/core/Realtime.cpp
        src/core/AppBridge.h src/core/AppBridge.cpp
        src/core/Transfers.h src/core/Transfers.cpp
        src/db/SqlHighlighter.h src/db/SqlHighlighter.cpp
        src/db/ResultModel.h src/db/ResultModel.cpp
        src/db/TableExporter.h src/db/TableExporter.cpp
        src/terminal/TerminalView.h src/terminal/TerminalView.cpp
    QML_FILES
        qml/Main.qml
        qml/theme/Theme.qml
        qml/theme/Format.qml
        qml/components/AppBackground.qml
        qml/components/Glass.qml
        qml/components/BrandFill.qml
        qml/components/Elevation.qml
        qml/components/Icon.qml
        qml/components/Label.qml
        qml/components/PrimaryButton.qml
        qml/components/SecondaryButton.qml
        qml/components/GhostButton.qml
        qml/components/GlassField.qml
        qml/components/CheckBox.qml
        qml/components/Spinner.qml
        qml/components/Badge.qml
        qml/components/MetricBar.qml
        qml/components/Modal.qml
        qml/components/IconButton.qml
        qml/components/HoverTip.qml
        qml/components/Select.qml
        qml/components/Toggle.qml
        qml/components/GlassArea.qml
        qml/components/DangerButton.qml
        qml/components/Sudo.qml
        qml/components/ScrollArea.qml
        qml/components/FloatMenu.qml
        qml/components/Toasts.qml
        qml/components/ToastHost.qml
        qml/layout/TitleBar.qml
        qml/layout/AppLayout.qml
        qml/layout/Sidebar.qml
        qml/layout/NavRow.qml
        qml/pages/Login.qml
        qml/login/LoginBrandHeader.qml
        qml/login/LoginCodeBoxes.qml
        qml/login/LoginField.qml
        qml/login/LoginGlow.qml
        qml/login/LoginGradientText.qml
        qml/login/LoginMessage.qml
        qml/login/LoginShowcase.qml
        qml/login/LoginSubmitButton.qml
        qml/dashboard/Dashboard.qml
        qml/dashboard/DashboardCard.qml
        qml/dashboard/DashboardChart.qml
        qml/dashboard/DashboardEmpty.qml
        qml/dashboard/DashboardKpi.qml
        qml/dashboard/DashboardServerRow.qml
        qml/app/AppNav.qml
        qml/app/NotificationState.qml
        qml/app/NotificationWatcher.qml
        qml/notifications/Notifications.qml
        qml/notifications/NotificationRow.qml
        qml/notifications/NotificationClearModal.qml
        qml/pages/Servers.qml
        qml/pages/ServerDetail.qml
        qml/assistant/AssistantAction.qml
        qml/assistant/AssistantActions.qml
        qml/assistant/AssistantBridge.qml
        qml/assistant/AssistantCodeBlock.qml
        qml/assistant/AssistantLauncher.qml
        qml/assistant/AssistantMessage.qml
        qml/assistant/AssistantPanel.qml
        qml/settings/InactivityWatcher.qml
        qml/settings/ReleaseNotes.qml
        qml/settings/Settings.qml
        qml/settings/SettingsAppearancePane.qml
        qml/settings/SettingsAssistantPane.qml
        qml/settings/SettingsFeedback.qml
        qml/settings/SettingsField.qml
        qml/settings/SettingsGroup.qml
        qml/settings/SettingsMonitoringPane.qml
        qml/settings/SettingsNotifRow.qml
        qml/settings/SettingsNotificationsPane.qml
        qml/settings/SettingsProfilePane.qml
        qml/settings/SettingsReqItem.qml
        qml/settings/SettingsSaveBar.qml
        qml/settings/SettingsSectionTitle.qml
        qml/settings/SettingsSecurityCard.qml
        qml/settings/SettingsSecurityCodeField.qml
        qml/settings/SettingsSecurityPane.qml
        qml/settings/SettingsSecuritySessions.qml
        qml/settings/SettingsSecurityTwoFactor.qml
        qml/settings/SettingsStrengthBar.qml
        qml/settings/SettingsSystemButton.qml
        qml/settings/SettingsSystemPane.qml
        qml/settings/SettingsSystemUpdater.qml
        qml/components/RangeSlider.qml
        qml/databases/ConnectionDatabasePicker.qml
        qml/databases/ConnectionModal.qml
        qml/databases/DatabaseDetail.qml
        qml/databases/DatabasePicker.qml
        qml/databases/DatabaseSavedQueries.qml
        qml/databases/DatabaseSqlStatements.qml
        qml/databases/Databases.qml
        qml/databases/EngineBadge.qml
        qml/databases/EngineIcon.qml
        qml/databases/QueryAuditModal.qml
        qml/databases/SaveQueryModal.qml
        qml/databases/SavedQueriesModal.qml
        qml/databases/SchemaTree.qml
        qml/databases/SchemaTreeSearch.qml
        qml/databases/SqlCompletion.qml
        qml/databases/SqlEditor.qml
        qml/databases/SqlEditorStore.qml
        qml/databases/SqlQueryStore.qml
        qml/databases/redis/RedisBrowser.qml
        qml/databases/redis/RedisConsole.qml
        qml/databases/redis/RedisField.qml
        qml/databases/redis/RedisNewKeyModal.qml
        qml/databases/redis/RedisSmallButton.qml
        qml/databases/redis/RedisTypeBadge.qml
        qml/databases/redis/RedisUtil.qml
        qml/databases/redis/RedisValuePanel.qml
        qml/databases/QueryResults.qml
        qml/databases/ResultGrid.qml
        qml/databases/DeleteRowsModal.qml
        qml/databases/ExportMenu.qml
        qml/servers/AddServerModal.qml
        qml/servers/EditServerModal.qml
        qml/servers/DeleteServerModal.qml
        qml/servers/HostKeyMismatchModal.qml
        qml/servers/HostKeyBlock.qml
        qml/servers/ConnectionLoading.qml
        qml/servers/ServerForms.qml
        qml/servers/ServerField.qml
        qml/servers/ServerNotice.qml
        qml/servers/ServerErrorDetail.qml
        qml/servers/AgentCard.qml
        qml/servers/AgentInstallModal.qml
        qml/servers/AgentUninstallModal.qml
        qml/servers/AgentTokenModal.qml
        qml/servers/ServicesTab.qml
        qml/servers/ServiceCard.qml
        qml/servers/ServiceActionModal.qml
        qml/servers/ServiceLogsModal.qml
        qml/servers/ProcessKillModal.qml
        qml/servers/CommandsTab.qml
        qml/servers/CommandBar.qml
        qml/servers/DockerTab.qml
        qml/servers/KubernetesTab.qml
        qml/servers/InstallServiceModal.qml
        qml/servers/ServiceLogos.qml
        qml/servers/ServiceLogo.qml
        qml/servers/sftp/SftpChip.qml
        qml/servers/sftp/SftpDownloadQueue.qml
        qml/servers/sftp/SftpDownloads.qml
        qml/servers/sftp/SftpDropZone.qml
        qml/servers/sftp/SftpFileList.qml
        qml/servers/sftp/SftpIcon.qml
        qml/servers/sftp/SftpModal.qml
        qml/servers/sftp/SftpPathBar.qml
        qml/servers/sftp/SftpPreview.qml
        qml/servers/sftp/SftpScrollBar.qml
        qml/servers/sftp/SftpSession.qml
        qml/servers/sftp/SftpUploadQueue.qml
        qml/servers/sftp/SftpUploads.qml
        qml/servers/TerminalSessions.qml
        qml/servers/TerminalDock.qml
        qml/servers/TerminalSession.qml
    RESOURCES
        assets/fonts/SpaceGrotesk.ttf
        assets/fonts/JetBrainsMono.ttf
        assets/fonts/Nunito.ttf
        assets/fonts/SymbolsNerdFontMono-Regular.ttf
        assets/img/icono-oscuro-180.png
        assets/img/icono-oscuro-512.png
        assets/icons/app-512.png
        assets/img/logo-fondo-oscuro-1200.png
        assets/img/logo-fondo-claro-1200.png
        assets/release/versions.json
        assets/service-logos/fail2ban.png
        assets/service-logos/restic.png
)

target_include_directories(startcode-panel PRIVATE src src/terminal src/db)

# Emulación de terminal (pantalla, secuencias de escape, teclado): libvterm.
find_package(PkgConfig REQUIRED)
pkg_check_modules(VTERM REQUIRED IMPORTED_TARGET vterm)
target_link_libraries(startcode-panel PRIVATE PkgConfig::VTERM)

# Conductor de pruebas (guiones de clics y capturas): solo en depuración.
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    find_package(Qt6 REQUIRED COMPONENTS Test)
    target_sources(startcode-panel PRIVATE src/debug/DebugDriver.h src/debug/DebugDriver.cpp)
    target_link_libraries(startcode-panel PRIVATE Qt6::Test)
    target_compile_definitions(startcode-panel PRIVATE STARTCODE_DEBUG_DRIVER)
endif()

target_compile_definitions(startcode-panel PRIVATE
    STARTCODE_VERSION="${PROJECT_VERSION}"
    STARTCODE_API_URL="${STARTCODE_API_URL}"
)

target_link_libraries(startcode-panel PRIVATE
    Qt6::Core Qt6::Gui Qt6::Network Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::WebSockets Qt6::DBus
)

set_target_properties(startcode-panel PROPERTIES
    WIN32_EXECUTABLE TRUE
    MACOSX_BUNDLE TRUE
)

# macOS: datos del paquete (packaging/macos/Info.plist.in)
set_target_properties(startcode-panel PROPERTIES
    MACOSX_BUNDLE_BUNDLE_NAME "StartCode Panel"
    MACOSX_BUNDLE_GUI_IDENTIFIER "com.startcode.panel"
    MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION}
    MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION}
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/packaging/macos/Info.plist.in"
    MACOSX_BUNDLE_ICON_FILE "app.icns"
)
if(APPLE)
    target_sources(startcode-panel PRIVATE assets/icons/app.icns)
    set_source_files_properties(assets/icons/app.icns PROPERTIES MACOSX_PACKAGE_LOCATION Resources)
endif()

# Windows: icono del ejecutable y datos de la versión (el nombre «StartCode
# Panel» en el Administrador de tareas y las notificaciones).
if(WIN32)
    set(STARTCODE_ICONO "${CMAKE_CURRENT_SOURCE_DIR}/assets/icons/app.ico")
    configure_file(packaging/windows/startcode-panel.rc.in startcode-panel.rc @ONLY)
    target_sources(startcode-panel PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/startcode-panel.rc")
endif()

# ── Instalación en Linux ────────────────────────────────────────────────
# El nombre del .desktop coincide con el identificador de la ventana
# (app_id en Wayland), que es como el compositor y el panel encuentran el
# icono y aplican sus reglas de ventana.
if(UNIX AND NOT APPLE)
    include(GNUInstallDirs)
    install(TARGETS startcode-panel RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
    install(FILES packaging/linux/com.startcode.panel.desktop
        DESTINATION ${CMAKE_INSTALL_DATADIR}/applications)
    install(FILES assets/icons/app-512.png
        DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/512x512/apps
        RENAME com.startcode.panel.png)
endif()
