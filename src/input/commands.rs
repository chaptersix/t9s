pub struct CommandDef {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    pub description: &'static str,
}

pub static COMMANDS: &[CommandDef] = &[
    CommandDef {
        name: "workflows",
        aliases: &["wf"],
        description: "Switch to workflows view",
    },
    CommandDef {
        name: "schedules",
        aliases: &["sch"],
        description: "Switch to schedules view",
    },
    CommandDef {
        name: "namespace",
        aliases: &["ns"],
        description: "Switch namespace (e.g. :ns production)",
    },
    CommandDef {
        name: "signal",
        aliases: &["sig"],
        description: "Signal workflow (e.g. :signal my-signal {\"key\":\"val\"})",
    },
    CommandDef {
        name: "quit",
        aliases: &["q"],
        description: "Quit t9s",
    },
    CommandDef {
        name: "help",
        aliases: &["h"],
        description: "Show help",
    },
];

pub fn matching_commands(input: &str) -> Vec<&'static CommandDef> {
    let input_lower = input.to_lowercase();
    COMMANDS
        .iter()
        .filter(|cmd| {
            cmd.name.starts_with(&input_lower)
                || cmd.aliases.iter().any(|a| a.starts_with(&input_lower))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matching_commands() {
        assert_eq!(matching_commands("w").len(), 1);
        assert_eq!(matching_commands("w")[0].name, "workflows");

        assert_eq!(matching_commands("wf").len(), 1);
        assert_eq!(matching_commands("wf")[0].name, "workflows");

        assert_eq!(matching_commands("s").len(), 2); // schedules + signal
        assert_eq!(matching_commands("sch").len(), 1);
        assert_eq!(matching_commands("sch")[0].name, "schedules");

        assert_eq!(matching_commands("sig").len(), 1);
        assert_eq!(matching_commands("sig")[0].name, "signal");

        assert_eq!(matching_commands("q").len(), 1);
        assert_eq!(matching_commands("q")[0].name, "quit");

        assert!(matching_commands("xyz").is_empty());
    }
}
