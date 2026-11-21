use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::paths::app_data_dir;
use crate::plugin_package::safe_entry_path;
use crate::profiles::profile_data_dir_for_id;

/// Empacota `projects.json` + `scrollback/` num zip salvo em `target_path`.

///
/// `async` + `spawn_blocking`: I/O de disco real (zip de todo o scrollback),

#[tauri::command]
pub async fn export_backup(app: AppHandle, target_path: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    tokio::task::spawn_blocking(move || export_backup_from_dir(dir, target_path))
        .await
        .map_err(|error| format!("export_backup: falha na task bloqueante: {error}"))?
}

#[tauri::command]
pub async fn export_profile_backup(
    app: AppHandle,
    profile_id: String,
    target_path: String,
) -> Result<(), String> {
    let dir = profile_data_dir_for_id(&app, &profile_id)?;
    tokio::task::spawn_blocking(move || export_backup_from_dir(dir, target_path))
        .await
        .map_err(|error| format!("export_profile_backup: falha na task bloqueante: {error}"))?
}

fn export_backup_from_dir(dir: PathBuf, target_path: String) -> Result<(), String> {
    let target = PathBuf::from(target_path);
    let source_root = dir.canonicalize().map_err(|e| e.to_string())?;
    let target_parent = target
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if target_parent.starts_with(&source_root) {
        return Err("backup_inside_profile".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = fs::File::create(&target).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let opts = FileOptions::default().compression_method(CompressionMethod::Deflated);

    // preferences, tokens, scrollback, and any future file) is left behind.
    // Only debug logs and temporary atomic-save artifacts are skipped.
    add_dir_to_zip(&mut zip, &source_root, &source_root, opts)?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn is_runtime_backup_path(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root)
        .ok()
        .and_then(|relative| relative.components().next())
        .and_then(|component| component.as_os_str().to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("EBWebView"))
}

fn is_runtime_archive_entry(name: &str) -> bool {
    name.split(['/', '\\'])
        .next()
        .is_some_and(|component| component.eq_ignore_ascii_case("EBWebView"))
}

fn is_excluded_from_backup(root: &Path, path: &Path) -> bool {
    if is_runtime_backup_path(root, path) {
        return true;
    }
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("tmp") | Some("log")
    )
}

fn add_dir_to_zip<W: Write + io::Seek>(
    zip: &mut ZipWriter<W>,
    root: &Path,
    dir: &Path,
    opts: FileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if is_excluded_from_backup(root, &path) {
            continue;
        }
        if file_type.is_dir() {
            add_dir_to_zip(zip, root, &path, opts)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
        let name = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Replace local state with the contents of `source_path`. Remove existing
/// scrollback first so deleted PTY data is not retained.

///

#[tauri::command]
pub async fn import_backup(app: AppHandle, source_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || import_backup_inner(app, source_path))
        .await
        .map_err(|error| format!("import_backup: falha na task bloqueante: {error}"))?
}

fn import_backup_inner(app: AppHandle, source_path: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    import_backup_from_dir(&dir, Path::new(&source_path))
}

fn import_backup_from_dir(dir: &Path, source_path: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let file = fs::File::open(source_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    // Validate every selected path before replacing any existing profile state.
    let mut relative_paths = Vec::with_capacity(archive.len());
    let mut has_projects = false;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let relative = safe_entry_path(entry.name())
            .map_err(|error| format!("invalid_archive_path:{error}"))?;
        if is_runtime_archive_entry(&relative.to_string_lossy()) {
            relative_paths.push(None);
            continue;
        }
        if relative == Path::new("projects.json") && !entry.is_dir() {
            has_projects = true;
        }
        relative_paths.push(Some(relative));
    }
    if !has_projects {
        return Err("backup_missing_projects".to_string());
    }

    // Remove state that must not survive when it is absent from the backup.
    let scrollback = dir.join("scrollback");
    if scrollback.exists() {
        fs::remove_dir_all(&scrollback).map_err(|e| e.to_string())?;
    }
    let activity_stats = dir.join("activity-stats.json");
    if activity_stats.exists() {
        fs::remove_file(activity_stats).map_err(|e| e.to_string())?;
    }

    for (i, relative) in relative_paths.iter().enumerate() {
        let Some(relative) = relative else {
            continue;
        };
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let dest = dir.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // Unix symlink mode is deliberately ignored: import only regular file bytes.
        let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        let _ = read_remaining(&mut entry);
    }

    Ok(())
}

fn read_remaining<R: Read>(r: &mut R) -> io::Result<u64> {
    io::copy(r, &mut io::sink())
}

#[cfg(test)]
mod tests {
    use super::{import_backup_from_dir, is_runtime_archive_entry, is_runtime_backup_path};
    use crate::plugin_package::safe_entry_path;
    use std::fs;
    use std::io::{Read, Write};
    use std::path::{Path, PathBuf};
    use zip::write::FileOptions;
    use zip::{ZipArchive, ZipWriter};

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "mosaico-backup-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8], bool)]) {
        let mut writer = ZipWriter::new(fs::File::create(path).unwrap());
        for (name, body, directory) in entries {
            if *directory {
                writer.add_directory(*name, FileOptions::default()).unwrap();
            } else {
                writer.start_file(*name, FileOptions::default()).unwrap();
                writer.write_all(body).unwrap();
            }
        }
        writer.finish().unwrap();
    }

    #[test]
    fn excludes_webview_runtime_data_from_backups() {
        let root = Path::new("profile");
        assert!(is_runtime_backup_path(
            root,
            Path::new("profile/EBWebView/Default/LOCK")
        ));
        assert!(is_runtime_archive_entry("EBWebView/Default/LOCK"));
        assert!(is_runtime_archive_entry("ebwebview\\Default\\LOCK"));
        assert!(!is_runtime_archive_entry("scrollback/session.bin"));
    }

    #[test]
    fn archive_paths_are_relative_normal_components() {
        let root = Path::new("backup-root");
        for name in [
            "projects.json",
            "profiles/user/data.json",
            "foo/bar.txt",
            "foo\\bar.txt",
            "./foo//bar.txt",
        ] {
            let relative = safe_entry_path(name).unwrap();
            assert!(root.join(&relative).starts_with(root), "{name}");
            assert!(relative
                .components()
                .all(|component| matches!(component, std::path::Component::Normal(_))));
        }
        for name in [
            "",
            "../outside",
            "foo/../../outside",
            "/absolute/path",
            "\\absolute",
            "C:/absolute/path",
            "C:\\absolute\\path",
            "C:drive-relative",
            "\\\\server\\share\\outside",
            "//server/share/outside",
            "foo:stream",
            "foo\\..\\outside",
            "foo/./../outside",
            "foo\0bar",
        ] {
            assert!(safe_entry_path(name).is_err(), "{name:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_rooted_and_drive_relative_paths_bypass_the_old_guard() {
        let root = std::env::temp_dir().join("mosaico-path-repro/root");
        let drive = root
            .components()
            .next()
            .unwrap()
            .as_os_str()
            .to_string_lossy();
        for name in [
            format!("{drive}outside.txt"),
            "\\outside.txt".into(),
            "/outside.txt".into(),
        ] {
            assert!(!Path::new(&name).is_absolute(), "{name}");
            assert!(!name.contains(".."), "{name}");
            assert!(!root.join(&name).starts_with(&root), "{name}");
            assert!(safe_entry_path(&name).is_err(), "{name}");
        }
    }

    #[test]
    fn valid_zip_imports_files_and_ignores_legacy_runtime_cache() {
        let root = temp_root();
        let dir = root.join("profile");
        fs::create_dir_all(dir.join("scrollback")).unwrap();
        fs::write(dir.join("scrollback/old.bin"), b"old").unwrap();
        fs::write(dir.join("activity-stats.json"), b"old").unwrap();
        let source = root.join("backup.zip");
        write_zip(
            &source,
            &[
                ("projects.json", b"{}", false),
                ("profiles/user/", b"", true),
                ("profiles/user/data.json", b"profile", false),
                ("foo\\bar.txt", b"nested", false),
                ("EBWebView/Default/LOCK", b"ignored", false),
            ],
        );
        import_backup_from_dir(&dir, &source).unwrap();
        assert_eq!(fs::read(dir.join("projects.json")).unwrap(), b"{}");
        assert_eq!(
            fs::read(dir.join("profiles/user/data.json")).unwrap(),
            b"profile"
        );
        assert_eq!(fs::read(dir.join("foo/bar.txt")).unwrap(), b"nested");
        assert!(!dir.join("scrollback/old.bin").exists());
        assert!(!dir.join("activity-stats.json").exists());
        assert!(!dir.join("EBWebView").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malicious_zip_entries_fail_before_existing_state_is_removed() {
        let root = temp_root();
        let dir = root.join("profile");
        fs::create_dir_all(dir.join("scrollback")).unwrap();
        fs::write(dir.join("projects.json"), b"old").unwrap();
        fs::write(dir.join("scrollback/saved.bin"), b"saved").unwrap();
        fs::write(dir.join("activity-stats.json"), b"stats").unwrap();
        let source = root.join("backup.zip");
        for name in [
            "../outside",
            "foo/../../outside",
            "/absolute/path",
            "\\absolute",
            "C:/absolute/path",
            "C:drive-relative",
            "\\\\server\\share\\outside",
            "foo:stream",
            "foo\\..\\outside",
            "foo\0bar",
            "EBWebView/../../outside",
        ] {
            for directory in [false, true] {
                let name = if directory {
                    format!("{name}/")
                } else {
                    name.to_string()
                };
                write_zip(
                    &source,
                    &[("projects.json", b"{}", false), (&name, b"bad", directory)],
                );
                let error = import_backup_from_dir(&dir, &source).unwrap_err();
                assert!(
                    error.starts_with("invalid_archive_path:"),
                    "{name}: {error}"
                );
                assert_eq!(fs::read(dir.join("projects.json")).unwrap(), b"old");
                assert_eq!(
                    fs::read(dir.join("scrollback/saved.bin")).unwrap(),
                    b"saved"
                );
                assert_eq!(fs::read(dir.join("activity-stats.json")).unwrap(), b"stats");
                assert!(!root.join("outside").exists(), "{name}");
            }
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unix_symlink_entry_is_imported_as_a_regular_file() {
        let root = temp_root();
        let source = root.join("backup.zip");
        write_zip(
            &source,
            &[
                ("projects.json", b"{}", false),
                ("link.txt", b"../outside", false),
            ],
        );
        let mut bytes = fs::read(&source).unwrap();
        let central = bytes
            .windows(4)
            .enumerate()
            .filter(|(_, window)| *window == b"PK\x01\x02")
            .nth(1)
            .unwrap()
            .0;
        bytes[central + 5] = 3; // Unix origin
        bytes[central + 38..central + 42].copy_from_slice(&(0o120777_u32 << 16).to_le_bytes());
        fs::write(&source, bytes).unwrap();
        let mut archive = ZipArchive::new(fs::File::open(&source).unwrap()).unwrap();
        assert_eq!(
            archive.by_index(1).unwrap().unix_mode().unwrap() & 0o170000,
            0o120000
        );
        drop(archive);

        let dir = root.join("profile");
        import_backup_from_dir(&dir, &source).unwrap();
        let metadata = fs::symlink_metadata(dir.join("link.txt")).unwrap();
        assert!(metadata.is_file());
        assert!(!metadata.file_type().is_symlink());
        let mut content = String::new();
        fs::File::open(dir.join("link.txt"))
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        assert_eq!(content, "../outside");
        assert!(!root.join("outside").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
