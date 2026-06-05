fn main() {
    tauri_build::build();
    #[cfg(target_os = "windows")]
    embed_resource::compile("resources/version.rc", embed_resource::NONE)
        .manifest_optional()
        .unwrap();
}
