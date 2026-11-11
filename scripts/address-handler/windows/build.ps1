[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('Build', 'Install', 'Uninstall')]
    [string]$Action = 'Build',

    [Parameter(Position = 1)]
    [string]$Origin,

    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Build, install, and uninstall this handler on Windows.'
}

$localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if (-not $localData) { throw 'The current Windows user has no LocalAppData folder.' }
$installDirectory = Join-Path $localData 'Workbox/AddressHandler'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $localData 'Workbox/AddressHandlerBuild' }
$buildOutput = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'WorkboxAddressHandler.exe'
$installedExe = Join-Path $installDirectory 'WorkboxAddressHandler.exe'
if ($installedExe.Contains('%')) { throw 'The installation path cannot contain a percent sign.' }
$launchCommand = '"{0}" "%1"' -f $installedExe

if ($Action -eq 'Build') {
    $compiler = (Get-Command cl.exe -CommandType Application).Source
    $source = Join-Path $PSScriptRoot 'WorkboxAddressHandler.cpp'
    $object = [IO.Path]::ChangeExtension($buildOutput, '.obj')
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($buildOutput)) -Force | Out-Null
    & $compiler /nologo /std:c++20 /EHsc /W4 /WX /O2 /MT "/Fo$object" "/Fe$buildOutput" $source /link /SUBSYSTEM:WINDOWS Winhttp.lib Shell32.lib Advapi32.lib User32.lib
    if ($LASTEXITCODE -ne 0) { throw "Native build failed with exit code $LASTEXITCODE." }
    Write-Output $buildOutput
    return
}

$protocolPath = 'Software\Classes\workbox'
$settingsPath = 'Software\Workbox\AddressHandler'
$ownerName = 'WorkboxAddressHandlerOwner'
$ownerValue = 'Workbox.AddressHandler'
$currentUser = [Microsoft.Win32.Registry]::CurrentUser

if (-not ('Workbox.AssociationNotification' -as [type])) {
    Add-Type -Namespace Workbox -Name AssociationNotification -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@
}
function Notify-AssociationChanged {
    # SHCNE_ASSOCCHANGED with SHCNF_IDLIST and no item payload.
    [Workbox.AssociationNotification]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}

$protocol = $currentUser.OpenSubKey($protocolPath)
$hasProtocol = $null -ne $protocol
if ($hasProtocol) {
    try {
        $command = $protocol.OpenSubKey('shell\open\command')
        try {
            $recordedCommand = if ($command) { $command.GetValue('') } else { $null }
            if ($protocol.GetValue($ownerName) -cne $ownerValue -or
                ($null -ne $recordedCommand -and $recordedCommand -cne $launchCommand)) {
                throw 'An existing workbox:// association is not owned by this installation.'
            }
        } finally {
            if ($command) { $command.Dispose() }
        }
    } finally {
        $protocol.Dispose()
    }
}

if ($Action -eq 'Uninstall') {
    if ($hasProtocol) {
        $currentUser.DeleteSubKeyTree($protocolPath, $false)
        Notify-AssociationChanged
    }
    $settings = $currentUser.OpenSubKey($settingsPath, $true)
    if ($settings) {
        try { $settings.DeleteValue('Origin', $false) } finally { $settings.Dispose() }
    }
    if (Test-Path -LiteralPath $installedExe -PathType Leaf) { Remove-Item -LiteralPath $installedExe }
    Write-Output 'Removed the Workbox address handler for this Windows user.'
    return
}

if ($Origin -cnotmatch '\Ahttps?://(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?/?\z' -or
    ($Matches[1] -and ([int]$Matches[1] -lt 1 -or [int]$Matches[1] -gt 65535))) {
    throw 'Specify an HTTP(S) loopback origin such as http://127.0.0.1:4123.'
}
if (-not (Test-Path -LiteralPath $buildOutput -PathType Leaf)) {
    throw 'Build the native handler first, or pass the release artifact directory with -OutputDirectory.'
}
if (-not $hasProtocol) {
    $existing = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey('workbox')
    if ($existing) {
        $existing.Dispose()
        throw 'An existing workbox:// association is not owned by this installation.'
    }
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $buildOutput -Destination $installedExe -Force

$settings = $currentUser.CreateSubKey($settingsPath)
try {
    $settings.SetValue('Origin', $Origin, [Microsoft.Win32.RegistryValueKind]::String)
} finally {
    $settings.Dispose()
}

$protocol = $currentUser.CreateSubKey($protocolPath)
try {
    $protocol.SetValue($ownerName, $ownerValue, [Microsoft.Win32.RegistryValueKind]::String)
    $protocol.SetValue('', 'URL:Workbox Address Handler', [Microsoft.Win32.RegistryValueKind]::String)
    $protocol.SetValue('URL Protocol', '', [Microsoft.Win32.RegistryValueKind]::String)
    $command = $protocol.CreateSubKey('shell\open\command')
    try {
        $command.SetValue('', $launchCommand, [Microsoft.Win32.RegistryValueKind]::String)
    } finally {
        $command.Dispose()
    }
} finally {
    $protocol.Dispose()
}
Notify-AssociationChanged
Write-Output "Enabled workbox:// links for the current Windows user at $Origin."
