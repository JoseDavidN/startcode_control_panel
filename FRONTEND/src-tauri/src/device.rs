//! Nombre del equipo, para el aviso de seguridad de cada inicio de sesión
//! («Nuevo inicio de sesión: MacBook de Ana · StartCode Panel en macOS»).
//! Solo con la biblioteca estándar: sin dependencias por plataforma.

fn clean(name: &str) -> Option<String> {
    let name = name.trim();
    (!name.is_empty()).then(|| name.chars().take(64).collect())
}

/* En Windows no se abre ningún proceso: no hace falta. */
#[cfg(not(target_os = "windows"))]
fn output(program: &str, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new(program).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    clean(&String::from_utf8_lossy(&out.stdout))
}

/* macOS: el nombre que se ve en Ajustes → General → Compartir («MacBook de Ana»). */
#[cfg(target_os = "macos")]
fn name() -> Option<String> {
    output("/usr/sbin/scutil", &["--get", "ComputerName"]).or_else(|| output("/bin/hostname", &[]))
}

/* Windows: el nombre del equipo, sin abrir ningún proceso (ni ventana de consola). */
#[cfg(target_os = "windows")]
fn name() -> Option<String> {
    std::env::var("COMPUTERNAME").ok().and_then(|n| clean(&n))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn name() -> Option<String> {
    std::fs::read_to_string("/etc/hostname")
        .ok()
        .and_then(|n| clean(&n))
        .or_else(|| output("hostname", &[]))
}

#[tauri::command]
pub async fn device_name() -> Option<String> {
    tauri::async_runtime::spawn_blocking(name).await.ok().flatten()
}
