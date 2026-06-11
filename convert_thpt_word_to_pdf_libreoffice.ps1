param(
  [string]$SourceFolder = "",
  [string]$PdfFolder = "",
  [switch]$Overwrite,
  [switch]$SkipMerge
)

$ErrorActionPreference = "Stop"

function Get-NumberedDocxFiles([string]$Folder) {
  @(Get-ChildItem -LiteralPath $Folder -File |
    Where-Object { $_.Extension -ieq ".docx" -and $_.Name -match "^\s*\d+\s*[.]" } |
    ForEach-Object {
      $match = [regex]::Match($_.Name, "^\s*(\d+)\s*[.]")
      [pscustomobject]@{
        Number = [int]$match.Groups[1].Value
        Name = $_.Name
        FullName = $_.FullName
      }
    } |
    Sort-Object Number)
}

function Find-SourceFolder {
  $downloads = Join-Path $env:USERPROFILE "Downloads"
  $folders = @(Get-ChildItem -LiteralPath $downloads -Directory -Recurse -ErrorAction SilentlyContinue)
  $matches = New-Object System.Collections.Generic.List[object]
  foreach ($folder in $folders) {
    $docs = Get-NumberedDocxFiles $folder.FullName
    if ($docs.Count -ge 100) {
      $matches.Add([pscustomobject]@{ Folder = $folder.FullName; Count = $docs.Count })
    }
  }
  if ($matches.Count -eq 0) {
    throw "No Downloads subfolder with 100+ numbered DOCX files was found. Pass -SourceFolder explicitly."
  }
  if ($matches.Count -gt 1) {
    $list = ($matches | ForEach-Object { "$($_.Count) files: $($_.Folder)" }) -join "`n"
    throw "Multiple candidate folders found. Pass -SourceFolder explicitly.`n$list"
  }
  return $matches[0].Folder
}

function Find-Soffice {
  $cmd = Get-Command soffice -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "C:\Program Files\LibreOffice\program\soffice.exe",
    "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw "LibreOffice not found. Install it first: winget install --id TheDocumentFoundation.LibreOffice -e"
}

if ([string]::IsNullOrWhiteSpace($SourceFolder)) {
  $SourceFolder = Find-SourceFolder
}
if (-not (Test-Path -LiteralPath $SourceFolder)) {
  throw "Source folder not found: $SourceFolder"
}

if ([string]::IsNullOrWhiteSpace($PdfFolder)) {
  $PdfFolder = Join-Path $SourceFolder "_PDF_1-110_LIBREOFFICE"
}
New-Item -ItemType Directory -Path $PdfFolder -Force | Out-Null

$files = Get-NumberedDocxFiles $SourceFolder
if ($files.Count -eq 0) {
  throw "No numbered DOCX files found in $SourceFolder"
}

$soffice = Find-Soffice
$profile = Join-Path $PdfFolder "_lo_profile"
New-Item -ItemType Directory -Path $profile -Force | Out-Null
$profileUri = ("file:///" + ($profile -replace "\\", "/"))
$logPath = Join-Path $PdfFolder "convert-log.txt"
$failures = New-Object System.Collections.Generic.List[object]

foreach ($file in $files) {
  $pdfPath = Join-Path $PdfFolder ("{0:D3}.pdf" -f $file.Number)
  if ((Test-Path -LiteralPath $pdfPath) -and -not $Overwrite) {
    "SKIP $($file.Number): $($file.Name)" | Tee-Object -FilePath $logPath -Append
    continue
  }

  $before = @(Get-ChildItem -LiteralPath $PdfFolder -Filter "*.pdf" -File | Select-Object -ExpandProperty FullName)
  "PDF $($file.Number)/$($files.Count): $($file.Name)" | Tee-Object -FilePath $logPath -Append
  try {
    & $soffice "--headless" "--nologo" "--nofirststartwizard" "-env:UserInstallation=$profileUri" "--convert-to" "pdf" "--outdir" $PdfFolder $file.FullName | Tee-Object -FilePath $logPath -Append
    $after = @(Get-ChildItem -LiteralPath $PdfFolder -Filter "*.pdf" -File | Select-Object -ExpandProperty FullName)
    $newPdf = @($after | Where-Object { $_ -notin $before }) | Select-Object -First 1
    if (-not $newPdf -or -not (Test-Path -LiteralPath $newPdf)) {
      throw "LibreOffice did not produce a PDF."
    }
    Move-Item -LiteralPath $newPdf -Destination $pdfPath -Force
  }
  catch {
    $failures.Add([pscustomobject]@{ Number = $file.Number; Name = $file.Name; Error = $_.Exception.Message })
  }
}

if ($failures.Count -gt 0) {
  $failureCsv = Join-Path $PdfFolder "convert-failures.csv"
  $failures | Export-Csv -LiteralPath $failureCsv -NoTypeInformation -Encoding UTF8
  throw "Some DOCX files failed to convert. See: $failureCsv"
}

if (-not $SkipMerge) {
  $mergedPdfName = "TOAN-HOC-BO-DE-THI-THU-THPTQG-2026-GOP-1-110-LIBREOFFICE.pdf"
  $pdfFiles = @(Get-ChildItem -LiteralPath $PdfFolder -Filter "???.pdf" -File | Sort-Object Name)
  $pdfunite = Get-Command pdfunite -ErrorAction SilentlyContinue
  if ($pdfunite) {
    Push-Location $PdfFolder
    try {
      $pdfNames = @($pdfFiles | ForEach-Object { $_.Name })
      & $pdfunite.Source @pdfNames $mergedPdfName
    }
    finally {
      Pop-Location
    }
  }
  else {
    $env:PDF_DIR = $PdfFolder
    $env:MERGED_PDF = Join-Path $PdfFolder $mergedPdfName
    @'
import os
from pathlib import Path
from pypdf import PdfWriter
writer = PdfWriter()
for pdf in sorted(Path(os.environ["PDF_DIR"]).glob("???.pdf")):
    writer.append(str(pdf))
with Path(os.environ["MERGED_PDF"]).open("wb") as f:
    writer.write(f)
'@ | python -
  }
  "DONE merged PDF: $(Join-Path $PdfFolder $mergedPdfName)" | Tee-Object -FilePath $logPath -Append
}
else {
  "DONE individual PDFs: $PdfFolder" | Tee-Object -FilePath $logPath -Append
}
