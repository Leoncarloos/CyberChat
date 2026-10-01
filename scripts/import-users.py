"""Crea en Supabase Auth los dueños y empleados listados en un Excel de encuestados.

Uso:
  python scripts/import-users.py <archivo.xlsx>           # simulación, no crea nada
  python scripts/import-users.py <archivo.xlsx> --apply   # crea los usuarios

Columnas esperadas: Empresa, RUC, Tipo de Perfil, Nombres y Apellidos,
Cargo / Rol, Correo Electrónico, Celular, Contraseña.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = {
    "empresa": "company",
    "ruc": "ruc",
    "tipo de perfil": "profile",
    "nombres y apellidos": "name",
    "cargo / rol": "position",
    "correo electrónico": "email",
    "celular": "phone",
    "contraseña": "password",
}


def load_env():
    env = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def read_rows(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    rows = [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
    header_idx = next(
        i for i, r in enumerate(rows)
        if any(str(c or "").strip().lower() == "correo electrónico" for c in r)
    )
    headers = [COLUMNS.get(str(c or "").strip().lower()) for c in rows[header_idx]]
    missing = set(COLUMNS.values()) - set(headers)
    if missing:
        sys.exit(f"Faltan columnas en el Excel: {', '.join(sorted(missing))}")
    return [
        {h: str(v).strip() if v is not None else "" for h, v in zip(headers, r) if h}
        for r in rows[header_idx + 1:]
    ]


def split_name(full_name):
    # Nombres y apellidos vienen juntos; se asumen los dos últimos términos como apellidos.
    parts = full_name.split()
    if len(parts) <= 2:
        return parts[0] if parts else "", " ".join(parts[1:])
    return " ".join(parts[:-2]), " ".join(parts[-2:])


def build_user(row, now):
    is_admin = "admin" in row["profile"].lower() or "dueñ" in row["profile"].lower()
    first_name, last_name = split_name(row["name"])
    # Rol, RUC y estado van en app_metadata: user_metadata lo puede editar el usuario.
    claims = {"role": "admin" if is_admin else "employee", "ruc": row["ruc"], "approval_status": "active"}
    if is_admin:
        metadata = {
            "account_type": "company_admin",
            "business_name": row["company"],
            "trade_name": row["company"],
            "owner_name": row["name"],
            "phone": row["phone"],
            "registered_at": now,
        }
    else:
        metadata = {
            "account_type": "company_employee",
            "first_name": first_name,
            "last_name": last_name,
            "full_name": row["name"],
            "position": row["position"],
            "phone": row["phone"],
            "registered_at": now,
        }
    return {
        "email": row["email"].lower(),
        "password": row["password"],
        "email_confirm": True,
        "app_metadata": claims,
        "user_metadata": metadata,
    }


def request(env, method, path, body=None):
    req = urllib.request.Request(
        f"{env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')}/auth/v1/admin/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or "{}")


def existing_users(env):
    users, page = [], 1
    while True:
        batch = request(env, "GET", f"users?page={page}&per_page=1000").get("users", [])
        users.extend(batch)
        if len(batch) < 1000:
            return users
        page += 1


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    apply = "--apply" in sys.argv
    env = load_env()
    now = datetime.now(timezone.utc).isoformat()

    users = [build_user(r, now) for r in read_rows(sys.argv[1]) if r.get("email")]
    # Los dueños van primero para que cada RUC ya tenga admin cuando entren sus empleados.
    users.sort(key=lambda u: u["app_metadata"]["role"] != "admin")

    current = existing_users(env)
    emails = {(u.get("email") or "").lower() for u in current}
    admin_rucs = {
        (u.get("app_metadata") or {}).get("ruc")
        for u in current if (u.get("app_metadata") or {}).get("role") == "admin"
    }

    created = skipped = failed = 0
    for user in users:
        meta = user["app_metadata"]
        label = f"{meta['role']:<8} {meta['ruc']}  {user['email']}"
        if user["email"] in emails:
            print(f"OMITIDO  {label} (ya existe)")
            skipped += 1
            continue
        if meta["role"] == "admin" and meta["ruc"] in admin_rucs:
            print(f"OMITIDO  {label} (ya hay un admin con ese RUC)")
            skipped += 1
            continue
        if not apply:
            print(f"CREARÍA  {label}")
            continue
        try:
            request(env, "POST", "users", user)
            print(f"CREADO   {label}")
            created += 1
            emails.add(user["email"])
            if meta["role"] == "admin":
                admin_rucs.add(meta["ruc"])
        except urllib.error.HTTPError as e:
            print(f"ERROR    {label}: {e.read().decode(errors='replace')}")
            failed += 1

    if apply:
        print(f"\nCreados: {created} · Omitidos: {skipped} · Errores: {failed}")
    else:
        print(f"\nSimulación: {len(users) - skipped} por crear, {skipped} omitidos. Usa --apply para crearlos.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
