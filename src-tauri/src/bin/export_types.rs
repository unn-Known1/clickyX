/// Type export utility — generates src/bindings.generated.ts from Rust types.
///
/// Run with: cargo run --bin export_types
/// Requires specta in [dev-dependencies] of Cargo.toml.
///
/// This binary is dev-only and not included in release builds.
fn main() {
    #[cfg(feature = "specta-export")]
    {
        specta_typescript::Typescript::default()
            .export_to("../src/bindings.generated.ts", &specta::export())
            .expect("failed to export types");
        println!("Types exported to src/bindings.generated.ts");
    }
    #[cfg(not(feature = "specta-export"))]
    {
        eprintln!(
            "specta-export feature not enabled.\n\
             Add to Cargo.toml [dev-dependencies]:\n\
             specta = {{ version = \"2\", features = [\"export\"] }}\n\
             specta-typescript = \"0.0.7\"\n\
             Then run: cargo run --bin export_types --features specta-export"
        );
        std::process::exit(1);
    }
}
