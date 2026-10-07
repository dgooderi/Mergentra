# Security policy

## Supported versions

Mergentra is pre-1.0. Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the affected version, steps to reproduce, and the impact you expect.

You can expect an acknowledgement within 7 days. Fixes are released as soon as practical, and reporters are credited unless they ask not to be.

## Scope

Mergentra runs your installed Git against repositories you open. Of particular interest:

- Repository configuration or content that makes Mergentra run a program without the confirmation prompt described in the readme.
- Escapes from the renderer sandbox, or unexpected access to the file system or network.
- Problems with the update check or release links.

Running programs that a repository's own Git configuration asks for, after you choose **Fetch anyway**, is expected behaviour.
