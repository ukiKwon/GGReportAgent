# agent-guard.ps1 - PreToolUse path guard for project subagents (Edit|Write).
#
# Usage (from a subagent's frontmatter hook):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".claude/hooks/agent-guard.ps1" <agent-name>
# Reads the hook JSON on stdin, takes tool_input.file_path, and exits 2 (= block, stderr is
# shown to the agent) unless the project-relative path matches one of the agent's allowed patterns.
#
# Fail closed: unknown agent, unknown root, unparsable input, missing path, or a path outside
# the project are all denied.
#
# ASCII ONLY on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI, which corrupts
# non-ASCII text (see handoff/NEXT.md item 23). Do not add Korean comments or messages here.

param(
  [Parameter(Mandatory = $true)][string]$Agent,
  [string]$Root = $env:CLAUDE_PROJECT_DIR
)

function Deny([string]$msg) {
  [Console]::Error.WriteLine("agent-guard: $msg")
  exit 2
}

# Allowed project-relative paths per agent: regex, forward slashes (-match is case-insensitive).
# To add an agent, add one entry here and reference it from that agent's frontmatter hook.
$rules = @{
  'design-reviewer' = @(
    '^DESIGN\.md$',
    '^docs/design/mockups/.+',
    '^handoff/agents/design-reviewer/.+'
  )
}

if (-not $rules.ContainsKey($Agent)) { Deny "no rules for agent '$Agent' (fail closed)" }
if ([string]::IsNullOrWhiteSpace($Root)) { Deny 'project root unknown (fail closed)' }

$path = $null
try {
  [Console]::InputEncoding = [Text.Encoding]::UTF8
  $raw = [Console]::In.ReadToEnd()
  $path = ($raw | ConvertFrom-Json).tool_input.file_path
} catch {
  Deny 'cannot parse hook input (fail closed)'
}
if ([string]::IsNullOrWhiteSpace($path)) { Deny 'no file_path in tool input (fail closed)' }

$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + '\'
$full = [IO.Path]::GetFullPath($path)   # also resolves ".." so traversal cannot slip through
if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
  Deny "path is outside the project: $full"
}

$rel = $full.Substring($rootFull.Length) -replace '\\', '/'
foreach ($pattern in $rules[$Agent]) {
  if ($rel -match $pattern) { exit 0 }
}
Deny "agent '$Agent' may not write '$rel'. Allowed: $($rules[$Agent] -join ' | ')"
