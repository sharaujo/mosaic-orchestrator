param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase((Resolve-Path -LiteralPath $Path).Path, 0)
function Read-Rows([string]$Query, [string[]]$Columns) {
    $view = $database.OpenView($Query)
    [void]$view.Execute()
    $rows = @()
    while ($record = $view.Fetch()) {
        $row = [ordered]@{}
        for ($index = 0; $index -lt $Columns.Count; $index++) { $row[$Columns[$index]] = $record.StringData($index + 1) }
        $rows += [pscustomobject]$row
    }
    [void]$view.Close()
    return $rows
}
$directories = @(Read-Rows 'SELECT `Directory`, `Directory_Parent`, `DefaultDir` FROM `Directory`' @('id', 'parent', 'name'))
$components = @(Read-Rows 'SELECT `Component`, `Directory_` FROM `Component`' @('id', 'directory'))
$directoryById = @{}
foreach ($entry in $directories) { $directoryById[$entry.id] = $entry }
$componentById = @{}
foreach ($entry in $components) { $componentById[$entry.id] = $entry }
$resolvedDirectories = @{ INSTALLDIR = '' }
function Resolve-Directory([string]$Id) {
    if ($resolvedDirectories.ContainsKey($Id)) { return $resolvedDirectories[$Id] }
    $entry = $directoryById[$Id]
    if (-not $entry -or -not $entry.parent) { return "<$Id>" }
    $name = ($entry.name.Split(':')[0].Split('|'))[-1]
    if ($name -eq '.') { return Resolve-Directory $entry.parent }
    $parent = Resolve-Directory $entry.parent
    $resolved = (($parent, $name | Where-Object { $_ }) -join '/')
    $resolvedDirectories[$Id] = $resolved
    return $resolved
}
$files = @(Read-Rows 'SELECT `File`, `Component_`, `FileName` FROM `File`' @('id', 'component', 'name')) | ForEach-Object {
    $component = $componentById[$_.component]
    $directory = Resolve-Directory $component.directory
    [pscustomobject]@{ id = $_.id; path = (($directory, $_.name.Split('|')[-1] | Where-Object { $_ }) -join '/') }
}
$license = @(Read-Rows "SELECT ``Text`` FROM ``Control`` WHERE ``Dialog_`` = 'LicenseAgreementDlg' AND ``Control`` = 'LicenseText'" @('text'))
[pscustomobject]@{ files = @($files); licenseText = ($license.text -join "`n") } | ConvertTo-Json -Depth 6 -Compress
