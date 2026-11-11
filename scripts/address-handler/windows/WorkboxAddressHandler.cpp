#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <objbase.h>
#include <shellapi.h>
#include <winhttp.h>

#include <memory>
#include <optional>
#include <string>
#include <string_view>

namespace {

constexpr auto settingsKey = L"Software\\Workbox\\AddressHandler";
constexpr auto probePath = L"/api/address-handler";
constexpr auto markerName = L"Workbox-Address-Handler";
constexpr int timeoutMs = 2000;

struct CloseHttpHandle {
    void operator()(void* handle) const { WinHttpCloseHandle(handle); }
};
using HttpHandle = std::unique_ptr<void, CloseHttpHandle>;

struct FreeArguments {
    void operator()(wchar_t** arguments) const { LocalFree(arguments); }
};
using Arguments = std::unique_ptr<wchar_t*, FreeArguments>;

struct Origin {
    std::wstring url;
    std::wstring host;
    INTERNET_PORT port;
    bool secure;
};

std::optional<Origin> parseOrigin(std::wstring_view value) {
    const bool secure = value.starts_with(L"https://");
    if (!secure && !value.starts_with(L"http://")) return std::nullopt;
    const auto scheme = secure ? L"https://" : L"http://";
    value.remove_prefix(secure ? 8 : 7);
    if (value.ends_with(L"/")) value.remove_suffix(1);

    const auto separator = value.starts_with(L"[::1]") ? value.find(L':', 5) : value.find(L':');
    const auto host = value.substr(0, separator);
    if (host != L"localhost" && host != L"127.0.0.1" && host != L"[::1]") return std::nullopt;

    unsigned int port = secure ? 443 : 80;
    if (separator != std::wstring_view::npos) {
        const auto digits = value.substr(separator + 1);
        if (digits.empty() || digits.size() > 5) return std::nullopt;
        port = 0;
        for (const auto digit : digits) {
            if (digit < L'0' || digit > L'9') return std::nullopt;
            port = port * 10 + (digit - L'0');
        }
        if (port == 0 || port > 65535) return std::nullopt;
    }
    return Origin{std::wstring(scheme) + std::wstring(value), std::wstring(host),
                  static_cast<INTERNET_PORT>(port), secure};
}

std::optional<Origin> configuredOrigin() {
    wchar_t value[128]{};
    DWORD bytes = sizeof(value);
    if (RegGetValueW(HKEY_CURRENT_USER, settingsKey, L"Origin", RRF_RT_REG_SZ,
                     nullptr, value, &bytes) != ERROR_SUCCESS ||
        bytes < sizeof(wchar_t) || bytes % sizeof(wchar_t) != 0) return std::nullopt;

    const std::wstring_view origin(value, bytes / sizeof(wchar_t) - 1);
    return parseOrigin(origin);
}

bool isReady(const Origin& origin) {
    HttpHandle session(WinHttpOpen(L"Workbox Address Handler/1", WINHTTP_ACCESS_TYPE_NO_PROXY,
                                   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    DWORD headerTimeout = timeoutMs;
    if (!session || !WinHttpSetTimeouts(session.get(), timeoutMs, timeoutMs, timeoutMs, timeoutMs) ||
        !WinHttpSetOption(session.get(), WINHTTP_OPTION_RECEIVE_RESPONSE_TIMEOUT,
                          &headerTimeout, sizeof(headerTimeout))) {
        return false;
    }

    HttpHandle connection(WinHttpConnect(session.get(), origin.host.c_str(), origin.port, 0));
    if (!connection) return false;

    HttpHandle request(WinHttpOpenRequest(connection.get(), L"HEAD", probePath, nullptr,
                                         WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                         origin.secure ? WINHTTP_FLAG_SECURE : 0));
    if (!request) return false;

    DWORD disabled = WINHTTP_DISABLE_REDIRECTS | WINHTTP_DISABLE_COOKIES | WINHTTP_DISABLE_AUTHENTICATION;
    if (!WinHttpSetOption(request.get(), WINHTTP_OPTION_DISABLE_FEATURE, &disabled, sizeof(disabled)) ||
        !WinHttpSendRequest(request.get(), L"Cache-Control: no-cache\r\n", DWORD(-1),
                            WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
        !WinHttpReceiveResponse(request.get(), nullptr)) return false;

    DWORD status = 0;
    DWORD bytes = sizeof(status);
    if (!WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             WINHTTP_HEADER_NAME_BY_INDEX, &status, &bytes, WINHTTP_NO_HEADER_INDEX) ||
        status != 204) return false;

    wchar_t marker[8]{};
    bytes = sizeof(marker);
    DWORD index = 0;
    if (!WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_CUSTOM, markerName, marker, &bytes, &index) ||
        std::wstring_view(marker) != L"1") return false;
    bytes = sizeof(marker);
    return !WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_CUSTOM, markerName, marker, &bytes, &index) &&
           GetLastError() == ERROR_WINHTTP_HEADER_NOT_FOUND;
}

std::optional<std::wstring> encodeAddress(std::wstring_view address) {
    if (!address.starts_with(L"workbox://") || address.size() > 4096) return std::nullopt;
    for (const wchar_t character : address) {
        if (character < L' ' || character == 0x7f) return std::nullopt;
    }
    const auto length = static_cast<int>(address.size());
    const int bytes = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, address.data(), length,
                                          nullptr, 0, nullptr, nullptr);
    if (bytes == 0) return std::nullopt;

    std::string utf8(static_cast<std::size_t>(bytes), '\0');
    if (!WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, address.data(), length,
                             utf8.data(), bytes, nullptr, nullptr)) return std::nullopt;

    constexpr std::wstring_view hex = L"0123456789ABCDEF";
    std::wstring encoded;
    for (const unsigned char byte : utf8) {
        if ((byte >= 'A' && byte <= 'Z') || (byte >= 'a' && byte <= 'z') ||
            (byte >= '0' && byte <= '9') || byte == '-' || byte == '_' || byte == '.' || byte == '~') {
            encoded += static_cast<wchar_t>(byte);
        } else {
            encoded += L'%';
            encoded += hex[byte >> 4];
            encoded += hex[byte & 15];
        }
    }
    return encoded;
}

int report(std::wstring_view message) {
    MessageBoxW(nullptr, std::wstring(message).c_str(), L"Workbox", MB_OK | MB_ICONERROR);
    return 1;
}

} // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    int count = 0;
    Arguments arguments(CommandLineToArgvW(GetCommandLineW(), &count));
    const auto address = arguments && count == 2 ? encodeAddress(arguments.get()[1]) : std::nullopt;
    if (!address) return report(L"Open a single workbox:// address, or paste it into Open address in Workbox.");

    const auto origin = configuredOrigin();
    if (!origin) return report(L"Configure the local Workbox origin by rerunning the Windows handler installer.");
    if (!isReady(*origin)) {
        return report(L"Workbox is unavailable at " + origin->url + L". Start it there or check the configured origin.");
    }

    const auto handoff = origin->url + L"/open?address=" + *address;
    constexpr auto browserError =
        L"Could not open the default browser. Open Workbox and paste the address into Open address.";
    if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        return report(browserError);
    }
    const auto opened = ShellExecuteW(nullptr, L"open", handoff.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    CoUninitialize();
    if (reinterpret_cast<INT_PTR>(opened) <= 32) return report(browserError);
    return 0;
}
