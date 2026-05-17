"use client";

import { useState, Fragment } from "react";
import styles from "./project-detail.module.css";

type ChecklistRow = {
  id: string;
  item: string;
  done: boolean;
  by: string;
  date: string;
  note: string;
};

type ChecklistSection = {
  id: string;
  name: string;
  rows: ChecklistRow[];
};

let _uid = 0;
function uid() { return `r${++_uid}`; }

const DEFAULT_SECTIONS: ChecklistSection[] = [
  {
    id: "s1",
    name: "Structural Works",
    rows: [
      { id: uid(), item: "Footing excavation to required depth", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "PCC M10 laid to correct level", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "Footing reinforcement per drawing", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "Footing concrete M25 poured", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "GF column reinforcement check", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "GF column concrete M25 — all columns", done: false, by: "", date: "", note: "" },
    ],
  },
  {
    id: "s2",
    name: "GF Slab Works",
    rows: [
      { id: uid(), item: "Shuttering for GF slab erected", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "Slab reinforcement (top + bottom) checked", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "Concrete M25 poured and levelled", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "Curing started — 28-day schedule", done: false, by: "", date: "", note: "" },
    ],
  },
  {
    id: "s3",
    name: "Safety & Site",
    rows: [
      { id: uid(), item: "Safety signage installed", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "Scaffolding inspection logged", done: false, by: "", date: "", note: "" },
      { id: uid(), item: "PPE compliance — all workers", done: false, by: "", date: "", note: "Helmet & vest only, boots missing" },
    ],
  },
];

