import { findDangerousQuery, isReadOnlyQuery } from './query-policy';

describe('findDangerousQuery', () => {
  it.each([
    'DROP DATABASE db_mercadeo',
    'drop table if exists `users`;',
    'TRUNCATE TABLE logs',
    'DELETE FROM users',
    'delete from users limit 10',
    'UPDATE users SET active = 0',
    "UPDATE users SET note = 'where'",
    'ALTER TABLE users DROP COLUMN email',
    'GRANT ALL ON *.* TO x',
    "CREATE USER 'a'@'%' IDENTIFIED BY 'b'",
    '/* limpieza */ DROP VIEW v_ventas',
    "SELECT * FROM t INTO OUTFILE '/tmp/x'",
  ])('pide confirmación: %s', sql => {
    expect(findDangerousQuery(sql)).not.toBeNull();
  });

  it.each([
    'SELECT * FROM users',
    "SELECT 'drop table users' AS texto",
    'DELETE FROM users WHERE id = 3',
    'update users set active = 0 where id in (1, 2)',
    '-- DROP TABLE users\nSELECT 1',
    'SELECT `drop` FROM t',
    'INSERT INTO logs (msg) VALUES ("truncate")',
    'ALTER TABLE users ADD COLUMN phone VARCHAR(20)',
  ])('no pide confirmación: %s', sql => {
    expect(findDangerousQuery(sql)).toBeNull();
  });
});

describe('findDangerousQuery (PostgreSQL)', () => {
  it.each([
    'DROP SCHEMA reporting CASCADE',
    'DROP MATERIALIZED VIEW mv_ventas',
    'DROP EXTENSION pgcrypto',
    'ALTER TABLE users RENAME COLUMN email TO correo',
    'ALTER ROLE app WITH SUPERUSER',
    "COPY users TO '/tmp/users.csv'",
    "COPY users FROM PROGRAM 'curl http://x'",
    'SELECT pg_terminate_backend(1234)',
    'WITH borrados AS (DELETE FROM logs RETURNING *) SELECT count(*) FROM borrados',
    'TRUNCATE users RESTART IDENTITY',
  ])('pide confirmación: %s', sql => {
    expect(findDangerousQuery(sql, 'postgresql')).not.toBeNull();
  });

  it.each([
    'SELECT 5 # 3 AS xor',
    'COPY users TO STDOUT',
    "CREATE FUNCTION f() RETURNS void AS $$ DELETE FROM logs $$ LANGUAGE sql",
    'SELECT "drop" FROM t',
    'WITH x AS (DELETE FROM logs WHERE id < 10 RETURNING *) SELECT * FROM x',
    'UPDATE users SET active = false WHERE id = 1',
  ])('no pide confirmación: %s', sql => {
    expect(findDangerousQuery(sql, 'postgresql')).toBeNull();
  });
});

describe('isReadOnlyQuery', () => {
  it.each([
    'SELECT * FROM users',
    "select replace(name, 'a', 'b') from users;",
    'WITH t AS (SELECT 1) SELECT * FROM t',
    'SHOW TABLES',
    'DESCRIBE users',
    'EXPLAIN SELECT * FROM users',
    'SELECT * FROM users FOR UPDATE',
    "SELECT 'insert into' AS txt",
  ])('se puede exportar: %s', sql => {
    expect(isReadOnlyQuery(sql)).toBe(true);
  });

  it.each([
    'INSERT INTO users (name) VALUES (1)',
    'UPDATE users SET a = 1 WHERE id = 1',
    'DELETE FROM users WHERE id = 1',
    'SELECT * INTO backup FROM users',
    "SELECT * FROM users INTO OUTFILE '/tmp/x'",
    'WITH x AS (DELETE FROM logs RETURNING *) SELECT * FROM x',
    'EXPLAIN ANALYZE DELETE FROM users',
    'CALL limpiar()',
  ])('no se repite al exportar: %s', sql => {
    expect(isReadOnlyQuery(sql, 'postgresql')).toBe(false);
  });
});
