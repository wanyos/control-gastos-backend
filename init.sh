#!/usr/bin/env bash
# init.sh — Verificación e inicialización del entorno (agnóstico al stack)
#
# Este script lo ejecuta el agente al COMENZAR una sesión y antes de
# declarar cualquier tarea como `done`. Si falla, la sesión no debe avanzar.
#
# Detecta automáticamente el stack del proyecto y ejecuta la verificación
# apropiada. Si tu proyecto usa un stack no soportado, edita la sección 5.
#
# Modos:
#   ./init.sh            completo: estado + type check + suite de tests
#   ./init.sh --fast     estado + type check, SIN tests (para el hook de edición)
#   ./init.sh --state    solo valida feature_list.json y specs (casi instantáneo)
#
# WHY de los modos: la suite completa tras cada edición convierte la
# verificación en el cuello de botella de la sesión. Rápido donde el ciclo es
# apretado, completo donde se toman decisiones (cerrar una feature).

set -u

MODE="full"
case "${1:-}" in
  --fast)  MODE="fast" ;;
  --state) MODE="state" ;;
  "")      MODE="full" ;;
  *)       echo "Uso: $0 [--fast|--state]" >&2; exit 2 ;;
esac

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }
info()  { printf "${BLUE}[INFO]${NC}  %s\n" "$1"; }

EXIT_CODE=0

