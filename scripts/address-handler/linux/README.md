# Linux Workbox address handler

Run this opt-in installer from a desktop session using the Node runtime that
runs Workbox. Pass the origin of your running Workbox instance.

```sh
./scripts/address-handler/linux/install.sh install http://127.0.0.1:4123
```

The installer uses your XDG application and configuration directories and
registers only the `workbox` scheme. Click a `workbox://` link and follow any
browser or desktop prompt. Workbox opens in your existing default browser.
The handler supports HTTP or HTTPS on `localhost`, `127.0.0.1`, or `[::1]`,
including a custom port. For HTTPS, the certificate must be trusted by Node
and your browser.

Run the same install command with the new origin to reconfigure the handler.
Run the updated installer with your current origin to upgrade it. The installer
checks the effective association using GIO or xdg-utils. If a desktop-specific
default takes precedence, the installer rolls back its changes. Remove the
conflicting `workbox://` default in your desktop settings, then retry.

To disable and remove the handler, run:

```sh
./scripts/address-handler/linux/install.sh uninstall
```

This removes the Workbox entry and settings while preserving other scheme
associations. You can still paste the address into **Open address** in Workbox.

If the handler reports an unavailable instance, start Workbox at the
configured origin or rerun the installer with the correct origin. The handler
reports errors on stderr and can display a Zenity dialog or desktop notification.
If desktop browser launch fails, open Workbox directly and use **Open address**.
