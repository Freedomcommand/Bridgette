param([string]$Path)
# Reads the real text out of a document on Freedom's PC: Word, Excel, and text files.
$ErrorActionPreference = 'Stop'
try {
  $p = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
  if ($p.StartsWith('~')) { $p = $env:USERPROFILE + $p.Substring(1) }
  if (-not (Test-Path -LiteralPath $p)) { Write-Output ("ERROR: not found: " + $p); return }
  $ext = ([IO.Path]::GetExtension($p)).ToLower()

  function Clean([string]$x) {
    $x = $x -replace '<[^>]+>', ' '
    $x = $x -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"' -replace '&#39;', "'" -replace '&apos;', "'"
    $x = $x -replace '[ \t]+', ' '
    return $x.Trim()
  }

  $textExt = @('.txt','.md','.csv','.tsv','.json','.log','.xml','.html','.htm','.py','.js','.ts','.ps1','.bat','.ini','.yml','.yaml','.srt','.rtf')
  $text = ''

  if ($textExt -contains $ext) {
    $text = Get-Content -LiteralPath $p -Raw
  }
  elseif ($ext -eq '.docx') {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($p)
    try {
      $entry = $zip.GetEntry('word/document.xml')
      $reader = New-Object IO.StreamReader($entry.Open())
      $xml = $reader.ReadToEnd(); $reader.Close()
    } finally { $zip.Dispose() }
    $xml = $xml -replace '</w:p>', "`r`n"
    $xml = $xml -replace '<w:tab[^>]*/>', "`t"
    $text = Clean $xml
  }
  elseif ($ext -eq '.xlsx') {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($p)
    try {
      $shared = New-Object System.Collections.ArrayList
      $ssEntry = $zip.GetEntry('xl/sharedStrings.xml')
      if ($ssEntry) {
        $reader = New-Object IO.StreamReader($ssEntry.Open()); $ss = $reader.ReadToEnd(); $reader.Close()
        foreach ($m in [regex]::Matches($ss, '(?s)<si>(.*?)</si>')) {
          $val = ''
          foreach ($tm in [regex]::Matches($m.Groups[1].Value, '(?s)<t[^>]*>(.*?)</t>')) { $val += $tm.Groups[1].Value }
          [void]$shared.Add((Clean $val))
        }
      }
      $sb = New-Object System.Text.StringBuilder
      $sheets = $zip.Entries | Where-Object { $_.FullName -match '^xl/worksheets/sheet\d+\.xml$' } | Sort-Object FullName
      foreach ($sheet in $sheets) {
        $reader = New-Object IO.StreamReader($sheet.Open()); $xml = $reader.ReadToEnd(); $reader.Close()
        foreach ($rowm in [regex]::Matches($xml, '(?s)<row[^>]*>(.*?)</row>')) {
          $cells = New-Object System.Collections.ArrayList
          foreach ($cm in [regex]::Matches($rowm.Groups[1].Value, '(?s)<c\b([^>]*)>(.*?)</c>')) {
            $attrs = $cm.Groups[1].Value; $inner = $cm.Groups[2].Value
            $vm = [regex]::Match($inner, '(?s)<v>(.*?)</v>')
            $val = ''
            if ($vm.Success) {
              $val = $vm.Groups[1].Value
              if ($attrs -match 't="s"') { $i = [int]$val; if ($i -lt $shared.Count) { $val = $shared[$i] } }
            } else {
              $im = [regex]::Match($inner, '(?s)<t[^>]*>(.*?)</t>')
              if ($im.Success) { $val = Clean $im.Groups[1].Value }
            }
            [void]$cells.Add($val)
          }
          [void]$sb.AppendLine(($cells -join "`t"))
        }
        [void]$sb.AppendLine('')
      }
    } finally { $zip.Dispose() }
    $text = $sb.ToString()
  }
  elseif (@('.png','.jpg','.jpeg','.gif','.bmp','.webp') -contains $ext) {
    Write-Output "IMAGE: this is a picture file. Tell Freedom to send it to me with the clip button in the chat so I can actually see it."
    return
  }
  elseif ($ext -eq '.pdf') {
    Write-Output "ERROR: I can't read PDF files yet (I can read Word, Excel, and text). Ask Freedom to save it as a Word doc, or we add PDF reading next."
    return
  }
  else {
    Write-Output ("ERROR: I can't read " + $ext + " files yet. I can read Word (.docx), Excel (.xlsx), and text files.")
    return
  }

  if ($null -eq $text) { $text = '' }
  if ($text.Length -gt 60000) { $text = $text.Substring(0, 60000) + "`r`n...(the rest was cut off)..." }
  if ($text.Trim().Length -eq 0) { Write-Output "(The file opened but had no readable text in it.)" } else { Write-Output $text }
}
catch { Write-Output ("ERROR: " + $_.Exception.Message) }
