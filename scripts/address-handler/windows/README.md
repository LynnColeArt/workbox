# Windows address handler

The opt-in handler opens `workbox://` links in the default browser at the local Workbox origin chosen during setup. It uses the Win32 shell protocol association for unpackaged desktop programs and runs as the current user. Administrator privileges and the Windows App SDK runtime are unnecessary.

## Build and enable

From a Visual Studio Developer PowerShell with the C++ desktop workload and Windows SDK installed:

```powershell
.\scripts\address-handler\windows\build.ps1 Build
.\scripts\address-handler\windows\build.ps1 Install http://127.0.0.1:4123
```

The build writes the executable under `%LOCALAPPDATA%\Workbox\AddressHandlerBuild` unless `-OutputDirectory` is supplied. Release packaging can build into a staging directory and distribute the executable with this installer. Pass that directory as `-OutputDirectory` when opting in to a prebuilt artifact. The installer copies the executable into a stable per-user directory and declines to replace a protocol association owned by another program. It queries Windows for the effective handler before reporting success and leaves any existing Windows Default apps choice alone. If registration succeeds but the effective handler cannot be verified, review Default apps or run Uninstall to remove the Workbox registration.

Use `localhost`, `127.0.0.1`, or `[::1]` with HTTP or HTTPS and the actual Workbox port. HTTPS needs a certificate trusted by Windows. The handler checks the fixed readiness endpoint before opening the browser. If Workbox is unavailable, start the configured instance or rerun Install with the correct origin. You can also paste the link into **Open address** inside Workbox.

Rerun Install to upgrade the executable or change the origin. Uninstall removes the current user’s Workbox-owned protocol association, installed executable, and origin setting. It leaves the staged executable available for reinstall.

```powershell
.\scripts\address-handler\windows\build.ps1 Uninstall
```

## Release verification

For DL-003, use the upcoming Windows release candidate and Microsoft Edge as the default browser. Enable the handler with a non-default fixture Workbox port. Click a `workbox://projects/firewalker/` link from a regular HTTP(S) page and verify the configured origin opens Firewalker. Compare with the in-app paste result. Cancel any launch prompt and repeat with Workbox stopped to verify recovery. Record the OS version, Edge version, handler build, port, and result. The Windows release candidate and native Edge acceptance are pending.
