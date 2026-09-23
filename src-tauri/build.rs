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
    // the lib target get no manifest, so link a manifest-only resource into
    // every artifact as well (bins merge the duplicate identical manifest;
    // `rustc-link-arg-tests` is rejected because this package has no [[test]]
    // target).
    #[cfg(target_os = "windows")]
    {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap_or_default());
        let manifest = out.join("clickyx_test_manifest.xml");
        let rc = out.join("clickyx_test_manifest.rc");
        let manifest_xml = r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>
"#;
        // NOTE: UTF-8 BOM prefix: manifests must be BOM-marked for SxS/rc.exe.
        if std::fs::write(&manifest, format!("\u{FEFF}{manifest_xml}")).is_ok() {
            // .rc string literals treat backslash as escape: double them.
            let rc_src = format!(
                "1 RT_MANIFEST \"{}\"",
                manifest.to_string_lossy().replace('\\', "\\\\")
            );
            if std::fs::write(&rc, rc_src).is_ok() {
                let result = embed_resource::compile_for_everything(&rc, embed_resource::NONE);
                // Always surface the outcome: invisible failures here cost a CI cycle each.
                println!(
                    "cargo:warning=clickyX manifest-resource: rc={} result={:?}",
                    rc.display(),
                    result
                );
            }
        }
    }

    // The lib links tao/rfd, which statically import comctl32 v6-only APIs
    // (TaskDialogIndirect, Set/RemoveWindowSubclass, DefSubclassProc). Delay-load
    // comctl32 so the loader never resolves those imports at process startup:
    // unit-test executables (which never call into GUI code) start cleanly, and
    // the first real call resolves via the embedded v6 manifest. This works
    // whether or not SxS honors the manifest, and also covers the app binary.
    #[cfg(target_os = "windows")]
    {
        println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
        // Artifacts that never reference comctl32 (e.g. examples linking only
        // part of the rlib) would emit LNK4199, which trips the repo's
        // warnings-as-errors before tests even build: suppress just that one.
        println!("cargo:rustc-link-arg=/IGNORE:4199");
        // delayimp.lib ships with MSVC; locate it via vswhere (fixed path).
        let vswhere = r"C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe";
        let delayimp = std::process::Command::new(vswhere)
            .args(["-latest", "-find", r"VC\Tools\MSVC\*\lib\x64\delayimp.lib"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| {
                s.lines()
                    .map(str::trim)
                    .find(|l| !l.is_empty() && std::path::Path::new(l).is_file())
                    .map(str::to_owned)
            });
        match delayimp {
            Some(p) => {
                if let Some(dir) = std::path::Path::new(&p).parent() {
                    println!("cargo:rustc-link-search=native={}", dir.display());
                }
                println!("cargo:rustc-link-lib=dylib=delayimp");
                println!("cargo:warning=clickyX: delay-loading comctl32.dll via {p}");
            }
            None => println!(
                "cargo:warning=clickyX: delayimp.lib not found; `cargo test` may fail on Windows with STATUS_ENTRYPOINT_NOT_FOUND"
            ),
        }
    }
}
