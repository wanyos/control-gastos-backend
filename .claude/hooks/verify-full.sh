#!/usr/bin/env bash
# verify-full.sh — verificación completa cuando el implementer termina.
#
# Lo invoca el hook SubagentStop de .claude/settings.json (matcher: implementer).
# Recibe por stdin el JSON del evento.
#
# WHY: la versión anterior era un comando en línea que, al fallar, hacía
# `echo ... && tail ...`; tail sale con 0, así que el hook entero salía con 0.
# Con exit 0 Claude Code no le enseña la salida al agente ni le impide pararse:
# el implementer podía terminar con la suite en rojo sin enterarse.
#
# Cómo funciona ahora:
#   - init.sh verde  → exit 0, el implementer termina.
#   - init.sh rojo   → exit 2: Claude Code no deja parar al implementer y le
#                      pasa el stderr (el final del log) como motivo.
#   - Si ya se le bloqueó una vez en esta parada (stop_hook_active = true) y
#     sigue en rojo, se le deja terminar para no entrar en bucle (p. ej. si
#     falta una base de datos que el agente no puede levantar). El reviewer
#     vuelve a lanzar ./init.sh y no aprueba con la suite en rojo.

set -u

PAYLOAD=$(cat)

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

LOG="${TMPDIR:-/tmp}/harness_init.log"

if ./init.sh > "$LOG" 2>&1; then
  exit 0
fi

# ¿Ya venimos de un bloqueo en esta misma parada?
if printf '%s' "$PAYLOAD" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

{
  echo "[harness] ./init.sh FALLÓ: no puedes darte por terminado con la verificación en rojo."
  echo "Arregla lo que falla y vuelve a lanzar ./init.sh. Si no depende de ti (falta"
  echo "una dependencia o un servicio), dilo en tu informe como bloqueo."
  echo "Últimas líneas de $LOG:"
  tail -20 "$LOG" | sed -e $'s/\033\\[[0-9;]*m//g' | tr -d '\r'
} >&2
exit 2
