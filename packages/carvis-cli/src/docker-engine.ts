import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class DockerCliMissingError extends Error {
  constructor() {
    super("docker CLI is not installed or not accessible in PATH");
    this.name = "DockerCliMissingError";
  }
}

export class DockerComposeMissingError extends Error {
  constructor() {
    super("docker compose is not installed or not accessible via the docker CLI");
    this.name = "DockerComposeMissingError";
  }
}

export class DockerDaemonUnavailableError extends Error {
  constructor() {
    super("docker daemon is not responding; please start Docker or a compatible provider");
    this.name = "DockerDaemonUnavailableError";
  }
}

export type DockerEngine = {
  preflight(): Promise<void>;
};

export function createDockerEngine(options: {
  env?: Record<string, string | undefined>;
  execImpl?: typeof execFileAsync;
} = {}): DockerEngine {
  const execImpl = options.execImpl ?? execFileAsync;
  const env = options.env ?? process.env;

  async function runCommand(file: string, args: string[]) {
    return execImpl(file, args, {
      env,
    });
  }

  async function ensureDockerCli() {
    try {
      await runCommand("docker", ["--version"]);
    } catch (error) {
      throw new DockerCliMissingError();
    }
  }

  async function ensureDockerCompose() {
    try {
      await runCommand("docker", ["compose", "version"]);
    } catch (error) {
      throw new DockerComposeMissingError();
    }
  }

  async function ensureDaemon() {
    try {
      await runCommand("docker", ["info"]);
    } catch (error) {
      throw new DockerDaemonUnavailableError();
    }
  }

  return {
    async preflight() {
      await ensureDockerCli();
      await ensureDockerCompose();
      await ensureDaemon();
    },
  };
}
