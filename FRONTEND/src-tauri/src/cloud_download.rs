//! Descargas de StartCode Cloud a disco, fuera del hilo de la interfaz.
//!
//! Antes la descarga corría en el webview: cada bloque pasaba por el IPC del
//! plugin `fs` y, con archivos grandes, la ventana se congelaba (ni navegar
//! ni cancelar). Aquí la hace Rust en una tarea aparte: lee la respuesta por
//! partes, escribe con un búfer de 1 MB y solo avisa a la interfaz del
//! progreso, como mucho cada 150 ms, por un `Channel`.
//!
//! Cancelar (`cloud_download_cancel`) despierta un `Notify` que corta la
//! tarea al momento, aunque el servidor no esté enviando nada. Si se cancela
//! o falla, se borra el archivo a medias.
//!
//! Errores para el frontend: `CANCELLED`, `UNREACHABLE:<detalle>`,
//! `HTTP:<estado>:<cuerpo>`, `INTERRUPTED:<detalle>` y `FILE:<detalle>`.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::Channel;
use tokio::sync::Notify;

const REPORT_EVERY: Duration = Duration::from_millis(150);
const WRITE_BUFFER: usize = 1 << 20;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    loaded: u64,
    /// `None` si la nube no manda el tamaño (una carpeta se comprime mientras se envía).
    total: Option<u64>,
}

/* Descargas en curso: id → con qué cancelarla. */
fn running() -> &'static Mutex<HashMap<String, Arc<Notify>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Arc<Notify>>>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}

async fn run(url: &str, token: &str, dest: &str, progress: &Channel<DownloadProgress>) -> Result<u64, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("UNREACHABLE:{e}"))?;
    let mut res = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("UNREACHABLE:{e}"))?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP:{}:{}", status.as_u16(), body));
    }

    let total = res.content_length();
    let mut file = BufWriter::with_capacity(
        WRITE_BUFFER,
        File::create(dest).map_err(|e| format!("FILE:{e}"))?,
    );
    let mut loaded: u64 = 0;
    let mut last = Instant::now();
    let _ = progress.send(DownloadProgress { loaded, total });

    while let Some(chunk) = res.chunk().await.map_err(|e| format!("INTERRUPTED:{e}"))? {
        file.write_all(&chunk).map_err(|e| format!("FILE:{e}"))?;
        loaded += chunk.len() as u64;
        if last.elapsed() >= REPORT_EVERY {
            last = Instant::now();
            let _ = progress.send(DownloadProgress { loaded, total });
        }
    }
    file.flush().map_err(|e| format!("FILE:{e}"))?;
    let _ = progress.send(DownloadProgress { loaded, total: total.or(Some(loaded)) });
    Ok(loaded)
}

/// Descarga `url` (con el token de la nube) a `dest`, la ruta elegida en el
/// diálogo de guardar. Devuelve los bytes escritos.
#[tauri::command]
pub async fn cloud_download(
    id: String,
    url: String,
    token: String,
    dest: String,
    on_progress: Channel<DownloadProgress>,
) -> Result<u64, String> {
    let cancel = Arc::new(Notify::new());
    running().lock().map_err(|e| e.to_string())?.insert(id.clone(), cancel.clone());

    /* Al cancelar se suelta la descarga entera: la respuesta y el archivo se cierran aquí. */
    let result = tokio::select! {
        r = run(&url, &token, &dest, &on_progress) => r,
        _ = cancel.notified() => Err("CANCELLED".to_string()),
    };

    if let Ok(mut map) = running().lock() {
        map.remove(&id);
    }
    if result.is_err() {
        let _ = std::fs::remove_file(&dest);
    }
    result
}

/// Cancela una descarga en curso; no hace nada si ya terminó.
#[tauri::command]
pub fn cloud_download_cancel(id: String) {
    if let Some(cancel) = running().lock().ok().and_then(|map| map.get(&id).cloned()) {
        /* `notify_one` deja el aviso guardado aunque la tarea aún no esté esperando. */
        cancel.notify_one();
    }
}
