import { spawn, ChildProcess } from "node:child_process"
import type { Function } from "@symbiote/types"
import { appConfig } from "../../util/config.js";

const activeTerminals = new Map<string, {
  process: ChildProcess;
  stdout: string;
  stderr: string;
  lastUpdate: number;
}>();

let terminalIdCounter = 0;

export const execute_terminal_command: Function = {
  name: "execute_terminal_command",
  description: "Executes a shell command in a stateful terminal environment. Returns output after up to 10 seconds. Creates a new terminal if terminalId is not specified.",
  parameters: {
    command: {
      description: "The shell command to execute.",
      type: "string",
    },
    terminalId: {
      description: "Optional ID of an existing terminal to reuse. Do not specify to create a new terminal.",
      type: "string",
    },
    cwd: {
      description: "Optional working directory for a new terminal. Do not specify if reusing an existing terminal, or to use the default working directory (most likely the home directory).",
      type: "string",
    }
  },
  requiredParams: ["command"],
  enabled: () => {
    return !!appConfig.functions.terminal?.enabled;
  },
  exec: async (args) => {
    const { command, terminalId, cwd } = args as { command: string, terminalId?: string, cwd?: string }

    if (!command || typeof command !== "string") {
      return {
        name: "function.error",
        data: { error: "The 'command' argument must be a non-empty string." },
      }
    }

    let termId = terminalId;
    let termObj = termId ? activeTerminals.get(termId) : undefined;

    if (!termId || !termObj) {
      termId = `term-${++terminalIdCounter}`;
      const shell = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : process.env.SHELL ?? "/bin/sh";

      const child = spawn(shell, [], {
        cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      termObj = {
        process: child,
        stdout: "",
        stderr: "",
        lastUpdate: Date.now()
      };
      activeTerminals.set(termId, termObj);

      child.stdout?.on("data", (chunk) => {
        if (termObj) {
          termObj.stdout += chunk.toString();
          termObj.lastUpdate = Date.now();
        }
      });

      child.stderr?.on("data", (chunk) => {
        if (termObj) {
          termObj.stderr += chunk.toString();
          termObj.lastUpdate = Date.now();
        }
      });

      child.on("exit", () => {
        activeTerminals.delete(termId!);
      });
    }

    // Reset captured output for this command execution
    termObj.stdout = "";
    termObj.stderr = "";
    termObj.lastUpdate = Date.now();

    // Write command
    termObj.process.stdin?.write(command + "\n");

    return await new Promise((resolve) => {
      let checkInterval = setInterval(() => {
        const timeSinceUpdate = Date.now() - termObj!.lastUpdate;
        if (timeSinceUpdate > 500 && (termObj!.stdout || termObj!.stderr)) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve({
            name: "function.ok",
            data: {
              terminalId: termId,
              stdout: termObj!.stdout,
              stderr: termObj!.stderr,
              running: true
            }
          });
        }
      }, 100);

      const timeoutId = setTimeout(() => {
        clearInterval(checkInterval);
        resolve({
          name: "function.ok",
          data: {
            terminalId: termId,
            stdout: termObj!.stdout,
            stderr: termObj!.stderr,
            running: true
          }
        });
      }, 10000);
    });
  },
}

export const type_in_terminal: Function = {
  name: "type_in_terminal",
  description: "Writes directly to an active terminal's stdin, useful for interacting with running processes.",
  parameters: {
    terminalId: {
      description: "The ID of the terminal to type into.",
      type: "string",
    },
    input: {
      description: "The text to write to the terminal stdin.",
      type: "string",
    }
  },
  requiredParams: ["terminalId", "input"],
  enabled: () => {
    return !!appConfig.functions.terminal?.enabled;
  },
  exec: async (args) => {
    const { terminalId, input } = args as { terminalId: string, input: string };

    const termObj = activeTerminals.get(terminalId);
    if (!termObj) {
      return {
        name: "function.error",
        data: { error: `Terminal with ID ${terminalId} not found.` },
      }
    }

    termObj.stdout = "";
    termObj.stderr = "";
    termObj.lastUpdate = Date.now();
    termObj.process.stdin?.write(input);

    return await new Promise((resolve) => {
      let checkInterval = setInterval(() => {
        const timeSinceUpdate = Date.now() - termObj!.lastUpdate;
        if (timeSinceUpdate > 500 && (termObj!.stdout || termObj!.stderr)) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve({
            name: "function.ok",
            data: {
              terminalId: terminalId,
              stdout: termObj!.stdout,
              stderr: termObj!.stderr,
              running: true
            }
          });
        }
      }, 100);

      const timeoutId = setTimeout(() => {
        clearInterval(checkInterval);
        resolve({
          name: "function.ok",
          data: {
            terminalId: terminalId,
            stdout: termObj!.stdout,
            stderr: termObj!.stderr,
            running: true
          }
        });
      }, 10000);
    });
  }
}

export const list_terminals: Function = {
  name: "list_terminals",
  description: "Lists all currently active terminal sessions.",
  parameters: {},
  requiredParams: [],
  enabled: () => {
    return !!appConfig.functions.terminal?.enabled;
  },
  exec: async () => {
    const terminals = Array.from(activeTerminals.keys());
    return {
      name: "function.ok",
      data: {
        activeTerminals: terminals,
      },
    };
  },
};

export const destroy_terminal: Function = {
  name: "destroy_terminal",
  description: "Forcefully destroys a specific active terminal session.",
  parameters: {
    terminalId: {
      description: "The ID of the terminal to destroy.",
      type: "string",
    },
  },
  requiredParams: ["terminalId"],
  enabled: () => {
    return !!appConfig.functions.terminal?.enabled;
  },
  exec: async (args) => {
    const { terminalId } = args as { terminalId: string };
    const termObj = activeTerminals.get(terminalId);

    if (!termObj) {
      return {
        name: "function.error",
        data: { error: `Terminal with ID ${terminalId} not found.` },
      };
    }

    termObj.process.kill("SIGKILL");
    activeTerminals.delete(terminalId);

    return {
      name: "function.ok",
      data: {
        message: `Terminal ${terminalId} successfully destroyed.`,
      },
    };
  },
};
