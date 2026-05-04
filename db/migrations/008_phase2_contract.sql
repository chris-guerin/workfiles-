-- 008_phase2_contract.sql
-- Per /docs/SCHEMA_V3.md section 3.1 + 9 (Phase 2):
-- BEFORE INSERT/UPDATE trigger that enforces the value-type contract on
-- component_attributes. PG CHECK constraints can't reference other tables
-- via subquery, so this is implemented as a trigger function.
--
-- Contract:
--   - value_status != 'populated'                 -> allow (no enforcement)
--   - value_type   = 'numeric'                    -> require value_numeric IS NOT NULL AND as_of_date IS NOT NULL
--   - value_type   = 'categorical'                -> require value_categorical IS NOT NULL
--   - value_type   = 'controlled_vocab'           -> require value_controlled_vocab_id IS NOT NULL
--   - value_type   = 'text'                       -> require value_text IS NOT NULL
-- Violations raise EXCEPTION with a clear message naming the violation.
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION enforce_value_type_contract()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
BEGIN
  -- Only enforce for populated rows. pending / not_in_source /
  -- not_applicable / pending_analyst_review fall through.
  IF NEW.value_status IS DISTINCT FROM 'populated' THEN
    RETURN NEW;
  END IF;

  SELECT value_type INTO v_type
  FROM attribute_definitions
  WHERE id = NEW.attribute_def_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'value_type_contract: attribute_def_id=% has no value_type in attribute_definitions',
      NEW.attribute_def_id;
  END IF;

  IF v_type = 'numeric' THEN
    IF NEW.value_numeric IS NULL THEN
      RAISE EXCEPTION 'value_type_contract: attribute_def_id=% (value_type=numeric) requires value_numeric IS NOT NULL when value_status=populated',
        NEW.attribute_def_id;
    END IF;
    IF NEW.as_of_date IS NULL THEN
      RAISE EXCEPTION 'value_type_contract: attribute_def_id=% (value_type=numeric) requires as_of_date IS NOT NULL when value_status=populated',
        NEW.attribute_def_id;
    END IF;

  ELSIF v_type = 'categorical' THEN
    IF NEW.value_categorical IS NULL THEN
      RAISE EXCEPTION 'value_type_contract: attribute_def_id=% (value_type=categorical) requires value_categorical IS NOT NULL when value_status=populated',
        NEW.attribute_def_id;
    END IF;

  ELSIF v_type = 'controlled_vocab' THEN
    IF NEW.value_controlled_vocab_id IS NULL THEN
      RAISE EXCEPTION 'value_type_contract: attribute_def_id=% (value_type=controlled_vocab) requires value_controlled_vocab_id IS NOT NULL when value_status=populated',
        NEW.attribute_def_id;
    END IF;

  ELSIF v_type = 'text' THEN
    IF NEW.value_text IS NULL THEN
      RAISE EXCEPTION 'value_type_contract: attribute_def_id=% (value_type=text) requires value_text IS NOT NULL when value_status=populated',
        NEW.attribute_def_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'value_type_contract: unknown value_type=% for attribute_def_id=%',
      v_type, NEW.attribute_def_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_enforce_value_type_contract ON component_attributes;
CREATE TRIGGER tr_enforce_value_type_contract
  BEFORE INSERT OR UPDATE ON component_attributes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_value_type_contract();
