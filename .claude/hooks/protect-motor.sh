#!/usr/bin/env bash
# protect-motor.sh — impide que un agente edite el motor del harness en un proyecto.
#
# Lo invoca el hook PreToolUse de .claude/settings.json antes de cada Edit,
# Write, MultiEdit o NotebookEdit. Recibe por stdin el JSON del evento.
#
# WHY: el update sobrescribe enteros los archivos del motor del harness. Lo que
# un agente escriba en ellos dentro de un proyecto se pierde en el siguiente
# update; pasó en gastos-backend el 2026-09-30 con un checkpoint, permisos y una
# sección de init.sh. La regla escrita (CLAUDE.md §Dónde se apunta cada cosa) no
# basta: las reglas que hay que recordar se incumplen. Este hook no se olvida.
#
# Qué bloquea: los archivos listados en .harness-manifest (los escribe el
# script de instalación o de update). Sin manifiesto no bloquea nada.
# Qué NO bloquea: al humano editando a mano; el repositorio harness-template
# (donde el motor SÍ se edita); ediciones hechas con comandos de shell (sed,
# redirecciones), que este hook no ve.
#
# Sale con 2 para bloquear: Claude Code le pasa el stderr al agente como motivo.

set -u

PAYLOAD=$(cat)
[ -z "$PAYLOAD" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT" 2>/dev/null || exit 0

# En el repositorio de la plantilla el motor es lo que se edita.
[ -f "upgrade-harness.sh" ] && [ -f "harness-lists.sh" ] && exit 0
[ -f ".harness-manifest" ] || exit 0

# Ruta del archivo relativa al proyecto, con «/». La calcula Node o Python
# porque en Windows llega como C:\... y bash no sabe compararla con el proyecto.
rel_path() {
  local js='
    let raw = "";
    process.stdin.on("data", d => raw += d);
    process.stdin.on("end", () => {
      let ev; try { ev = JSON.parse(raw); } catch { process.exit(0); }
      const ti = ev.tool_input || {};
      const f = ti.file_path || ti.notebook_path;
      if (typeof f !== "string") process.exit(0);
      const path = require("path");
      console.log(path.relative(process.cwd(), path.resolve(f)).split(path.sep).join("/"));
    });
  '
  if command -v node >/dev/null 2>&1 && node --version >/dev/null 2>&1; then
    printf '%s' "$PAYLOAD" | node -e "$js" 2>/dev/null
    return
  fi
  for py in python3 python; do
    if command -v "$py" >/dev/null 2>&1 && "$py" --version >/dev/null 2>&1; then
      printf '%s' "$PAYLOAD" | "$py" -c '
import json, os, sys
try:
    ev = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = ev.get("tool_input") or {}
f = ti.get("file_path") or ti.get("notebook_path")
if isinstance(f, str):
    print(os.path.relpath(os.path.abspath(f), os.getcwd()).replace(os.sep, "/"))
' 2>/dev/null
      return
    fi
  done
}

REL=$(rel_path)
[ -z "$REL" ] && exit 0

# ¿Está en la lista de huellas? (segunda columna de las líneas con huella)
if awk -v f="$REL" 'NF == 2 && $2 == f { found = 1 } END { exit !found }' .harness-manifest; then
  cat >&2 <<MSG
Bloqueado: $REL es del motor del harness. El update lo sobrescribe entero, así
que lo que escribas aquí se perdería.

Lo propio del proyecto va donde dice CLAUDE.md §Dónde se apunta cada cosa:
  - corrección del humano a los agentes  → docs/lessons.md (alcance proyecto)
  - mejora que valdría en todos los proyectos → docs/lessons.md (alcance harness)
    y avisa al humano para llevarla a harness-template
  - estilo del código → docs/conventions.md · verificación → docs/verification.md
  - un paso propio que tiene que ejecutar ./init.sh → init.local.sh
  - decisión técnica → docs/architecture.md · versiones → docs/stack.md
  - término → docs/vocabulary.md · deber o cabo suelto → docs/roadmap.md
Si no encaja en ninguna, pregúntale al humano. Si él quiere cambiar este archivo
igualmente, que lo edite a mano.
MSG
  exit 2
fi

exit 0
