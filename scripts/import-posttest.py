"""Carga como post-test los resultados registrados en un Excel (misma plantilla que el diagnóstico).

Uso:
  python scripts/import-posttest.py <archivo.xlsx>           # simulación, no escribe nada
  python scripts/import-posttest.py <archivo.xlsx> --apply   # inserta en quiz_results + evaluation_attempts

No se registra seen_questions: el Excel no dice qué preguntas del banco le tocaron a cada uno.
"""

import importlib.util
import sys
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location("import_diagnostic", ROOT / "scripts" / "import-diagnostic.py")
_diag = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_diag)
_users = _diag._users


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    apply = "--apply" in sys.argv
    env = _users.load_env()
    total = len(_diag.TOPICS) * _diag.QUESTIONS_PER_TOPIC

    users = {(u.get("email") or "").lower(): u for u in _users.existing_users(env)}
    with_diag = {r["user_id"] for r in (_diag.rest(env, "GET", "diagnostic_results?select=user_id") or [])}
    with_attempt = {r["user_id"] for r in (_diag.rest(env, "GET", "evaluation_attempts?select=user_id") or [])}

    loaded = skipped = failed = 0
    for item in _diag.read_rows(sys.argv[1]):
        label = f"fila {item['row']:>3}  {item['email']}"
        if "skip" in item:
            print(f"OMITIDO  {label} ({item['skip']})")
            skipped += 1
            continue
        user = users.get(item["email"])
        if not user:
            print(f"OMITIDO  {label} (no existe en Supabase)")
            skipped += 1
            continue
        if user["id"] not in with_diag:
            print(f"OMITIDO  {label} (no tiene diagnóstico)")
            skipped += 1
            continue
        # Con intentos previos ya no sería su post-test sino una recurrente.
        if user["id"] in with_attempt:
            print(f"OMITIDO  {label} (ya tiene post-test)")
            skipped += 1
            continue
        detail = f"{item['score']:>2}/{total}  {item['completed_at'][:10]}"
        if not apply:
            print(f"CARGARÍA {label}  {detail}")
            continue
        try:
            _diag.rest(env, "POST", "quiz_results", {
                "user_id": user["id"],
                "score": item["score"],
                "total": total,
                "taken_at": item["completed_at"],
            })
            _diag.rest(env, "POST", "evaluation_attempts", {
                "user_id": user["id"],
                "test_type": "posttest",
                "score": item["score"],
                "total": total,
                "topics_performance": item["topics"],
                "taken_at": item["completed_at"],
            })
            print(f"CARGADO  {label}  {detail}")
            loaded += 1
            with_attempt.add(user["id"])
        except urllib.error.HTTPError as e:
            print(f"ERROR    {label}: {e.read().decode(errors='replace')}")
            failed += 1

    if apply:
        print(f"\nCargados: {loaded} · Omitidos: {skipped} · Errores: {failed}")
    else:
        print(f"\nSimulación: {skipped} omitidos. Usa --apply para cargar el resto.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
