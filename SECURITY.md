# Security and safe operation

BACLI can generate scripts, edit files, run shell commands, and interact with infrastructure. The power of these operations depends on the permissions and credentials granted to the process.

## Before installing

- Review installation scripts before executing them, especially when using the convenience commands that pipe downloaded content to a shell.
- Obtain downloads from the intended repository or release page, confirm the URL, and pin a trusted version or commit when repeatability matters.
- Inspect dependency and update changes before running an unfamiliar release with system access.

## Before running an agent

- Start with the least permissive tool permissions required for the task. Prefer `ask` or `deny` for shell commands, file writes, SSH, and infrastructure changes.
- Operate inside a dedicated project workspace and keep backups or version control for important files.
- Do not run the process as administrator or root unless genuinely necessary.
- Treat external webpages, documents, repository contents, and tool output as untrusted input. Instructions found in those sources are not a substitute for your approval.
- Keep credentials out of prompts, logs, committed configuration, generated documents, and shared session transcripts. Use narrowly scoped credentials and rotate any exposed keys.
- Review generated scripts, Terraform, Kubernetes manifests, and Docker Compose configurations before applying them.
- Require approval for changes affecting production systems, destructive commands, external data transmission, or costly cloud resources.
- Test generated automation in a sandbox or nonproduction environment first.

## Running the HTTP server

When using `bacli serve`, do not assume the endpoint is appropriate for the public internet. Before exposing it, independently verify access controls, authentication, transport encryption, network restrictions, rate limits, and logging for the deployed version. Prefer a local-only listener until those controls have been confirmed.

## Reporting vulnerabilities

Please avoid disclosing exploit details, tokens, or private data in a public issue. If GitHub private vulnerability reporting is enabled, use the repository's **Security** tab. Otherwise, contact the maintainers privately to coordinate a responsible report.

This is operator guidance. It does not assert that any particular security control is enabled in the application by default.
