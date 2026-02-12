use clap::Parser;
use serde::Deserialize;

#[derive(Parser, Debug)]
#[command(name = "t9s", about = "k9s-style terminal UI for Temporal")]
pub struct Cli {
    /// Temporal server address (host:port)
    #[arg(long, env = "TEMPORAL_ADDRESS", default_value = "localhost:7233")]
    pub address: String,

    /// Temporal namespace
    #[arg(long, env = "TEMPORAL_NAMESPACE", default_value = "default")]
    pub namespace: String,

    /// Temporal API key for authentication
    #[arg(long, env = "TEMPORAL_API_KEY")]
    pub api_key: Option<String>,

    /// Path to TLS client certificate (for mTLS)
    #[arg(long, env = "TEMPORAL_TLS_CERT")]
    pub tls_cert: Option<String>,

    /// Path to TLS client key (for mTLS)
    #[arg(long, env = "TEMPORAL_TLS_KEY")]
    pub tls_key: Option<String>,

    /// Polling interval in seconds
    #[arg(long, default_value = "3")]
    pub poll_interval: u64,

    /// Log file path
    #[arg(long, env = "T9S_LOG_FILE")]
    pub log_file: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct ConfigFile {
    pub address: Option<String>,
    pub namespace: Option<String>,
    pub api_key: Option<String>,
    pub tls_cert: Option<String>,
    pub tls_key: Option<String>,
    pub poll_interval: Option<u64>,
}

impl ConfigFile {
    pub fn load() -> Option<Self> {
        let config_dir = dirs::config_dir()?;
        let config_path = config_dir.join("t9s").join("config.toml");
        let content = std::fs::read_to_string(config_path).ok()?;
        toml::from_str(&content).ok()
    }
}
