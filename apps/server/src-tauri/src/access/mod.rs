#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Admin,
    Viewer,
}

impl Role {
    pub fn from_str(s: &str) -> Self {
        match s {
            "Admin" => Self::Admin,
            _ => Self::Viewer,
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Admin => "Admin",
            Self::Viewer => "Viewer",
        }
    }
}

/// Helper to check if a user's role satisfies the required role.
pub fn is_authorized(user_role: &str, required_role: &str) -> bool {
    let u_role = Role::from_str(user_role);
    let r_role = Role::from_str(required_role);

    match (u_role, r_role) {
        (Role::Admin, _) => true, // Admin satisfies all roles
        (Role::Viewer, Role::Viewer) => true, // Viewer satisfies Viewer role
        (Role::Viewer, Role::Admin) => false, // Viewer cannot perform Admin actions
    }
}
