import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// VSCode-style shell integration. We deliberately emit ONLY the command
// lifecycle markers OSC 133;C (command pre-exec) and ;D (command done) — never
// ;A/;B (prompt start/end). StateDetector treats a well-formed ;C/;D as the
// authoritative "this session is shell-integrated" signal and latches
// `running` between them. ;A is left untouched as a legacy asking-class
// pattern (see detectUserInputRequired), so emitting it here would spuriously
// flip every prompt to `asking`.

// PowerShell: a prompt-function wrapper emits ;D before each new prompt (the
// previous command just finished — a harmless no-op before the first one),
// and a PSReadLine Enter handler emits ;C right before the submitted command
// runs. Idempotent (env-flag guarded) and wrapped in try/catch so a hostile
// profile can never break session startup.
const POWERSHELL_INTEGRATION = `
try {
  if (-not $env:SUPATTY_SHELL_INTEGRATION) {
    $env:SUPATTY_SHELL_INTEGRATION = '1'
    if (Test-Path Function:\\prompt) { $Global:__supattyOrigPrompt = $Function:prompt }
    function Global:prompt {
      $supatDone = "$([char]27)]133;D$([char]7)"
      if ($Global:__supattyOrigPrompt) {
        $supatBody = & $Global:__supattyOrigPrompt
      } else {
        $supatBody = "PS $($ExecutionContext.SessionState.Path.CurrentLocation)$('>' * ($NestedPromptLevel + 1)) "
      }
      return "$supatDone$supatBody"
    }
    if (Get-Command Set-PSReadLineKeyHandler -ErrorAction SilentlyContinue) {
      Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
        param($key, $arg)
        [Console]::Write("$([char]27)]133;C$([char]7)")
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
      }
    }
  }
} catch {}
`.trim()

// Bash: a temp rcfile that sources the user's ~/.bashrc, then installs a
// DEBUG-trap preexec (;C) and a PROMPT_COMMAND precmd (;D). Guarded so the
// markers fire for real commands, not for the prompt machinery itself. The
// FSM tolerates repeated ;C, so the crude guard is sufficient.
const BASH_INTEGRATION = `
[ -f ~/.bashrc ] && source ~/.bashrc
__supatty_preexec() {
  [ -n "$COMP_LINE" ] && return
  [ "$BASH_COMMAND" = "$PROMPT_COMMAND" ] && return
  printf '\\033]133;C\\007'
}
__supatty_precmd() { printf '\\033]133;D\\007'; }
trap '__supatty_preexec' DEBUG
case "$PROMPT_COMMAND" in
  *__supatty_precmd*) ;;
  *) PROMPT_COMMAND="__supatty_precmd\${PROMPT_COMMAND:+; $PROMPT_COMMAND}" ;;
esac
`.trim()

// PowerShell -EncodedCommand expects base64 of UTF-16LE — sidesteps every
// cross-platform quoting/newline hazard of passing a multi-line -Command arg.
function powershellEncodedCommand(): string {
  return Buffer.from(POWERSHELL_INTEGRATION, 'utf16le').toString('base64')
}

let bashRcPath: string | null = null
function writeBashRc(): string {
  if (!bashRcPath) {
    bashRcPath = join(tmpdir(), 'supatty-bash-integration.sh')
    writeFileSync(bashRcPath, BASH_INTEGRATION, 'utf8')
  }
  return bashRcPath
}

// Returns the spawn args with shell integration injected when the shell is
// known to support it. Unknown shells (cmd.exe, zsh — ZDOTDIR injection not
// wired yet) fall through unchanged and rely on the heuristic state path.
export function applyShellIntegration(command: string, baseArgs: string[]): string[] {
  const lower = command.toLowerCase()
  if (lower.includes('pwsh') || lower.includes('powershell')) {
    return ['-NoLogo', '-NoExit', '-EncodedCommand', powershellEncodedCommand(), ...baseArgs]
  }
  if (lower.endsWith('bash') || lower.endsWith('bash.exe')) {
    return ['--rcfile', writeBashRc(), '-i', ...baseArgs]
  }
  return baseArgs
}
