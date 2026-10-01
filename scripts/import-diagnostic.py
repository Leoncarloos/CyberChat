"""Carga en diagnostic_results los diagnósticos (pre-test) registrados en un Excel.

Uso:
  python scripts/import-diagnostic.py <archivo.xlsx>           # simulación, no escribe nada
  python scripts/import-diagnostic.py <archivo.xlsx> --apply   # inserta y marca diagnostic_done

El Excel sigue la plantilla plantilla_diagnostico: correo, fecha del test y aciertos
(0-2) por cada uno de los 8 temas; la clave del tema va entre paréntesis en el encabezado.
"""

import importlib.util
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
TOPICS = ["phishing", "ia_amenazas", "canales_venta", "contrasenas",
          "accesos", "ley_29733", "datos_sensibles", "resiliencia"]
QUESTIONS_PER_TOPIC = 2

_spec = importlib.util.spec_from_file_location("import_users", ROOT / "scripts" / "import-users.py")
_users = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_users)


def rest(env, method, path, body=None):
    req = urllib.request.Request(
        f"{env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')}/rest/v1/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or "null")


def read_rows(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    header = [str(c or "").strip() for c in rows[0]]
    email_col = next(i for i, h in enumerate(header) if h.lower().startswith("correo"))
    date_col = next(i for i, h in enumerate(header) if h.lower().startswith("fecha"))
    topic_cols = {}
    for i, h in enumerate(header):
        m = re.search(r"\(([a-z0-9_]+)\)\s*$", h)
        if m and m.group(1) in TOPICS:
            topic_cols[m.group(1)] = i
    missing = set(TOPICS) - set(topic_cols)
    if missing:
        sys.exit(f"Faltan columnas de temas: {', '.join(sorted(missing))}")

    out = []
    for n, r in enumerate(rows[1:], start=2):
        email = str(r[email_col] or "").strip().lower()
        if not email:
            continue
        values = [r[topic_cols[t]] for t in TOPICS]
        if all(v is None for v in values):
            out.append({"row": n, "email": email, "skip": "sin resultados"})
            continue
        bad = [t for t, v in zip(TOPICS, values)
               if not isinstance(v, (int, float)) or v not in range(QUESTIONS_PER_TOPIC + 1)]
        if bad:
            out.append({"row": n, "email": email, "skip": f"valores inválidos en {', '.join(bad)}"})
            continue
        date = r[date_col]
        if isinstance(date, datetime):
            # Mediodía en Lima para que la fecha no se corra de día al verla en UTC.
            completed_at = date.strftime("%Y-%m-%dT12:00:00-05:00")
        else:
            completed_at = datetime.now().astimezone().isoformat()
        topics = {t: {"correct": int(v), "total": QUESTIONS_PER_TOPIC} for t, v in zip(TOPICS, values)}
        out.append({
            "row": n,
            "email": email,
            "score": sum(int(v) for v in values),
            "topics": topics,
            "completed_at": completed_at,
        })
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    apply = "--apply" in sys.argv
    env = _users.load_env()

    users = {(u.get("email") or "").lower(): u for u in _users.existing_users(env)}
    done = {r["user_id"] for r in (rest(env, "GET", "diagnostic_results?select=user_id") or [])}

    loaded = skipped = failed = 0
    for item in read_rows(sys.argv[1]):
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
        if user["id"] in done:
            print(f"OMITIDO  {label} (ya tiene diagnóstico)")
            skipped += 1
            continue
        detail = f"{item['score']:>2}/{len(TOPICS) * QUESTIONS_PER_TOPIC}  {item['completed_at'][:10]}"
        if not apply:
            print(f"CARGARÍA {label}  {detail}")
            continue
        try:
            rest(env, "POST", "diagnostic_results", {
                "user_id": user["id"],
                "score": item["score"],
                "total": len(TOPICS) * QUESTIONS_PER_TOPIC,
                "topics_performance": item["topics"],
                "completed_at": item["completed_at"],
            })
            meta = {**(user.get("app_metadata") or {}), "diagnostic_done": True}
            _users.request(env, "PUT", f"users/{user['id']}", {"app_metadata": meta})
            print(f"CARGADO  {label}  {detail}")
            loaded += 1
            done.add(user["id"])
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
