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
      $matches.Add([pscustomobject]@{
        Folder = $folder.FullName
        Count = $docs.Count
      })
    }
  }

  if ($matches.Count -eq 0) {
    throw "Source folder was not provided and no Downloads subfolder with 100+ numbered DOCX files was found. Pass -SourceFolder explicitly."
  }
  if ($matches.Count -gt 1) {
    $list = ($matches | ForEach-Object { "$($_.Count) files: $($_.Folder)" }) -join "`n"
    throw "Multiple candidate folders found. Pass -SourceFolder explicitly.`n$list"
  }

  return $matches[0].Folder
}

if ([string]::IsNullOrWhiteSpace($SourceFolder)) {
  $SourceFolder = Find-SourceFolder
}

if (-not (Test-Path -LiteralPath $SourceFolder)) {
  throw "Source folder not found: $SourceFolder"
}

$openWord = Get-Process WINWORD -ErrorAction SilentlyContinue
if ($openWord) {
  throw "Please close all Microsoft Word windows first, then run this script again."
}

if ([string]::IsNullOrWhiteSpace($PdfFolder)) {
  $PdfFolder = Join-Path $SourceFolder "_PDF_1-110"
}
New-Item -ItemType Directory -Path $PdfFolder -Force | Out-Null

$files = Get-NumberedDocxFiles $SourceFolder

if ($files.Count -eq 0) {
  throw "No numbered DOCX files found in $SourceFolder"
}

$numbers = @($files | ForEach-Object { $_.Number })
$missing = @(1..$files.Count | Where-Object { $_ -notin $numbers })
if ($missing.Count -gt 0) {
  throw "Missing numbered files: $($missing -join ', ')"
}

$logPath = Join-Path $PdfFolder "convert-log.txt"
$failures = New-Object System.Collections.Generic.List[object]
$word = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  try { $word.AutomationSecurity = 3 } catch {}
  try { $word.Options.UpdateLinksAtOpen = $false } catch {}

  foreach ($file in $files) {
    $pdfPath = Join-Path $PdfFolder ("{0:D3}.pdf" -f $file.Number)
    if ((Test-Path -LiteralPath $pdfPath) -and -not $Overwrite) {
      "SKIP $($file.Number): $($file.Name)" | Tee-Object -FilePath $logPath -Append
      continue
    }

    $doc = $null
    try {
      "PDF $($file.Number)/$($files.Count): $($file.Name)" | Tee-Object -FilePath $logPath -Append
      try { Unblock-File -LiteralPath $file.FullName } catch {}
      $doc = $word.Documents.Open($file.FullName, $false, $true, $false)
      $doc.ExportAsFixedFormat($pdfPath, 17)
    }
    catch {
      $failures.Add([pscustomobject]@{
        Number = $file.Number
        Name = $file.Name
        Error = $_.Exception.Message
      })
    }
    finally {
      if ($doc -ne $null) {
        try { $doc.Close($false) | Out-Null } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
      }
      [GC]::Collect()
      [GC]::WaitForPendingFinalizers()
    }
  }
}
finally {
  if ($word -ne $null) {
    try { $word.Quit() | Out-Null } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}

if ($failures.Count -gt 0) {
  $failureCsv = Join-Path $PdfFolder "convert-failures.csv"
  $failures | Export-Csv -LiteralPath $failureCsv -NoTypeInformation -Encoding UTF8
  throw "Some DOCX files failed to convert. See: $failureCsv"
}

if (-not $SkipMerge) {
  $mergedPdfName = "TOAN-HOC-BO-DE-THI-THU-THPTQG-2026-GOP-1-110.pdf"
  $mergedPdf = Join-Path $PdfFolder $mergedPdfName
  $pdfFiles = @(Get-ChildItem -LiteralPath $PdfFolder -Filter "???.pdf" -File | Sort-Object Name)

  if ($pdfFiles.Count -ne $files.Count) {
    throw "Expected $($files.Count) PDFs but found $($pdfFiles.Count)."
  }

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
    $env:MERGED_PDF = $mergedPdf
    @'
import os
from pathlib import Path
from pypdf import PdfWriter

pdf_dir = Path(os.environ["PDF_DIR"])
merged_pdf = Path(os.environ["MERGED_PDF"])
writer = PdfWriter()
for pdf in sorted(pdf_dir.glob("???.pdf")):
    writer.append(str(pdf))
with merged_pdf.open("wb") as f:
    writer.write(f)
'@ | python -
  }

  "DONE merged PDF: $mergedPdf" | Tee-Object -FilePath $logPath -Append
}
else {
  "DONE individual PDFs: $PdfFolder" | Tee-Object -FilePath $logPath -Append
}
