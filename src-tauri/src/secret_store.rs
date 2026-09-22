//! OS-keychain secret storage with config-file fallback (P3/T2-finish).
//!
//! Model (honest and shippable):
//! - `AppConfig` stays the in-memory source of truth for all readers.
//! - When the OS keychain is available (Keychain / Credential Manager /
//!   Secret Service via the `keyring` crate), secrets are MOVED there:
//!   file values are cleared and `secrets_in_keychain` is set, so
//!   `config.json` never holds them again.
//! - When the keychain is unavailable (headless/service/dbus-less), the
//!   previous file-backed behavior applies (owner-only 0600 on unix +
//!   redacted exports), with a warning logged. Availability beats purity:
//!   refusing to save keys at all would brick provider setup.
//! - Migration runs best-effort inside `load_config`; failures never fail
//!   the load — they log and keep file values.

use std::collections::HashMap;
use std::sync::Mutex;

/// Keyring service name for all ClickyX entries.
pub const SERVICE_NAME: &str = "clickyx";

/// Per-secret keyring usernames.
pub mod keys {
    pub const BRIDGE_TOKEN: &str = "bridge_token";
    pub const AGENT_ENCRYPTION_KEY: &str = "agent_encryption_key";
    pub const ANTHROPIC_API_KEY: &str = "ai.anthropic_api_key";
    pub const OPENAI_API_KEY: &str = "ai.openai_api_key";

    pub fn legacy_api_key(provider: &str) -> String {
        format!("apikey.{provider}")
    }
}

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Option<String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
    fn available(&self) -> bool;
}

/// OS keychain backend (Keychain / Credential Manager / Secret Service).
pub struct KeychainStore;

impl KeychainStore {
    fn entry(key: &str) -> Result<keyring::v1::Entry, String> {
        keyring::v1::Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("keychain unavailable for '{key}': {e}"))
    }
}

impl SecretStore for KeychainStore {
    fn available(&self) -> bool {
        keyring::v1::Entry::store_status().is_ok()
    }

    fn get(&self, key: &str) -> Option<String> {
        let entry = Self::entry(key).ok()?;
        entry.get_password().ok()
    }

    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        let entry = Self::entry(key)?;
        entry
            .set_password(value)
            .map_err(|e| format!("keychain write failed for '{key}': {e}"))
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        let entry = Self::entry(key)?;
        entry
            .delete_credential()
            .map_err(|e| format!("keychain delete failed for '{key}': {e}"))
    }
}

/// In-memory backend for unit tests (never touches the OS store).
pub struct MemoryStore {
    inner: Mutex<HashMap<String, String>>,
    pub available_flag: bool,
}

impl MemoryStore {
    pub fn new_available() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            available_flag: true,
        }
    }

    pub fn new_unavailable() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            available_flag: false,
        }
    }
}

impl SecretStore for MemoryStore {
    fn available(&self) -> bool {
        self.available_flag
    }

    fn get(&self, key: &str) -> Option<String> {
        self.inner.lock().ok()?.get(key).cloned()
    }

    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        if !self.available_flag {
            return Err("store unavailable".into());
        }
        self.inner
            .lock()
            .map_err(|e| format!("lock: {e}"))?
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        self.inner
            .lock()
            .map_err(|e| format!("lock: {e}"))?
            .remove(key);
        Ok(())
    }
}

/// Move every secret found in `config` file fields into `store`, clearing the
/// file values as each write succeeds. Returns true when at least one secret
/// moved (caller persists the stripped config + sets the migrated flag).
///
/// Secrets are only cleared from the struct AFTER their keyring write
/// succeeds — a failed write keeps the file value (no silent loss).
pub fn migrate_secrets_to_store(
    config: &mut crate::config::AppConfig,
    store: &dyn SecretStore,
) -> bool {
    if !store.available() {
        return false;
    }
    let mut moved_any = false;

    // Small helper: move one Option<String> field. Returns true when moved.
    let move_opt = |slot: &mut Option<String>, key: &str| -> bool {
        if let Some(value) = slot.clone() {
            if value.is_empty() {
                return false;
            }
            match store.set(key, &value) {
                Ok(()) => {
                    *slot = None;
                    log::info!("Migrated secret '{key}' to OS keychain");
                    return true;
                }
                Err(e) => {
                    log::warn!("Keeping '{key}' in config file: {e}");
                }
            }
        }
        false
    };

    moved_any |= move_opt(&mut config.bridge_token, keys::BRIDGE_TOKEN);
    if !config.agent.encryption_key.is_empty() {
        let value = config.agent.encryption_key.clone();
        match store.set(keys::AGENT_ENCRYPTION_KEY, &value) {
            Ok(()) => {
                config.agent.encryption_key.clear();
                moved_any = true;
                log::info!("Migrated secret 'agent_encryption_key' to OS keychain");
            }
            Err(e) => log::warn!("Keeping 'agent_encryption_key' in config file: {e}"),
        }
    }
    move_opt(&mut config.ai.anthropic_api_key, keys::ANTHROPIC_API_KEY);
    move_opt(&mut config.ai.openai_api_key, keys::OPENAI_API_KEY);
    for api_key in &mut config.api_keys {
        if api_key.key.is_empty() {
            continue;
        }
        let key = keys::legacy_api_key(&api_key.provider);
        match store.set(&key, &api_key.key) {
            Ok(()) => {
                api_key.key.clear();
                moved_any = true;
                log::info!("Migrated secret '{key}' to OS keychain");
            }
            Err(e) => log::warn!("Keeping '{key}' in config file: {e}"),
        }
    }

    moved_any
}

