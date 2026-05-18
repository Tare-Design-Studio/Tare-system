-- Project table columns · support inserting/deleting columns at a position
-- Make the (project_table_id, display_order) unique constraint deferrable so a
-- bulk +1/-1 shift does not transiently collide while renumbering.

ALTER TABLE project_table_columns
  DROP CONSTRAINT project_table_columns_project_table_id_display_order_key,
  ADD CONSTRAINT project_table_columns_project_table_id_display_order_key
    UNIQUE (project_table_id, display_order) DEFERRABLE INITIALLY IMMEDIATE;

-- Shift columns after a given display_order up by 1, to open a slot for an
-- inserted column. Constraint is checked at statement end (deferrable).
CREATE OR REPLACE FUNCTION shift_table_columns_after(p_table_id uuid, p_after_order int)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE project_table_columns
  SET display_order = display_order + 1
  WHERE project_table_id = p_table_id AND display_order > p_after_order;
$$;

-- Delete a column and close the gap by shifting later columns down by 1.
CREATE OR REPLACE FUNCTION delete_table_column(p_table_id uuid, p_column_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order int;
BEGIN
  DELETE FROM project_table_columns
  WHERE id = p_column_id AND project_table_id = p_table_id
  RETURNING display_order INTO v_order;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  UPDATE project_table_columns
  SET display_order = display_order - 1
  WHERE project_table_id = p_table_id AND display_order > v_order;
END;
$$;
