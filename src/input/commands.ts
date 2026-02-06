/**
 * Command parser for k9s-style : commands
 */

export interface ParsedCommand {
  command: string;
  args: string[];
}

export interface CommandInfo {
  name: string;
  alias: string;
  description: string;
}

// Command definitions with aliases and descriptions
const COMMANDS: CommandInfo[] = [
  { name: "workflows", alias: "wf", description: "Switch to workflows view" },
  { name: "schedules", alias: "sch", description: "Switch to schedules view" },
  { name: "taskqueues", alias: "tq", description: "Switch to task queues view" },
  { name: "namespace", alias: "ns", description: "Switch namespace (:ns <name> or :ns)" },
  { name: "quit", alias: "q", description: "Quit the application" },
  { name: "help", alias: "h", description: "Show help" },
];

// Command aliases (short form -> canonical form)
const COMMAND_ALIASES: Record<string, string> = Object.fromEntries(
  COMMANDS.map((cmd) => [cmd.alias, cmd.name])
);

// Valid commands
const VALID_COMMANDS = new Set(COMMANDS.map((cmd) => cmd.name));

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
  const cmd = COMMANDS.find((c) => c.name === resolved || c.alias === command);
  return cmd?.description ?? "";
}

/**
 * Get all available commands with their info
 */
export function getAllCommands(): CommandInfo[] {
  return [...COMMANDS];
}