# Devuelve por stdout un intérprete que REALMENTE ejecuta, no uno que solo está
# en el PATH. En Windows, el alias de la Microsoft Store hace que `command -v
# python3` acierte y la ejecución falle con exit 49: sin esta comprobación, la
# validación de estado queda en rojo permanente y el fallback a Node nunca corre.
runnable() {
  for candidate in "$@"; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" --version >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# ─────────────────────────────────────────────────────────────────────
# 1. Detección de stack
# ─────────────────────────────────────────────────────────────────────
echo "── 1. Detectando stack ────────────────────────────────"

STACK="unknown"
TEST_CMD=""
RUNTIME_VERSION=""

if [ -f "package.json" ]; then
  STACK="node"
  if command -v node >/dev/null 2>&1; then
    RUNTIME_VERSION=$(node --version 2>/dev/null)
  fi
  # Detectar gestor de paquetes
  if [ -f "pnpm-lock.yaml" ]; then PKG="pnpm";
  elif [ -f "yarn.lock" ]; then PKG="yarn";
  else PKG="npm"; fi
  # Detectar test runner desde package.json
  if grep -q '"test"' package.json 2>/dev/null; then
    TEST_CMD="$PKG test"
  fi

elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  STACK="python"
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      version_output=$("$candidate" --version 2>/dev/null)
      if [ -n "$version_output" ]; then
        PYTHON="$candidate"
        RUNTIME_VERSION="$version_output"
        break
      fi
    fi
  done
  if [ -d "tests" ]; then
    TEST_CMD="${PYTHON:-python3} -m unittest discover -s tests -v"
  elif [ -f "pytest.ini" ] || grep -q "pytest" pyproject.toml 2>/dev/null; then
    TEST_CMD="${PYTHON:-python3} -m pytest"
  fi

elif [ -f "Cargo.toml" ]; then
  STACK="rust"
  if command -v cargo >/dev/null 2>&1; then
    RUNTIME_VERSION=$(cargo --version 2>/dev/null)
  fi
  TEST_CMD="cargo test"

elif [ -f "go.mod" ]; then
  STACK="go"
  if command -v go >/dev/null 2>&1; then
    RUNTIME_VERSION=$(go version 2>/dev/null)
  fi
  TEST_CMD="go test ./..."

elif compgen -G "*.csproj" > /dev/null || compgen -G "*.sln" > /dev/null || compgen -G "**/*.csproj" > /dev/null; then
  STACK="dotnet"
  if command -v dotnet >/dev/null 2>&1; then
    RUNTIME_VERSION=$(dotnet --version 2>/dev/null)
  fi
  TEST_CMD="dotnet test"

elif [ -f "pom.xml" ]; then
  STACK="java-maven"
  if command -v mvn >/dev/null 2>&1; then
    RUNTIME_VERSION=$(mvn --version 2>/dev/null | head -1)
  fi
  TEST_CMD="mvn test"

elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
  STACK="java-gradle"
  if command -v gradle >/dev/null 2>&1; then
    RUNTIME_VERSION=$(gradle --version 2>/dev/null | grep Gradle | head -1)
  fi
  TEST_CMD="gradle test"

else
  STACK="unknown"
fi

if [ "$STACK" = "unknown" ]; then
  warn "No se ha detectado un stack conocido"
  warn "El harness funcionará pero sin verificación de tests automática"
  warn "Edita init.sh sección 5 para añadir tu stack si es necesario"
else
  ok "Stack detectado: $STACK"
  if [ -n "$RUNTIME_VERSION" ]; then
    ok "Runtime: $RUNTIME_VERSION"
  else
    warn "Runtime de $STACK no encontrado en PATH"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 2. Verificación de archivos base del arnés
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── 2. Verificando archivos base del arnés ──────────────"

BASE_FILES=(
  "AGENTS.md"
  "CHECKPOINTS.md"
  "feature_list.json"
  "progress/current.md"
  "docs/stack.md"
  "docs/architecture.md"
  "docs/conventions.md"
  "docs/verification.md"
  "docs/specs.md"
  "docs/roadmap.md"
)

for f in "${BASE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    fail "Falta archivo base: $f"
    EXIT_CODE=1
  else
    ok "Existe $f"
  fi
done

# Avisar si docs/related-projects.md no existe (no es bloqueante)
if [ ! -f "docs/related-projects.md" ]; then
  warn "No existe docs/related-projects.md (opcional, créalo si hay proyectos hermanos)"
fi

# ─────────────────────────────────────────────────────────────────────
# 3. Validación de feature_list.json
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── 3. Validando feature_list.json ──────────────────────"

if PYBIN=$(runnable python3 python); then
  "$PYBIN" - <<'PY'
import json, os, sys
try:
    # encoding explícito: en Windows Python abre con la codepage del sistema
    # (cp1252) y el primer acento del JSON revienta la validación entera.
    with open("feature_list.json", encoding="utf-8") as fp:
        data = json.load(fp)
    valid = {"pending", "spec_ready", "in_progress", "done", "blocked"}
    features = data.get("features", [])
    in_progress = [f for f in features if f.get("status") == "in_progress"]
    if len(in_progress) > 1:
        print(f"[FAIL]  Hay {len(in_progress)} features en in_progress (máximo 1)")
        sys.exit(1)
    requires_spec = {"spec_ready", "in_progress", "done"}
    spec_errors = []
    for f in features:
        if f.get("status") not in valid:
            print(f"[FAIL]  Estado inválido en feature {f.get('id')}: {f.get('status')}")
            sys.exit(1)
        if f.get("sdd") and f.get("status") in requires_spec:
            spec_dir = os.path.join("specs", f.get("name", ""))
            required = ["requirements.md", "design.md", "tasks.md"]
            # decisions.md es la hoja de revisión del humano: se exige mientras
            # la feature está en la puerta o en curso. Las cerradas antes de que
            # existiera la regla no se tocan.
            if f.get("status") in ("spec_ready", "in_progress"):
                required.insert(0, "decisions.md")
            for fname in required:
                if not os.path.isfile(os.path.join(spec_dir, fname)):
                    spec_errors.append(
                        f"feature {f.get('id')} ({f.get('name')}) en "
                        f"{f.get('status')} sin {spec_dir}/{fname}"
                    )
    if spec_errors:
        for e in spec_errors:
            print(f"[FAIL]  {e}")
        sys.exit(1)
    print(f"[OK]    feature_list.json válido ({len(features)} features)")
    print(f"[OK]    Specs presentes para features sdd con estado no-pending")
except SystemExit:
    raise
except Exception as e:
    print(f"[FAIL]  feature_list.json o specs inválidos: {e}")
    sys.exit(1)
PY
  if [ $? -ne 0 ]; then EXIT_CODE=1; fi
elif NODEBIN=$(runnable node); then
  # Fallback con Node si no hay Python
  "$NODEBIN" -e '
    const fs = require("fs");
    const path = require("path");
    try {
      const data = JSON.parse(fs.readFileSync("feature_list.json", "utf8"));
      const valid = new Set(["pending", "spec_ready", "in_progress", "done", "blocked"]);
      const features = data.features || [];
      const inProgress = features.filter(f => f.status === "in_progress");
      if (inProgress.length > 1) {
        console.log(`[FAIL]  Hay ${inProgress.length} features en in_progress (máximo 1)`);
        process.exit(1);
      }
      const requiresSpec = new Set(["spec_ready", "in_progress", "done"]);
      const specErrors = [];
      for (const f of features) {
        if (!valid.has(f.status)) {
          console.log(`[FAIL]  Estado inválido en feature ${f.id}: ${f.status}`);
          process.exit(1);
        }
        if (f.sdd && requiresSpec.has(f.status)) {
          const specDir = path.join("specs", f.name || "");
          const required = ["requirements.md", "design.md", "tasks.md"];
          // mismo criterio que la rama Python: decisions.md solo se exige
          // mientras la feature está en la puerta o en curso.
          if (f.status === "spec_ready" || f.status === "in_progress") {
            required.unshift("decisions.md");
          }
          for (const fname of required) {
            if (!fs.existsSync(path.join(specDir, fname))) {
              specErrors.push(`feature ${f.id} (${f.name}) en ${f.status} sin ${specDir}/${fname}`);
            }
          }
        }
      }
      if (specErrors.length) {
        for (const e of specErrors) console.log(`[FAIL]  ${e}`);
        process.exit(1);
      }
      console.log(`[OK]    feature_list.json válido (${features.length} features)`);
      console.log(`[OK]    Specs presentes para features sdd con estado no-pending`);
    } catch (e) {
      console.log(`[FAIL]  feature_list.json o specs inválidos: ${e.message}`);
      process.exit(1);
    }
  '
  if [ $? -ne 0 ]; then EXIT_CODE=1; fi
else
  warn "No hay Python ni Node disponibles; saltando validación de feature_list.json"
fi

if [ "$MODE" = "state" ]; then
  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    ok "Estado del harness coherente (modo --state)."
  else
    fail "Estado del harness incoherente. Revisa los [FAIL] de arriba."
  fi
  exit $EXIT_CODE
fi

# ─────────────────────────────────────────────────────────────────────
# 4. Type checking (solo Node con TypeScript)
# ─────────────────────────────────────────────────────────────────────
# WHY: los runners que transpilan sin comprobar tipos (esbuild, swc y los test
# runners montados sobre ellos) son permisivos con los tipos en mocks; tsc no.
# Si solo se ejecutan los tests, un error de tipos llega al commit y rompe el
# arranque o el build de producción. Esto lo atrapa antes.
if [ "$STACK" = "node" ] && [ -f "tsconfig.json" ]; then
  echo ""
  echo "── 4. Type checking (tsc) ──────────────────────────────"

  if [ -x "node_modules/.bin/tsc" ]; then
    # --incremental reutiliza el .tsbuildinfo entre pasadas: en modo --fast el
    # hook lo llama muchas veces y el arranque en frío domina el tiempo.
    info "Ejecutando: npx tsc --noEmit --incremental"
    if npx tsc --noEmit --incremental; then
      ok "Type check OK (tsc sin errores)"
    else
      fail "Type check fallido (tsc reporta errores)"
      EXIT_CODE=1
    fi
  else
    warn "tsconfig.json existe pero no se encuentra tsc en node_modules. ¿Falta 'npm install'?"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# Salida temprana del modo --fast: estado y tipos, sin lint ni suite.
# ─────────────────────────────────────────────────────────────────────
if [ "$MODE" = "fast" ]; then
  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    ok "Estado y tipos OK (modo --fast; los tests NO se han ejecutado)."
  else
    fail "Fallo en estado o tipos. Revisa los [FAIL] de arriba."
  fi
  exit $EXIT_CODE
fi

# ─────────────────────────────────────────────────────────────────────
# 5. Lint y formato (solo Node, y solo si el proyecto los declara)
# ─────────────────────────────────────────────────────────────────────
# WHY: hasta el 2026-09-01 este script no ejecutaba NINGUNO de los dos, asi que
# una regresion de estilo pasaba la puerta de calidad en verde. El limite de 100
# columnas y las comillas simples estan escritos en docs/conventions.md como
# estandar del proyecto, y un estandar que nadie hace cumplir deja de serlo: el
# 2026-08-30 entro en HEAD un script que no lo cumplia y nadie se entero.
# Los dos van DESPUES de la salida del modo --fast a proposito: ese modo lo
# dispara un hook tras cada lote de herramientas y ahi manda el tiempo de vuelta.
if [ "$STACK" = "node" ]; then
  echo ""
  echo "── 5. Lint y formato ──────────────────────────────"

  if grep -q '"lint"' package.json 2>/dev/null; then
    info "Ejecutando: $PKG run lint"
    if $PKG run lint; then
      ok "Lint OK"
    else
      fail "Lint fallido"
      EXIT_CODE=1
    fi
  else
    warn "El proyecto no declara un script 'lint' en package.json"
  fi

  if grep -q '"format:check"' package.json 2>/dev/null; then
    info "Ejecutando: $PKG run format:check"
    if $PKG run format:check; then
      ok "Formato OK"
    else
      fail "Formato fallido (arreglable con '$PKG run format')"
      EXIT_CODE=1
    fi
  else
    warn "El proyecto no declara un script 'format:check' en package.json"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 6. Ejecución de tests (depende del stack)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── 6. Ejecutando tests ─────────────────────────────────"

if [ -z "$TEST_CMD" ]; then
  warn "No hay comando de tests configurado para el stack '$STACK'"
  warn "Esto es OK al inicio del proyecto. Cuando añadas tests, edita esta sección."
else
  info "Ejecutando: $TEST_CMD"
  if eval "$TEST_CMD"; then
    ok "Todos los tests pasan"
  else
    fail "Hay tests rotos"
    EXIT_CODE=1
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 7. Resumen
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── 7. Resumen ──────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Entorno listo. Puedes empezar a trabajar."
else
  fail "Entorno NO está listo. Resuelve los errores antes de avanzar."
fi

exit $EXIT_CODE
