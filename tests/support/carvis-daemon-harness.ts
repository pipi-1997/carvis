import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveManagedInstallLayout } from "../../packages/carvis-cli/src/install-layout.ts";

export async function createCarvisDaemonHarness() {
  const homeDir = await mkdtemp(join(tmpdir(), "carvis-daemon-"));
  const layout = resolveManagedInstallLayout({
    homeDir,
  });
  const binDir = join(homeDir, "bin");
  const dockerStatePath = join(homeDir, "fake-docker-state.env");
  const dockerScriptPath = join(binDir, "docker");

  await mkdir(binDir, { recursive: true });
  await writeFile(
    dockerStatePath,
    [
      "daemon=1",
      "postgres=stopped",
      "redis=stopped",
    ].join("\n") + "\n",
  );
  await writeFile(
    dockerScriptPath,
    `#!/bin/sh
STATE_FILE="\${CARVIS_FAKE_DOCKER_STATE_PATH}"

if [ -z "$STATE_FILE" ]; then
  echo "missing CARVIS_FAKE_DOCKER_STATE_PATH" >&2
  exit 1
fi

if [ ! -f "$STATE_FILE" ]; then
  cat > "$STATE_FILE" <<'EOF'
daemon=1
postgres=stopped
redis=stopped
EOF
fi

. "$STATE_FILE"

save_state() {
  cat > "$STATE_FILE" <<EOF
daemon=\${daemon}
postgres=\${postgres}
redis=\${redis}
EOF
}

if [ "$1" = "--version" ]; then
  echo "Docker version 29.2.0, build fake"
  exit 0
fi

if [ "$1" = "info" ]; then
  if [ "$daemon" = "1" ]; then
    echo "29.2.0"
    exit 0
  fi
  echo "Cannot connect to the Docker daemon" >&2
  exit 1
fi

if [ "$1" != "compose" ]; then
  echo "unsupported docker command" >&2
  exit 1
fi

subcmd=""
for arg in "$@"; do
  case "$arg" in
    version|up|stop|down|ps)
      subcmd="$arg"
      break
      ;;
  esac
done

case "$subcmd" in
  version)
    echo "Docker Compose version v2.0.0-fake"
    ;;
  up)
    postgres=running
    redis=running
    save_state
    ;;
  stop|down)
    postgres=stopped
    redis=stopped
    save_state
    ;;
  ps)
    cat <<EOF
[
  {"Service":"postgres","State":"$postgres","Health":"$( [ "$postgres" = "running" ] && echo healthy || echo unhealthy )"},
  {"Service":"redis","State":"$redis","Health":"$( [ "$redis" = "running" ] && echo healthy || echo unhealthy )"}
]
EOF
    ;;
  *)
    echo "unsupported docker compose command" >&2
    exit 1
    ;;
esac
`,
  );
  await chmod(dockerScriptPath, 0o755);

  return {
    async cleanup() {
      await rm(homeDir, {
        force: true,
        recursive: true,
      });
    },
    env: {
      ...process.env,
      CARVIS_FAKE_DOCKER_STATE_PATH: dockerStatePath,
      CARVIS_DAEMON_SKIP_RUNTIME: "1",
      HOME: homeDir,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    },
    homeDir,
    layout,
    dockerStatePath,
  };
}