export default function SiteChecklistCard({ canEdit }: { canEdit: boolean }) {
  const [sections, setSections] = useState<ChecklistSection[]>(DEFAULT_SECTIONS);
  const [editMode, setEditMode] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({});
  const showEdit = canEdit && editMode;

  const allRows = sections.flatMap(s => s.rows);
  const done = allRows.filter(r => r.done).length;
  const total = allRows.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  function toggle(sectionId: string, rowId: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      rows: s.rows.map(r => r.id !== rowId ? r : {
        ...r,
        done: !r.done,
        by: !r.done ? "Verified" : "",
        date: !r.done ? new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "",
      }),
    }));
  }

  function updateNote(sectionId: string, rowId: string, val: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      rows: s.rows.map(r => r.id !== rowId ? r : { ...r, note: val }),
    }));
  }

  function updateItem(sectionId: string, rowId: string, val: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      rows: s.rows.map(r => r.id !== rowId ? r : { ...r, item: val }),
    }));
  }

  function deleteRow(sectionId: string, rowId: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      rows: s.rows.filter(r => r.id !== rowId),
    }));
  }

  function addRowToSection(sectionId: string) {
    const item = (newItemInputs[sectionId] ?? "").trim();
    if (!item) return;
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      rows: [...s.rows, { id: uid(), item, done: false, by: "", date: "", note: "" }],
    }));
    setNewItemInputs(prev => ({ ...prev, [sectionId]: "" }));
  }

  function insertRowAfter(sectionId: string, rowId: string) {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const idx = s.rows.findIndex(r => r.id === rowId);
      const newRow: ChecklistRow = { id: uid(), item: "New item", done: false, by: "", date: "", note: "" };
      const rows = [...s.rows];
      rows.splice(idx + 1, 0, newRow);
      return { ...s, rows };
    }));
  }

  function addSection() {
    if (!newSectionName.trim()) return;
    setSections(prev => [...prev, { id: uid(), name: newSectionName.trim(), rows: [] }]);
    setNewSectionName("");
    setShowAddSection(false);
  }

  const inputSm: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-line)",
    background: "var(--color-paper-light)", fontSize: 12, fontFamily: "inherit", outline: "none",
  };

  return (
    <div className={styles.executionCard}>
      <div className={styles.executionTableHeader}>
        <div>
          <div className={styles.executionTableTitle}>Site Execution Checklist</div>
          <div className={styles.executionTableSubtitle}>
            {total > 0 ? `${done} of ${total} items verified` : "No checklist items yet"}
          </div>
        </div>
        <div className={styles.executionActions}>
          {total > 0 && (
            <>
              <div className={styles.executionProgressTrack}>
                <div
                  className={styles.executionProgressFill}
                  style={{ width: `${pct}%`, background: "var(--color-teal)" }}
                />
              </div>
              <span className={styles.executionProgressText}>{pct}%</span>
            </>
          )}
          {canEdit && (
            <button
              onClick={() => { setEditMode(v => !v); if (editMode) { setShowAddSection(false); setNewItemInputs({}); } }}
              className={`${styles.executionGhostBtn} ${editMode ? styles.executionGhostBtnActive : ""}`}
              title={editMode ? "Exit edit mode" : "Edit checklist"}
              aria-label="Toggle edit mode"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
            </button>
          )}
          {showEdit && (
            <button
              onClick={() => setShowAddSection(v => !v)}
              className={`${styles.executionGhostBtn} ${showAddSection ? styles.executionGhostBtnActive : ""}`}
            >
              + Section
            </button>
          )}
        </div>
      </div>

      {showAddSection && showEdit && (
        <div className={styles.executionConfigPanel}>
          <input
            placeholder="Section name"
            value={newSectionName}
            onChange={e => setNewSectionName(e.target.value)}
            style={{ ...inputSm, flex: 1 }}
            onKeyDown={e => e.key === "Enter" && addSection()}
          />
          <button onClick={addSection} disabled={!newSectionName.trim()} style={{ padding: "6px 14px", borderRadius: 8, background: "var(--color-ink)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}>Add</button>
          <button onClick={() => setShowAddSection(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", fontSize: 12, cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div className={styles.executionTableFrame}>
        <div style={{ overflowX: "auto" }}>
          <table className={styles.executionTable}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 40, textAlign: "center" }}>Done</th>
                <th>Item</th>
                <th style={{ width: 110 }}>Verified By</th>
                <th style={{ width: 90 }}>Date</th>
                <th style={{ width: 220 }}>Site Note</th>
                {showEdit && <th style={{ width: 64 }} />}
              </tr>
            </thead>
            <tbody>
              {sections.map(section => (
                <Fragment key={section.id}>
                  <tr>
                    <td
                      colSpan={showEdit ? 7 : 6}
                      className={styles.executionSectionRow}
                    >
                      {section.name}
                      {showEdit && (
                        <button
                          onClick={() => setNewItemInputs(prev => ({ ...prev, [section.id]: prev[section.id] ?? "" }))}
                          style={{ marginLeft: 10, fontSize: 10, color: "var(--color-tan)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                        >
                          + item
                        </button>
                      )}
                    </td>
                  </tr>
                  {section.rows.map((row, ri) => (
                    <tr key={row.id}>
                      <td className={styles.executionIndexCell}>{ri + 1}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <div
                          onClick={() => canEdit && toggle(section.id, row.id)}
                          style={{
                            width: 20, height: 20, borderRadius: 6,
                            cursor: canEdit ? "pointer" : "default",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            border: `2px solid ${row.done ? "var(--color-teal)" : "var(--color-line)"}`,
                            background: row.done ? "var(--color-teal)" : "transparent",
                            transition: "all .15s",
                          }}
                        >
                          {row.done && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {showEdit ? (
                          <input
                            value={row.item}
                            onChange={e => updateItem(section.id, row.id, e.target.value)}
                            style={{
                              width: "100%", padding: "5px 8px", borderRadius: 6,
                              border: "1px solid transparent", fontSize: 12, fontFamily: "inherit",
                              outline: "none", background: "transparent",
                              textDecoration: row.done ? "line-through" : "none",
                              color: row.done ? "var(--color-tan)" : "var(--color-ink)",
                            }}
                            onFocus={e => (e.target.style.borderColor = "var(--color-line)")}
                            onBlur={e => (e.target.style.borderColor = "transparent")}
                          />
                        ) : (
                          <span style={{
                            fontSize: 12,
                            textDecoration: row.done ? "line-through" : "none",
                            color: row.done ? "var(--color-tan)" : "var(--color-ink)",
                          }}>
                            {row.item}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span className={styles.executionMono} style={{ fontSize: 12, color: "var(--color-tan)" }}>
                          {row.by || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span className={styles.executionMono} style={{ fontSize: 11, color: "var(--color-tan)" }}>
                          {row.date || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          value={row.note}
                          onChange={e => canEdit && updateNote(section.id, row.id, e.target.value)}
                          readOnly={!canEdit}
                          placeholder="Add site note…"
                          style={{
                            width: "100%", padding: "5px 8px", borderRadius: 6,
                            border: "1px solid transparent", fontSize: 12,
                            fontFamily: "inherit", outline: "none", background: "transparent",
                            color: "var(--color-ink)",
                          }}
                          onFocus={e => { if (canEdit) e.target.style.borderColor = "var(--color-line)"; }}
                          onBlur={e => (e.target.style.borderColor = "transparent")}
                        />
                      </td>
                      {showEdit && (
                        <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => insertRowAfter(section.id, row.id)}
                            style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)" }}
                            title="Insert row below"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          <button
                            onClick={() => deleteRow(section.id, row.id)}
                            style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)" }}
                            title="Delete row"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {showEdit && section.id in newItemInputs && (
                    <tr>
                      <td colSpan={7} style={{ padding: "6px 12px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            placeholder="New checklist item…"
                            value={newItemInputs[section.id] ?? ""}
                            onChange={e => setNewItemInputs(prev => ({ ...prev, [section.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && addRowToSection(section.id)}
                            style={{ ...inputSm, flex: 1 }}
                            autoFocus
                          />
                          <button onClick={() => addRowToSection(section.id)} style={{ padding: "6px 12px", borderRadius: 8, background: "var(--color-ink)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}>Add</button>
                          <button onClick={() => setNewItemInputs(prev => { const n = { ...prev }; delete n[section.id]; return n; })} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", fontSize: 12, cursor: "pointer" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={showEdit ? 7 : 6} className={styles.executionEmptyCell}>
                    No checklist items yet.{canEdit && " Click the pencil to start editing."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
