// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = format!("ClickyX panicked: {panic_info}");
        eprintln!("{msg}");

        #[cfg(target_os = "windows")]
        {
            extern "system" {
                fn MessageBoxA(
                    hWnd: *const std::ffi::c_void,
                    lpText: *const u8,
                    lpCaption: *const u8,
                    uType: u32,
                ) -> i32;
            }
            let text = format!("{msg}\n\nPlease report this error to the ClickyX team.");
            let text_c = std::ffi::CString::new(text).ok();
            let title_c = std::ffi::CString::new("ClickyX - Unexpected Error").ok();
            if let (Some(t), Some(c)) = (text_c.as_ref(), title_c.as_ref()) {
                unsafe {
                    MessageBoxA(std::ptr::null(), t.as_ptr(), c.as_ptr(), 0x00000010);
                }
            }
        }
    }));
}

fn main() {
    setup_panic_hook();
    clickyx_lib::run()
}
