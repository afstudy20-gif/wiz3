# uSTAT Backend — Security Notes

## Code Runner (`/api/code/run`)

The code runner exposes a Python sandbox for users to execute arbitrary
analysis snippets against their session DataFrame. **Off by default.** Set
`ENABLE_CODE_RUNNER=1` in the backend environment to expose it.

### Threat model

Untrusted Python code is sent to the backend, executed against the user's own
in-memory session DataFrame, and returns stdout/stderr/figures to the same
user. The code MUST NOT:

| Risk                                    | Mitigation |
|-----------------------------------------|------------|
| Read other sessions' data               | Subprocess only receives a pickled copy of the requesting session's df. No `store` access. |
| Read host filesystem (e.g. /etc/passwd) | `os`, `shutil`, `pathlib`, `tempfile`, `glob`, `subprocess` are in the import deny-list. Open() works on attacker-controlled paths but FSIZE rlimit + no write access prevents data exfiltration via /tmp. |
| Spawn other processes / shell out       | `subprocess`, `multiprocessing`, `os.system` denied. `RLIMIT_NPROC` caps child process count. |
| Open network sockets / exfiltrate data  | `socket`, `ssl`, `http*`, `urllib*`, `requests`, `asyncio` denied. On Linux, `unshare --net` strips the network namespace. |
| Consume unbounded CPU                   | `RLIMIT_CPU` + wall-clock `subprocess.communicate(timeout=)` with SIGKILL on overrun. |
| Consume unbounded memory                | `RLIMIT_AS = 512 MB`. |
| Write large files                       | `RLIMIT_FSIZE = 10 MB`. |
| Open too many fds                       | `RLIMIT_NOFILE = 64`. |
| Import arbitrary modules                | `sys.meta_path` allowlist finder vetoes anything not on the science-stack list. |
| Trick matplotlib into showing a GUI     | `MPLBACKEND=Agg` forced before any user import. |
| DoS the server with many requests       | Per-session rate limit: 6 runs/min, 30 runs/hour (in-memory token bucket; OK because sessions are 30-min ephemeral). |
| Audit / replay                          | Append-only JSONL log at `backend/logs/code_runner.jsonl` with timestamp, session id, code SHA-256 (first 16 chars), first 200 chars of code, duration, exit code, error. Raw session data is NEVER logged. |

### What this sandbox does NOT protect against

- Kernel-level exploits (the subprocess still shares the host kernel).
- Speculative-execution side channels (Spectre/Meltdown variants).
- Resource exhaustion via `numpy` allocations that exceed the rlimit between
  rlimit-check boundaries (best mitigated by `RLIMIT_AS`).
- A determined attacker chaining allowed primitives to derive forbidden ones.

**Production hardening (recommended next steps):**
1. Wrap the subprocess in `docker run --network=none --memory=512m --cpus=1 --read-only --rm --user nobody --tmpfs /tmp:rw,nodev,nosuid,size=64m` (or rootless podman, or firecracker microvm).
2. Add `seccomp-bpf` syscall filter restricting to read/write/mmap/futex/etc.
3. Run on a dedicated unprivileged user with `setuid` separation.
4. Move audit log to syslog with retention policy.
5. Apply RLIMIT_AS more conservatively (256 MB) and surface in UI as configurable.

### Configuration

Environment variables read by the runner (with defaults):

| Variable                       | Default         | Description                              |
|--------------------------------|-----------------|------------------------------------------|
| `ENABLE_CODE_RUNNER`           | `0` (disabled)  | Set to `1`/`true` to expose the endpoint |
| `SANDBOX_CPU_SEC`              | run timeout     | CPU time rlimit (capped at MAX=60 s)     |
| `SANDBOX_MEM_BYTES`            | 536870912 (512MB) | Address-space rlimit                   |
| `SANDBOX_FSIZE_BYTES`          | 10485760 (10MB) | Max file size the child can write        |
| `SANDBOX_NOFILE`               | 64              | Max open file descriptors                |
| `SANDBOX_NPROC`                | 32              | Max child processes                      |
| `CODE_RUNNER_PER_MIN`          | 6               | Max runs / minute / session_id           |
| `CODE_RUNNER_PER_HOUR`         | 30              | Max runs / hour / session_id             |
| `CODE_RUNNER_IP_PER_MIN`       | 10              | Max runs / minute / client IP            |
| `CODE_RUNNER_IP_PER_HOUR`      | 60              | Max runs / hour / client IP              |
| `CODE_RUNNER_GLOBAL_PER_MIN`   | 30              | Max runs / minute server-wide            |
| `CODE_RUNNER_MAX_CONCURRENT`   | 2               | Max concurrent in-flight runs            |

**Hardened production preset** (Render dashboard or `render.yaml`):

```
ENABLE_CODE_RUNNER=1
CODE_RUNNER_PER_MIN=2
CODE_RUNNER_PER_HOUR=10
CODE_RUNNER_IP_PER_MIN=3
CODE_RUNNER_IP_PER_HOUR=15
CODE_RUNNER_GLOBAL_PER_MIN=10
CODE_RUNNER_MAX_CONCURRENT=1
```

IP buckets honour `X-Forwarded-For` (set by Render's reverse proxy) so the
real client IP is rate-limited, not the proxy.

### Disabling at runtime

Unset / set to `0`:

```bash
unset ENABLE_CODE_RUNNER
# or
export ENABLE_CODE_RUNNER=0
```

The frontend hides the Code tab when `/api/code/status` reports `enabled=false`.

### Reporting

If you discover a sandbox escape, please email **adycovs@gmail.com** privately
before public disclosure.
