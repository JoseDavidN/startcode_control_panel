//! Notificaciones del sistema en macOS con `UNUserNotificationCenter`.
//!
//! `tauri-plugin-notification` usa en macOS `NSUserNotificationCenter`
//! (obsoleta): nunca pide permiso, responde siempre «concedido» y el sistema
//! descarta la notificación sin avisar. Esta API es la actual: pide el
//! permiso con el diálogo del sistema y entrega la notificación.
//!
//! `UNUserNotificationCenter` solo funciona en la app empaquetada (.app con
//! identificador) y firmada: sin bundle (`tauri dev`) `currentNotificationCenter`
//! abortaría el proceso, y una app sin firmar recibe «Notifications are not
//! allowed for this application» al pedir permiso. En esos casos, y si el
//! sistema rechaza una notificación concreta, se entrega con `osascript`
//! (`display notification`), que funciona siempre. Si el usuario dijo «No
//! permitir», se respeta y no se usa el respaldo.

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread};
use objc2_foundation::{NSBundle, NSError, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationSettings,
    UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};

/// Lo que tarda como mucho el usuario en contestar al diálogo de permiso.
const PROMPT_TIMEOUT: Duration = Duration::from_secs(120);
const REPLY_TIMEOUT: Duration = Duration::from_secs(10);

define_class!(
    // SAFETY: NSObject no impone nada a sus subclases y no hay `Drop`.
    #[unsafe(super(NSObject))]
    #[name = "StartCodeNotificationDelegate"]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Delegate {
        /* Sin esto, macOS no enseña la notificación si la app está delante,
           que es justo cuando se pulsa «Probar». */
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }
    }
);

impl Delegate {
    fn new() -> Retained<Self> {
        let this = Self::alloc().set_ivars(());
        unsafe { msg_send![super(this), init] }
    }
}

/* El delegado del centro es una referencia débil: hay que mantenerlo vivo. */
static DELEGATE: OnceLock<Retained<Delegate>> = OnceLock::new();

/* El sistema no deja usar UNUserNotificationCenter a esta app (sin firma): todo va por osascript. */
static SCRIPT_ONLY: AtomicBool = AtomicBool::new(false);

/// Respaldo: `display notification` de AppleScript. Título y texto van como
/// argumentos del script (`argv`), nunca dentro del código: no hay que escapar nada.
fn notify_script(title: &str, body: &str) -> Result<(), String> {
    let out = Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "on run argv",
            "-e",
            "display notification (item 2 of argv) with title (item 1 of argv) sound name \"default\"",
            "-e",
            "end run",
            title,
            body,
        ])
        .output()
        .map_err(|e| format!("osascript no disponible: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn has_bundle() -> bool {
    NSBundle::mainBundle().bundleIdentifier().is_some()
}

fn center() -> Result<Retained<UNUserNotificationCenter>, String> {
    if !has_bundle() {
        return Err("La app no está empaquetada (sin identificador de bundle)".into());
    }
    Ok(UNUserNotificationCenter::currentNotificationCenter())
}

/// Se llama al arrancar: el delegado tiene que estar puesto antes de la primera notificación.
pub fn init() {
    let Ok(center) = center() else { return };
    let delegate = DELEGATE.get_or_init(Delegate::new);
    center.setDelegate(Some(ProtocolObject::from_ref(&**delegate)));
}

fn status(center: &UNUserNotificationCenter) -> Result<UNAuthorizationStatus, String> {
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |settings: std::ptr::NonNull<UNNotificationSettings>| {
        let settings = unsafe { settings.as_ref() };
        let _ = tx.send(settings.authorizationStatus());
    });
    center.getNotificationSettingsWithCompletionHandler(&block);
    rx.recv_timeout(REPLY_TIMEOUT).map_err(|_| "El sistema no respondió".to_string())
}

fn label(status: UNAuthorizationStatus) -> &'static str {
    if status == UNAuthorizationStatus::NotDetermined {
        "default"
    } else if status == UNAuthorizationStatus::Denied {
        "denied"
    } else {
        "granted"
    }
}

/// Estado del permiso: `granted`, `denied` o `default` (aún no se preguntó).
/// Con `request`, si no se preguntó todavía se muestra el diálogo del sistema.
/// Sin bundle o si el sistema no deja pedirlo, `granted`: se entrega con osascript.
fn permission(request: bool) -> Result<String, String> {
    if SCRIPT_ONLY.load(Ordering::Relaxed) {
        return Ok("granted".into());
    }
    let Ok(center) = center() else {
        SCRIPT_ONLY.store(true, Ordering::Relaxed);
        return Ok("granted".into());
    };
    let current = status(&center)?;
    if !request || current != UNAuthorizationStatus::NotDetermined {
        return Ok(label(current).into());
    }

    /* (concedido, el sistema devolvió un error: la app no puede pedir permiso). */
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        let _ = tx.send((granted.as_bool(), !error.is_null()));
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &block,
    );
    let (granted, failed) = rx
        .recv_timeout(PROMPT_TIMEOUT)
        .map_err(|_| "No hubo respuesta al permiso de notificaciones".to_string())?;
    if granted {
        return Ok("granted".into());
    }
    if failed {
        /* No fue el usuario: el sistema no deja a esta app (sin firmar) usar el centro. */
        SCRIPT_ONLY.store(true, Ordering::Relaxed);
        return Ok("granted".into());
    }
    Ok("denied".into())
}

/// Entrega una notificación: con el centro de notificaciones si se puede;
/// si no (sin bundle, sin firma, o el sistema la rechaza), con osascript.
/// Si el usuario denegó el permiso, no se notifica.
fn notify(title: &str, body: &str) -> Result<(), String> {
    match permission(true)?.as_str() {
        "denied" => return Err("Permiso de notificaciones denegado en Ajustes del Sistema".into()),
        _ if SCRIPT_ONLY.load(Ordering::Relaxed) => return notify_script(title, body),
        _ => {}
    }
    match notify_center(title, body) {
        Ok(()) => Ok(()),
        Err(center_error) => notify_script(title, body)
            .map_err(|script_error| format!("{center_error}; respaldo: {script_error}")),
    }
}

fn notify_center(title: &str, body: &str) -> Result<(), String> {
    let center = center()?;

    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    content.setBody(&NSString::from_str(body));
    content.setSound(Some(&UNNotificationSound::defaultSound()));

    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&format!("startcode-{nanos}")),
        &content,
        None,
    );

    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |error: *mut NSError| {
        let message = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
        let _ = tx.send(message);
    });
    center.addNotificationRequest_withCompletionHandler(&request, Some(&block));
    match rx.recv_timeout(REPLY_TIMEOUT) {
        Ok(None) => Ok(()),
        Ok(Some(message)) => Err(message),
        Err(_) => Err("El sistema no respondió".into()),
    }
}

/* Comandos asíncronos con el trabajo en un hilo aparte: un comando síncrono
   corre en el hilo principal y lo bloquearía mientras el diálogo está abierto. */

#[tauri::command]
pub async fn macos_notification_permission(request: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || permission(request))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn macos_notify(title: String, body: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || notify(&title, &body))
        .await
        .map_err(|e| e.to_string())?
}
