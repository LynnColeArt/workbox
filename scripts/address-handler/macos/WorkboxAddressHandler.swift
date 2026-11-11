import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct WorkboxOrigin {
    let components: URLComponents

    init?(_ value: String) {
        guard let url = URLComponents(string: value),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.percentEncodedHost?.lowercased(),
              ["localhost", "127.0.0.1", "[::1]"].contains(host),
              url.user == nil, url.password == nil,
              url.percentEncodedPath.isEmpty || url.percentEncodedPath == "/",
              url.query == nil, url.fragment == nil,
              url.port.map({ (1...65535).contains($0) }) ?? true,
              url.url != nil else {
            return nil
        }
        // Reject authorities that URLComponents would silently repair, such as a bare colon.
        let normalizedAuthority = host + (url.port.map { ":\($0)" } ?? "")
        let expected = "\(scheme)://\(normalizedAuthority)\(url.percentEncodedPath)"
        guard value.lowercased() == expected else { return nil }
        components = url
    }

    var probeURL: URL? {
        var probe = components
        probe.path = "/api/address-handler"
        return probe.url
    }

    func handoffURL(for address: URL) -> URL? {
        guard address.scheme?.lowercased() == "workbox" else { return nil }
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        guard let encoded = address.absoluteString.addingPercentEncoding(withAllowedCharacters: unreserved) else {
            return nil
        }
        var handoff = components
        handoff.path = "/open"
        handoff.percentEncodedQuery = "address=\(encoded)"
        return handoff.url
    }
}

final class ReadinessProbe: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func check(_ url: URL, completion: @escaping @Sendable (Bool) -> Void) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 2
        configuration.timeoutIntervalForResource = 2
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.connectionProxyDictionary = [
            "HTTPEnable": false, "HTTPSEnable": false, "SOCKSEnable": false,
            "ProxyAutoConfigEnable": false, "ProxyAutoDiscoveryEnable": false,
        ]
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2)
        request.httpMethod = "HEAD"
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        session.dataTask(with: request) { _, response, error in
            let http = response as? HTTPURLResponse
            completion(error == nil && http?.statusCode == 204 &&
                       http?.value(forHTTPHeaderField: "Workbox-Address-Handler") == "1")
            session.finishTasksAndInvalidate()
        }.resume()
    }
}

#if canImport(AppKit)
import AppKit

@MainActor
final class AddressHandler: NSObject, NSApplicationDelegate {
    private let probe = ReadinessProbe()

    private func settingsFile() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false
        )
        return base.appendingPathComponent("org.hubnot.workbox.address-handler", isDirectory: true)
            .appendingPathComponent("origin.txt")
    }

    private func savedOrigin() -> String? {
        guard let file = try? settingsFile() else { return nil }
        return try? String(contentsOf: file, encoding: .utf8)
    }

    private func activate() {
        if #available(macOS 14, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    private func showMessage(_ message: String, detail: String) {
        activate()
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = detail
        alert.runModal()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if CommandLine.arguments.contains("--configure") {
            configure()
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for address in urls {
            openAddress(address)
        }
    }

    private func openAddress(_ address: URL) {
        guard let saved = savedOrigin(), let origin = WorkboxOrigin(saved),
              let probeURL = origin.probeURL else {
            showMessage("Workbox address handler is not configured", detail: "Run the handler’s setup and enter the loopback address of your Workbox instance.")
            return
        }
        guard let handoff = origin.handoffURL(for: address) else {
            showMessage("Cannot open this address", detail: "Use an address beginning with workbox://.")
            return
        }
        probe.check(probeURL) { [weak self] ready in
            DispatchQueue.main.async {
                guard let self else { return }
                guard ready else {
                    self.showMessage("Workbox is unavailable", detail: "Start Workbox or check the configured local address, then try the link again.")
                    return
                }
                if !NSWorkspace.shared.open(handoff) {
                    self.showMessage("Could not open the default browser", detail: "Open Workbox in a browser and paste the link into Open address.")
                }
            }
        }
    }

    private func configure() {
        activate()
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = savedOrigin() ?? ""
        field.placeholderString = "http://127.0.0.1:4123"
        field.setAccessibilityLabel("Local Workbox origin")

        let alert = NSAlert()
        alert.messageText = "Enable Workbox browser links"
        alert.informativeText = "Enter the local Workbox origin. macOS may ask you to confirm the default handler for workbox:// links."
        alert.accessoryView = field
        alert.addButton(withTitle: "Enable")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        let value = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard WorkboxOrigin(value) != nil else {
            showMessage("Enter a loopback HTTP or HTTPS origin", detail: "Use localhost, 127.0.0.1, or [::1] with the Workbox port and no additional path.")
            return
        }

        NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpenURLsWithScheme: "workbox") { [weak self] error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard error == nil else {
                    self.showMessage("Workbox links were not enabled", detail: "Run setup again and confirm the system’s selection if prompted.")
                    return
                }
                do {
                    let file = try self.settingsFile()
                    try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try value.write(to: file, atomically: true, encoding: .utf8)
                } catch {
                    self.showMessage("Could not save the Workbox address", detail: "Check access to your Application Support folder, then run setup again.")
                }
            }
        }
    }
}

@main
struct WorkboxAddressApplication {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let handler = AddressHandler()
        application.setActivationPolicy(.accessory)
        application.delegate = handler
        withExtendedLifetime(handler) {
            application.run()
        }
    }
}
#endif
