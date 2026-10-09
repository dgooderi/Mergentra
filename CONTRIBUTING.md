# Contributing to Mergentra

Thanks for helping. Mergentra is released under [RPL-1.5](LICENSE).

## Before you start

- Ask questions and float ideas in [Discussions](https://github.com/dgooderi/Mergentra/discussions); use issues for bugs and concrete feature requests.
- Open an issue to discuss larger changes before writing code.
- Follow the [code of conduct](CODE_OF_CONDUCT.md).
- Report security problems privately, as described in [SECURITY.md](SECURITY.md), not in public issues.

## Contributor License Agreement

You must agree to the [CLA](CLA.md) before a pull request can be merged. A bot comments on your first pull request with instructions: reply with the sentence it gives you. You keep the copyright in your work; the CLA lets the maintainer relicense it, which keeps the option of commercial licensing open.

## Development

Requirements and commands are in the [readme](readme.md#development). Before opening a pull request, run:

```
npm run lint
npm run format:check
npm run test:unit
npm run test:e2e
```

## Pull requests

- Keep each pull request focused on one change.
- Add or update tests for behaviour changes.
- The `main` branch only accepts pull requests with signed commits.
