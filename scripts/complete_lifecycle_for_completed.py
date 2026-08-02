#!/usr/bin/env python3
"""
One-off: for every completed project, ensure the "Standard Architectural Lifecycle"
milestone set exists and mark all its milestones complete.

Per owner decision:
  - Projects with 0 checkpoints -> apply the template via apply_checkpoint_template RPC
    (8 milestones). Projects that already have checkpoints keep theirs (no duplicate set).
  - Every checkpoint on a completed project is marked fully complete:
    started_at = completed_at = approved_at = project.start_date, completion_percentage=100,
    approved_by = owner.

The enforce_checkpoint_progression() trigger fires BEFORE UPDATE and requires
sequential completion (earlier milestone approved before a later one starts). We
therefore UPDATE each project's checkpoints in sequence_order (1..N), committing per
project, so the trigger is satisfied naturally and the audit trigger stays intact.

    python3 scripts/complete_lifecycle_for_completed.py            # dry run
    python3 scripts/complete_lifecycle_for_completed.py --commit    # apply
"""
import re
import sys
import psycopg2

ROOT = "/Users/muthanna/Documents/ARCHITECT_OS"
TENANT = "d4784db6-9a2d-4075-97b5-14daaa9026ab"
TEMPLATE_NAME = "Standard Architectural Lifecycle"
COMMIT = "--commit" in sys.argv


def load_env():
    env = {}
    for line in open(f"{ROOT}/.env"):
        m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$', line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def main():
    env = load_env()
    conn = psycopg2.connect(env["DATABASE_URL"])
    cur = conn.cursor()

    cur.execute("select id from checkpoint_templates where tenant_id=%s and name=%s",
                (TENANT, TEMPLATE_NAME))
    template_id = cur.fetchone()[0]
    cur.execute("select id from users where tenant_id=%s and role='owner' and deleted_at is null",
                (TENANT,))
    owner_id = cur.fetchone()[0]

    cur.execute(
        "select id, slug, start_date from projects "
        "where tenant_id=%s and status='completed' and deleted_at is null order by created_at",
        (TENANT,))
    projects = cur.fetchall()

    # existing checkpoint counts
    cur.execute(
        "select pc.project_id, count(*) from project_checkpoints pc "
        "join projects p on p.id=pc.project_id "
        "where p.tenant_id=%s and p.status='completed' group by pc.project_id", (TENANT,))
    existing = dict(cur.fetchall())

    to_apply = [p for p in projects if existing.get(p[0], 0) == 0]
    already = [p for p in projects if existing.get(p[0], 0) > 0]

    print(f"\n{'='*72}\nCOMPLETE LIFECYCLE FOR COMPLETED PROJECTS  (mode: {'COMMIT' if COMMIT else 'DRY RUN'})\n{'='*72}")
    print(f"completed projects: {len(projects)}")
    print(f"  -> apply template (0 existing checkpoints): {len(to_apply)}")
    print(f"  -> already have checkpoints (kept, marked complete): {len(already)}  "
          f"{[p[1] for p in already]}")
    print(f"template: {TEMPLATE_NAME} ({template_id})  approver: owner {owner_id}")
    print(f"each milestone -> started_at=completed_at=approved_at=<project.start_date>, "
          f"completion_percentage=100\n")

    if not COMMIT:
        # show what the first couple would look like
        for pid, slug, sd in projects[:3]:
            print(f"  {slug:34} start={sd}  "
                  f"{'APPLY 8 + complete' if existing.get(pid,0)==0 else f'complete {existing[pid]} existing'}")
        print(f"  … ({len(projects)-3} more)")
        print("\nDRY RUN — no writes. Re-run with --commit to apply.\n")
        cur.close(); conn.close()
        return

    applied = 0
    completed_ckpts = 0
    for pid, slug, sd in projects:
        if existing.get(pid, 0) == 0:
            cur.execute("select apply_checkpoint_template(%s, %s, %s)", (pid, template_id, sd))
            applied += 1
        # fetch this project's checkpoints in sequence order, complete each (trigger-safe)
        cur.execute(
            "select id from project_checkpoints where project_id=%s order by sequence_order", (pid,))
        for (cid,) in cur.fetchall():
            cur.execute(
                "update project_checkpoints set "
                "started_at=%s, completed_at=%s, approved_at=%s, approved_by=%s, "
                "completion_percentage=100 "
                "where id=%s and approved_at is null",
                (sd, sd, sd, owner_id, cid))
            completed_ckpts += cur.rowcount
        conn.commit()

    print(f"✅ COMMITTED: applied template to {applied} projects; "
          f"marked {completed_ckpts} milestones complete across {len(projects)} completed projects.\n")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
