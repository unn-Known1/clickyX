fn main() {
    #[cfg(target_os = "windows")]
    {
        if let Ok(path) = std::env::var("PATH") {
            std::env::set_var("ORIGINAL_PATH", &path);

            let wrapper_dir = std::env::temp_dir().join("clickyx_windres_wrapper");
            let _ = std::fs::create_dir_all(&wrapper_dir);

            // Write the wrapper source code to OUT_DIR
            let wrapper_src = r#"
use std::process::Command;
use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = env::args().collect();
    
    // Check if we are running as the preprocessor
    if args.len() > 1 && args[1] == "__preprocess__" {
        if let Some(input_file) = args.last() {
            if let Ok(content) = fs::read_to_string(input_file) {
                print!("{}", content);
                std::process::exit(0);
            }
        }
        std::process::exit(1);
    }
    
    let current_exe = env::current_exe().unwrap_or_default();
    let exe_name = current_exe.file_name().unwrap();
    let original_path = env::var("ORIGINAL_PATH").unwrap_or_default();
    let wrapper_dir = current_exe.parent().unwrap();
    
    let mut real_exe = PathBuf::from(exe_name);
    for part in env::split_paths(&original_path) {
        if part == wrapper_dir {
            continue;
        }
        let p = part.join(exe_name);
        if p.exists() {
            real_exe = p;
            break;
        }
    }
    
    let mut cmd = Command::new(real_exe);
    cmd.arg(format!("--preprocessor={}", current_exe.display()));
    cmd.arg("--preprocessor-arg=__preprocess__");
    
    for arg in args.iter().skip(1) {
        cmd.arg(arg);
    }
    
    let status = cmd.status().expect("failed to run real resource compiler");
    std::process::exit(status.code().unwrap_or(1));
}
"#;

            let src_path = wrapper_dir.join("windres_wrapper.rs");
            let _ = std::fs::write(&src_path, wrapper_src);

            // Compile the wrapper source code to executables in wrapper_dir
            let compile_wrapper = |dest_name: &str| {
                let dest_path = wrapper_dir.join(dest_name);
                let _ = std::process::Command::new("rustc")
                    .arg(&src_path)
                    .arg("-o")
                    .arg(&dest_path)
                    .status();
            };

            compile_wrapper("windres.exe");
            compile_wrapper("x86_64-w64-mingw32-windres.exe");
            compile_wrapper("i686-w64-mingw32-windres.exe");

            // Prepend wrapper_dir to PATH
            let new_path = format!("{};{}", wrapper_dir.display(), path);
            std::env::set_var("PATH", new_path);
        }
    }

    tauri_build::build();

    // tauri embeds the application manifest (comctl32 v6) into binary targets
    // only (`rustc-link-arg-bins`). `cargo test` harness executables built from
    // the lib target therefore load comctl32 v5, and the loader aborts with
    // STATUS_ENTRYPOINT_NOT_FOUND on v6-only imports (TaskDialogIndirect,
    // *Subclass via tao) before any test runs. Link the same generated
    // resource into test targets as well.
    #[cfg(target_os = "windows")]
    {
        let rc = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap_or_default())
            .join("resource.rc");
        if rc.is_file()
            && !matches!(
                embed_resource::compile_for_tests(&rc, embed_resource::NONE),
                embed_resource::CompilationResult::Ok
            )
        {
            println!("cargo:warning=clickyX: failed to embed manifest into test targets; `cargo test` may fail on Windows with STATUS_ENTRYPOINT_NOT_FOUND");
        }
    }
}
