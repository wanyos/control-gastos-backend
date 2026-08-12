#!/usr/bin/env bash
# verify-changed.sh — verificación rápida, solo si se ha tocado código.
#
# Lo invoca el hook PostToolBatch de .claude/settings.json. Recibe por stdin el
# JSON del evento y decide si hay algo que verificar.
#
# WHY: la versión anterior lanzaba `./init.sh` completo (type check + suite de
# tests entera) tras CADA Edit o Write, sin mirar qué archivo se había tocado.
# Marcar `[x]` en tasks.md, anotar progress/current.md o escribir el propio spec
# costaban lo mismo que tocar el núcleo del proyecto. En una feature con veinte
# tasks eso son decenas de suites completas encadenadas, y el agente esperando
# en cada una.
#
# Aquí se filtra por ruta: si el lote no ha tocado código fuente, se sale en
# milisegundos. Si lo ha tocado, se corre `--fast` (estado + tipos, sin tests).
# La suite completa vive donde se toman decisiones: el paso de verificación del
# implementer, el del reviewer, y el hook SubagentStop.

set -u

PAYLOAD=$(cat)
[ -z "$PAYLOAD" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Extrae las rutas del payload. Acepta las dos formas del evento: PostToolBatch
# (array `tool_results`) y PostToolUse (un solo `tool_input`), para que el script
# siga sirviendo si se recablea el hook.
extract_paths() {
  local script='
    let raw = "";
    process.stdin.on("data", d => raw += d);
    process.stdin.on("end", () => {
      let ev;
      try { ev = JSON.parse(raw); } catch { process.exit(0); }
      const out = [];
      const push = ti => { if (ti && typeof ti.file_path === "string") out.push(ti.file_path); };
      if (Array.isArray(ev.tool_results)) ev.tool_results.forEach(r => push(r && r.tool_input));
      push(ev.tool_input);
      console.log(out.join("\n"));
    });
  '
  if command -v node >/dev/null 2>&1 && node --version >/dev/null 2>&1; then
    printf '%s' "$PAYLOAD" | node -e "$script" 2>/dev/null
    return
  fi
  for py in python3 python; do
    if command -v "$py" >/dev/null 2>&1 && "$py" --version >/dev/null 2>&1; then
      printf '%s' "$PAYLOAD" | "$py" -c '
import json, sys
try:
    ev = json.load(sys.stdin)
except Exception:
    sys.exit(0)
out = []
def push(ti):
    if isinstance(ti, dict) and isinstance(ti.get("file_path"), str):
        out.append(ti["file_path"])
for r in ev.get("tool_results") or []:
    push((r or {}).get("tool_input"))
push(ev.get("tool_input"))
print("\n".join(out))
' 2>/dev/null
      return
    fi
  done
}

# Artefactos del harness: cambian constantemente durante una feature y ninguno
# puede romper el type check ni los tests.
is_harness_artifact() {
  case "$1" in
    *.md|*.markdown)                 return 0 ;;
    */feature_list.json|feature_list.json) return 0 ;;
    progress/*|*/progress/*)         return 0 ;;
    specs/*|*/specs/*)               return 0 ;;
    docs/*|*/docs/*)                 return 0 ;;
    .claude/*|*/.claude/*)           return 0 ;;
    *)                               return 1 ;;
  esac
}

TOUCHED_CODE=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  rel="${p#"$PWD"/}"
  if ! is_harness_artifact "$rel"; then
    TOUCHED_CODE=1
    break
  fi
done <<EOF
$(extract_paths)
EOF

[ "$TOUCHED_CODE" -eq 0 ] && exit 0

LOG="${TMPDIR:-/tmp}/harness_verify.log"
if ./init.sh --fast > "$LOG" 2>&1; then
  tail -3 "$LOG"
else
  echo "[harness] verificación rápida FALLÓ — detalle en $LOG"
  tail -20 "$LOG"
fi
exit 0