/// Fill secret fields from `store` (post-migration hydration). Missing entries
/// stay as-is (None/empty) — callers surface "no key configured" normally.
pub fn hydrate_secrets_from_store(config: &mut crate::config::AppConfig, store: &dyn SecretStore) {
    if !store.available() {
        return;
    }
    if config
        .bridge_token
        .as_ref()
        .map(|t| t.is_empty())
        .unwrap_or(true)
    {
        config.bridge_token = store.get(keys::BRIDGE_TOKEN);
    }
    if config.agent.encryption_key.is_empty() {
        if let Some(v) = store.get(keys::AGENT_ENCRYPTION_KEY) {
            config.agent.encryption_key = v;
        }
    }
    if config
        .ai
        .anthropic_api_key
        .as_ref()
        .map(|k| k.is_empty())
        .unwrap_or(true)
    {
        config.ai.anthropic_api_key = store.get(keys::ANTHROPIC_API_KEY);
    }
    if config
        .ai
        .openai_api_key
        .as_ref()
        .map(|k| k.is_empty())
        .unwrap_or(true)
    {
        config.ai.openai_api_key = store.get(keys::OPENAI_API_KEY);
    }
    for api_key in &mut config.api_keys {
        if api_key.key.is_empty() {
            let key = keys::legacy_api_key(&api_key.provider);
            if let Some(v) = store.get(&key) {
                api_key.key = v;
            }
        }
    }
}

/// Persist one secret through `store` when available, reporting whether the
/// keychain accepted it (caller keeps the file mirror on failure).
pub fn persist_secret(store: &dyn SecretStore, key: &str, value: &str) -> bool {
    if !store.available() || value.is_empty() {
        return false;
    }
    match store.set(key, value) {
        Ok(()) => true,
        Err(e) => {
            log::warn!("Keychain write failed for '{key}', keeping file value: {e}");
            false
        }
    }
}

/// Persist every non-empty secret currently in `config` to the OS keychain
/// (best-effort, idempotent). Sets `secrets_in_keychain` when anything lands.
/// Memory values are untouched — file stripping happens at save time via
/// verified read-back, so a downed keychain can never lose keys.
pub fn persist_config_secrets(config: &mut crate::config::AppConfig) {
    let store = KeychainStore;
    if !store.available() {
        return;
    }
    let mut landed = false;
    if let Some(t) = config.bridge_token.clone() {
        if persist_secret(&store, keys::BRIDGE_TOKEN, &t) {
            landed = true;
        }
    }
    if !config.agent.encryption_key.is_empty()
        && persist_secret(
            &store,
            keys::AGENT_ENCRYPTION_KEY,
            &config.agent.encryption_key.clone(),
        )
    {
        landed = true;
    }
    if let Some(k) = config.ai.anthropic_api_key.clone() {
        if persist_secret(&store, keys::ANTHROPIC_API_KEY, &k) {
            landed = true;
        }
    }
    if let Some(k) = config.ai.openai_api_key.clone() {
        if persist_secret(&store, keys::OPENAI_API_KEY, &k) {
            landed = true;
        }
    }
    for api_key in &config.api_keys {
        if persist_secret(
            &store,
            &keys::legacy_api_key(&api_key.provider),
            &api_key.key,
        ) {
            landed = true;
        }
    }
    if landed {
        config.secrets_in_keychain = true;
    }
}

