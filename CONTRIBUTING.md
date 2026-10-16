# Contributing

Contributions to BPM Supreme Manager are welcome. Bug reports, documentation improvements, translations, interface refinements, and focused code changes can all help the project.

## Before contributing

- Read the README and the unofficial-project notice.
- Use a valid BPM Supreme membership when testing service integration.
- Do not submit credentials, session cookies, downloaded music, account data, or other private information.
- Do not add features intended to bypass subscriptions, access controls, service limits, or copyright restrictions.
- Keep changes focused and explain the user-facing reason for them.

## Development setup

Requirements:

- Node.js 20 or later
- pnpm 9 or later

```bash
git clone https://github.com/cecrevier/bpm-supreme-manager.git
cd bpm-supreme-manager
pnpm install
pnpm start
```

## Suggested workflow

1. Fork the repository.
2. Create a branch with a descriptive name.
3. Make and test your changes on the operating systems affected by them.
4. Confirm that no credentials, cookies, music, build output, or local settings are included.
5. Open a pull request describing the problem, the solution, and how it was tested.

## Reporting bugs

Open a GitHub issue with:

- the operating system and version;
- the BPM Supreme Manager version;
- steps that reproduce the problem;
- the expected and actual behavior;
- relevant error messages with all personal and authentication data removed.

## Pull-request expectations

- Keep the existing Electron security boundaries intact.
- Preserve macOS, Windows, and Linux compatibility where applicable.
- Keep user-facing text available through the localization system.
- Avoid unrelated formatting or dependency changes.
- Update documentation when behavior changes.

By contributing, you agree that your contribution is licensed under the MIT License included with this repository.

