#[derive(Debug, Clone)]
pub struct Namespace {
    pub name: String,
    pub state: String,
    pub description: String,
    pub owner_email: String,
    pub retention: Option<std::time::Duration>,
}