/// Clone `config` with secret fields blanked for FILE persistence — but ONLY
/// fields the keychain provably holds (verified read-back).
///
/// Why verified: if the keychain goes down after migration, new secrets fall
/// back to file values; a blanket strip would then DELETE them from disk.
/// A field is stripped iff the keychain returns the identical value.
/// The in-memory struct (process cache) always keeps the real values.
pub fn strip_verified_secrets(
    config: &crate::config::AppConfig,
    store: &dyn SecretStore,
) -> crate::config::AppConfig {
    if !store.available() {
        return config.clone();
    }
    let mut stripped = config.clone();
    let same = |key: &str, value: &str| -> bool {
        !value.is_empty() && store.get(key).as_deref() == Some(value)
    };
    if let Some(t) = config.bridge_token.clone() {
        if same(keys::BRIDGE_TOKEN, &t) {
            stripped.bridge_token = None;
        }
    }
    if same(keys::AGENT_ENCRYPTION_KEY, &config.agent.encryption_key) {
        stripped.agent.encryption_key.clear();
    }
    if let Some(k) = config.ai.anthropic_api_key.clone() {
        if same(keys::ANTHROPIC_API_KEY, &k) {
            stripped.ai.anthropic_api_key = None;
        }
    }
    if let Some(k) = config.ai.openai_api_key.clone() {
        if same(keys::OPENAI_API_KEY, &k) {
            stripped.ai.openai_api_key = None;
        }
    }
    for (i, k) in config.api_keys.iter().enumerate() {
        if same(&keys::legacy_api_key(&k.provider), &k.key) {
            stripped.api_keys[i].key.clear();
        }
    }
    stripped
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_secrets() -> crate::config::AppConfig {
        let mut cfg = crate::config::AppConfig {
            bridge_token: Some("bridge-secret".into()),
            ..crate::config::AppConfig::default()
        };
        cfg.agent.encryption_key = "enc-secret".into();
        cfg.ai.anthropic_api_key = Some("sk-ant-test".into());
        cfg.ai.openai_api_key = Some("sk-openai-test".into());
        cfg.api_keys = vec![crate::config::ApiKey {
            provider: "deepgram".into(),
            key: "dg-test".into(),
        }];
        cfg
    }

    #[test]
    fn test_migrate_moves_all_secrets_and_clears_file() {
        let store = MemoryStore::new_available();
        let mut cfg = config_with_secrets();
        assert!(migrate_secrets_to_store(&mut cfg, &store));
        // File values cleared.
        assert!(cfg.bridge_token.is_none());
        assert!(cfg.agent.encryption_key.is_empty());
        assert!(cfg.ai.anthropic_api_key.is_none());
        assert!(cfg.ai.openai_api_key.is_none());
        assert!(cfg.api_keys.iter().all(|k| k.key.is_empty()));
        // Keychain holds them.
        assert_eq!(
            store.get(keys::BRIDGE_TOKEN).as_deref(),
            Some("bridge-secret")
        );
        assert_eq!(
            store.get(keys::AGENT_ENCRYPTION_KEY).as_deref(),
            Some("enc-secret")
        );
        assert_eq!(
            store.get(keys::ANTHROPIC_API_KEY).as_deref(),
            Some("sk-ant-test")
        );
        assert_eq!(
            store.get(keys::OPENAI_API_KEY).as_deref(),
            Some("sk-openai-test")
        );
        assert_eq!(
            store.get(&keys::legacy_api_key("deepgram")).as_deref(),
            Some("dg-test")
        );
    }

    #[test]
    fn test_migrate_unavailable_store_keeps_file() {
        let store = MemoryStore::new_unavailable();
        let mut cfg = config_with_secrets();
        assert!(!migrate_secrets_to_store(&mut cfg, &store));
        assert_eq!(cfg.bridge_token.as_deref(), Some("bridge-secret"));
        assert_eq!(cfg.agent.encryption_key, "enc-secret");
    }

    #[test]
    fn test_hydrate_fills_from_store() {
        let store = MemoryStore::new_available();
        store.set(keys::BRIDGE_TOKEN, "from-keychain").unwrap();
        let mut cfg = crate::config::AppConfig::default();
        hydrate_secrets_from_store(&mut cfg, &store);
        assert_eq!(cfg.bridge_token.as_deref(), Some("from-keychain"));
        // Pre-existing file values are NOT overwritten.
        cfg.ai.anthropic_api_key = Some("file-key".into());
        hydrate_secrets_from_store(&mut cfg, &store);
        assert_eq!(cfg.ai.anthropic_api_key.as_deref(), Some("file-key"));
    }

    #[test]
    fn test_persist_secret_reports_acceptance() {
        let up = MemoryStore::new_available();
        assert!(persist_secret(&up, "k", "v"));
        assert_eq!(up.get("k").as_deref(), Some("v"));
        let down = MemoryStore::new_unavailable();
        assert!(!persist_secret(&down, "k", "v"));
        assert!(!persist_secret(&up, "k", ""));
    }

    #[test]
    fn test_memory_store_delete() {
        let store = MemoryStore::new_available();
        store.set("k", "v").unwrap();
        store.delete("k").unwrap();
        assert!(store.get("k").is_none());
    }
}
