// Read the database's persistent setting, never current_setting(): a session
// option or role default must not override a recovery hold. Any value holds.
export const recoveryHoldSetting = "jitm.recovery_hold";
export const recoveryHoldQuery = `
  SELECT setting AS value
  FROM pg_catalog.pg_db_role_setting s
  JOIN pg_catalog.pg_database d ON d.oid=s.setdatabase
  CROSS JOIN LATERAL unnest(s.setconfig) AS setting
  WHERE d.datname=current_database() AND s.setrole=0
    AND split_part(setting, '=', 1)='jitm.recovery_hold'
  LIMIT 2`;
