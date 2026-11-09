param([string]$Path)
# Reads the real text out of a document on Freedom's PC: Word, Excel, PDF, and text files.
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
    # 1st way: let Microsoft Word open the PDF and hand back its words (best quality).
    $viaWord = $false
    try {
      foreach ($v in @('16.0','15.0')) {
        $k = "HKCU:\Software\Microsoft\Office\$v\Word\Options"
        if (Test-Path $k) { Set-ItemProperty -Path $k -Name 'DisableConvertPdfWarning' -Value 1 -Type DWord -ErrorAction SilentlyContinue }
      }
      $w = New-Object -ComObject Word.Application
      $w.Visible = $false; $w.DisplayAlerts = 0
      try {
        $d = $w.Documents.Open($p, $false, $true, $false)
        $text = $d.Content.Text -replace "`r", "`r`n"
        $d.Close(0); $viaWord = $text.Trim().Length -gt 0
      } finally { $w.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($w) }
    } catch { $viaWord = $false }

    # 2nd way (no Word): pull the text straight out of the PDF's pages.
    if (-not $viaWord) {
      $bytes = [IO.File]::ReadAllBytes($p)
      $raw = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
      $sb = New-Object System.Text.StringBuilder
      foreach ($m in [regex]::Matches($raw, '(?s)<<(.*?)>>\s*stream\r?\n')) {
        $start = $m.Index + $m.Length
        $end = $raw.IndexOf('endstream', $start); if ($end -lt 0) { continue }
        $data = $raw.Substring($start, $end - $start)
        if ($m.Groups[1].Value -match '/FlateDecode') {
          try {
            $buf = [Text.Encoding]::GetEncoding(28591).GetBytes($data)
            $ms = New-Object IO.MemoryStream(,$buf); $ms.Position = 2
            $ds = New-Object IO.Compression.DeflateStream($ms, [IO.Compression.CompressionMode]::Decompress)
            $out = New-Object IO.MemoryStream; try { $ds.CopyTo($out) } catch {}
            $data = [Text.Encoding]::GetEncoding(28591).GetString($out.ToArray())
          } catch { continue }
        } elseif ($m.Groups[1].Value -match '/Filter') { continue }
        if ($data -notmatch 'T[Jj]') { continue }
        foreach ($t in [regex]::Matches($data, '(?s)\[(.*?)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|\x27|")|(T\*|Td|TD|ET)')) {
          if ($t.Groups[3].Success) { [void]$sb.Append(' '); if ($t.Groups[3].Value -ne 'Td') { [void]$sb.AppendLine() }; continue }
          $chunk = if ($t.Groups[1].Success) { ([regex]::Matches($t.Groups[1].Value, '\(((?:\\.|[^\\)])*)\)') | ForEach-Object { $_.Groups[1].Value }) -join '' } else { $t.Groups[2].Value }
          $chunk = $chunk -replace '\\n', "`n" -replace '\\\(', '(' -replace '\\\)', ')' -replace '\\\\', '\'
          [void]$sb.Append($chunk)
        }
      }
      $text = ($sb.ToString() -replace '[ \t]+', ' ' -replace '(\r?\n\s*){3,}', "`r`n`r`n").Trim()
      if ($text.Length -lt 20) {
        Write-Output "ERROR: This PDF looks like scanned pictures (no typed text inside), and Word isn't on this PC to read it. Send it to me in the chat with the clip button and I'll look at it, or open it in Word."
        return
      }
      $text = "(Read without Word — spacing may be a little off.)`r`n" + $text
    }
  }
  else {
    Write-Output ("ERROR: I can't read " + $ext + " files yet. I can read Word (.docx), Excel (.xlsx), PDF (.pdf), and text files.")
    return
  }

  if ($null -eq $text) { $text = '' }
  if ($text.Length -gt 60000) { $text = $text.Substring(0, 60000) + "`r`n...(the rest was cut off)..." }
  if ($text.Trim().Length -eq 0) { Write-Output "(The file opened but had no readable text in it.)" } else { Write-Output $text }
}
catch { Write-Output ("ERROR: " + $_.Exception.Message) }
