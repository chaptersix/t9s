/**
 * Command parser for k9s-style : commands
 */

export interface ParsedCommand {
  command: string;
  args: string[];
}

// Command aliases (short form -> canonical form)
const COMMAND_ALIASES: Record<string, string> = {
  wf: "workflows",
  sch: "schedules",
  tq: "taskqueues",
  ns: "namespace",
  q: "quit",
  h: "help",
};

// Valid commands
const VALID_COMMANDS = new Set([
  "workflows",
  "schedules",
  "taskqueues",
  "namespace",
  "quit",
  "help",
]);

/**
 * Parse a command string into command and arguments
 * @param input - Raw input string (without leading :)
 * @returns Parsed command or null if invalid
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const rawCommand = parts[0] ?? "";
  const args = parts.slice(1);

  // Resolve alias to canonical command
  const command = COMMAND_ALIASES[rawCommand] ?? rawCommand;

  // Validate command
  if (!VALID_COMMANDS.has(command)) {
    return null;
  }

  return { command, args };
}

/**
 * Get command suggestions for auto-complete
 * @param partial - Partial command string
 * @returns Array of matching command names
 */
export function getCommandSuggestions(partial: string): string[] {
  const lower = partial.toLowerCase();
  const suggestions: string[] = [];

  // Check aliases
  for (const [alias, command] of Object.entries(COMMAND_ALIASES)) {
    if (alias.startsWith(lower) || command.startsWith(lower)) {
      if (!suggestions.includes(alias)) {
        suggestions.push(alias);
      }
    }
  }

  // Check full command names
  for (const command of VALID_COMMANDS) {
    if (command.startsWith(lower) && !suggestions.includes(command)) {
      suggestions.push(command);
    }
  }

  return suggestions.sort();
}

/**
 * Get help text for a command
 */
export function getCommandHelp(command: string): string {
  const resolved = COMMAND_ALIASES[command] ?? command;

  switch (resolved) {
    case "workflows":
      return "Switch to workflows view";
    case "schedules":
      return "Switch to schedules view";
    case "taskqueues":
      return "Switch to task queues view";
    case "namespace":
      return "Switch namespace (use :ns <name> or :ns to open selector)";
    case "quit":
      return "Quit the application";
    case "help":
      return "Show help";
    default:
      return "";
  }
}
