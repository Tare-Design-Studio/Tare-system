#!/usr/bin/env python3
"""
One-off: derive one customer per project from the project name and link it
(projects.customer_id). The client workbook has no customer contact fields, so
phone/email/address are left NULL for later fill-in.

Scope: only projects whose customer_id IS NULL (skips already-linked rows, e.g.
NIHARIKA). Idempotent — re-running only affects still-unlinked projects.

Customer name = project name with cleaned whitespace + Title Case (project names
are stored UPPERCASE/messy; customer records should read as names). The project
name IS the client here (projects are named after the client).

    python3 scripts/derive_customers.py            # dry run
    python3 scripts/derive_customers.py --commit    # apply
"""
import re
import sys
import psycopg2

ROOT = "/Users/muthanna/Documents/ARCHITECT_OS"
TENANT = "d4784db6-9a2d-4075-97b5-14daaa9026ab"
COMMIT = "--commit" in sys.argv


def load_env():
    env = {}
    for line in open(f"{ROOT}/.env"):
        m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$', line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


# Keep common all-caps abbreviations upper-cased instead of Title-casing them.
KEEP_UPPER = {"MGR", "M.G.R", "CESC", "JSS", "UOM", "KT", "HK", "JPW", "KNS", "MNK", "SIS"}


def to_customer_name(project_name):
    """Clean a project name into a human customer name."""
    name = re.sub(r'\s+', ' ', str(project_name).strip())
    parts = name.split(' ')
    out = []
    for p in parts:
        up = p.upper()
        if up in KEEP_UPPER or (p.isupper() and len(p) <= 3 and any(ch.isalpha() for ch in p)):
            out.append(up)
        else:
            # Title-case but preserve internal punctuation like hyphens/dots.
            out.append(re.sub(r'[A-Za-z]+', lambda mm: mm.group(0).capitalize(), p.lower()))
    return ' '.join(out)


def main():
    env = load_env()
    conn = psycopg2.connect(env["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "select id, slug, name, status from projects "
        "where tenant_id=%s and deleted_at is null and customer_id is null "
        "order by created_at", (TENANT,))
    projects = cur.fetchall()

    plan = [(pid, slug, name, status, to_customer_name(name)) for (pid, slug, name, status) in projects]

    print(f"\n{'='*72}\nDERIVE CUSTOMERS  (mode: {'COMMIT' if COMMIT else 'DRY RUN'})\n{'='*72}")
    print(f"projects needing a customer: {len(plan)}  (already-linked rows skipped)\n")
    print(f"{'customer name':32} {'<- project slug':30} status")
    for _pid, slug, _name, status, cust in plan[:20]:
        print(f"  {cust:32} {slug:30} {status}")
    print(f"  … ({max(0,len(plan)-20)} more)\n")

    if not COMMIT:
        print("DRY RUN — no writes. Re-run with --commit to apply.\n")
        cur.close(); conn.close()
        return

    created = 0
    for pid, _slug, _name, _status, cust in plan:
        cur.execute(
            "insert into customers (tenant_id, name) values (%s, %s) returning id",
            (TENANT, cust))
        cid = cur.fetchone()[0]
        cur.execute("update projects set customer_id=%s, updated_at=now() where id=%s", (cid, pid))
        created += 1
    conn.commit()
    print(f"✅ COMMITTED: created {created} customers, linked {created} projects.\n")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
