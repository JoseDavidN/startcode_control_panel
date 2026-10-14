//! Notificaciones del sistema en macOS con `UNUserNotificationCenter`, la API
//! actual: pide el permiso con el diálogo del sistema y la app aparece con su
//! nombre en Ajustes del Sistema → Notificaciones.
//!
//! Solo se puede usar en la app empaquetada (.app con `CFBundleIdentifier`).
//! Con `tauri dev` el binario no es un bundle y no hay identificador (Tauri
//! solo incrusta nombre y versión en el Info.plist de desarrollo):
//! `currentNotificationCenter` abortaría el proceso. Tampoco se puede si el
//! sistema no deja a la app pedir permiso (error al pedirlo, típico de una
//! app sin firmar). En esos casos los comandos devuelven un error que empieza
//! por `UNAVAILABLE:` y el frontend usa `tauri-plugin-notification`, la vía
//! oficial de Tauri: en desarrollo publica como `com.apple.Terminal` (llega si
//! Terminal tiene las notificaciones permitidas) y en la app, con su
//! identificador.

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

/* El sistema no dejó a esta app pedir permiso: no se vuelve a intentar en esta ejecución. */
static UNAVAILABLE: AtomicBool = AtomicBool::new(false);

fn has_bundle() -> bool {
    NSBundle::mainBundle().bundleIdentifier().is_some()
}

fn center() -> Result<Retained<UNUserNotificationCenter>, String> {
    if !has_bundle() {
        return Err("UNAVAILABLE:la app no está empaquetada (desarrollo, sin identificador de bundle)".into());
    }
    if UNAVAILABLE.load(Ordering::Relaxed) {
        return Err("UNAVAILABLE:el sistema no deja a esta app usar el centro de notificaciones".into());
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
fn permission(request: bool) -> Result<String, String> {
    let center = center()?;
    let current = status(&center)?;
    if !request || current != UNAuthorizationStatus::NotDetermined {
        return Ok(label(current).into());
    }

    /* (concedido, error del sistema al pedirlo). */
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        let message = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
        let _ = tx.send((granted.as_bool(), message));
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &block,
    );
    let (granted, error) = rx
        .recv_timeout(PROMPT_TIMEOUT)
        .map_err(|_| "No hubo respuesta al permiso de notificaciones".to_string())?;
    if let Some(message) = error {
        /* No fue el usuario: el sistema no deja a esta app pedir permiso. */
        UNAVAILABLE.store(true, Ordering::Relaxed);
        return Err(format!("UNAVAILABLE:{message}"));
    }
    Ok(if granted { "granted" } else { "denied" }.into())
}

/// Entrega la notificación si el permiso está concedido (y lo pide si aún no se preguntó).
fn notify(title: &str, body: &str) -> Result<(), String> {
    match permission(true)?.as_str() {
        "granted" => notify_center(title, body),
        _ => Err("Permiso de notificaciones denegado en Ajustes del Sistema → Notificaciones".into()),
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
