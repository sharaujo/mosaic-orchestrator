#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = mosaico_lib::run() {
        eprintln!("mosAIco startup failed: {error}");
        std::process::exit(1);
    }
}
