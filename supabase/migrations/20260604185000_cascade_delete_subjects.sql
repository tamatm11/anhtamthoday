DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT
            tc.table_schema,
            tc.table_name,
            tc.constraint_name,
            kcu.column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND rc.unique_constraint_name IN (
              SELECT constraint_name
              FROM information_schema.table_constraints
              WHERE table_name = 'subjects' AND table_schema = 'public' AND constraint_type = 'PRIMARY KEY'
          )
    LOOP
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I;', r.table_schema, r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.subjects(code) ON DELETE CASCADE;', r.table_schema, r.table_name, r.constraint_name, r.column_name);
    END LOOP;
END;
$$;
