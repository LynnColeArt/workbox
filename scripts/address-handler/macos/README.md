# Workbox address handler for macOS

The opt-in helper opens `workbox://` links in the default browser using a configured local Workbox instance. It requires macOS 12 or later. Workbox’s **Open address** field works without the helper.

## Build and enable

Build with Xcode or its Command Line Tools on a Mac. Choose an output directory with no previous helper bundle.

```sh
scripts/address-handler/macos/build.sh /tmp/workbox-macos-build
```

This builds for the Mac’s architecture and signs ad hoc for local testing. For release builds, set `WORKBOX_CODESIGN_IDENTITY` to the release Developer ID Application identity before running the build script. It signs with the hardened runtime and a secure timestamp. Apply the release’s normal notarization and distribution steps before shipping the signed bundle.

Copy the bundle into `~/Applications` or `/Applications`. Start Workbox, then open the handler’s configuration.

```sh
open -n "$HOME/Applications/Workbox Address Handler.app" --args --configure
```

Enter an HTTP(S) loopback origin such as `http://127.0.0.1:4123`, click **Enable**, and follow any macOS confirmation. Use `localhost`, `127.0.0.1`, or `[::1]` with your Workbox port. For HTTPS, the certificate must be trusted by macOS. The helper stores the origin per user and reads it at activation time. Run the same configuration command to change the port or re-enable the handler.

Click a `workbox://` link in your browser and accept its handoff prompt if shown. The helper checks the configured instance and opens the matching destination in Workbox. If it reports that Workbox is unavailable, start Workbox or correct the saved origin, then try again.

## Upgrade or remove

Quit running copies of **Workbox Address Handler** using Activity Monitor before replacing the bundle. Keep the same bundle identifier and installation location, then run configuration again if macOS prompts for a new handler. The saved origin survives replacement.

To disable the handoff, quit the helper and move the bundle to the Trash. To remove its saved origin as well, delete `origin.txt` from `~/Library/Application Support/org.hubnot.workbox.address-handler/`. Do not change Safari’s default-browser settings to remove the Workbox handler.

## DL-002 acceptance

Use a signed macOS release candidate, a known Firewalker fixture on a non-default port, and Safari as the default browser.

1. Click `workbox://projects/firewalker/` on a regular HTTP(S) page. Follow any confirmation and verify that Safari opens Firewalker on the configured origin and port. Compare it with the in-app paste result.
2. Repeat the link while the handler is running. Quit the helper and repeat to exercise cold activation.
3. If Safari or macOS shows a handoff prompt, cancel it and check that Workbox does not open a destination.
4. Stop the fixture server and repeat the click. Check that the handler explains how to start or configure Workbox.
5. Remove the helper and confirm that paste still works. Record macOS and Safari versions, handler build, configured port, and result.

DL-002 requires an actual macOS and Safari run. A Swift syntax or probe check on Linux does not qualify a release.
