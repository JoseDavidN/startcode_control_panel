import { redactSecrets, stripSensitiveKeys } from './secret-redactor';

describe('redactSecrets', () => {
  it('oculta llaves privadas completas y cortadas', () => {
    const key = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----';
    expect(redactSecrets(`$ cat id\n${key}\n$`)).not.toContain('b3BlbnNzaC1rZXk');
    expect(redactSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEow')).not.toContain('MIIEow');
  });

  it.each([
    ['postgres://admin:s3cr3t@db:5432/app', 's3cr3t'],
    ["CREATE USER 'a'@'%' IDENTIFIED BY 'Cl4ve!'", 'Cl4ve!'],
    ["ALTER USER x WITH PASSWORD 'p4ss'", 'p4ss'],
    ['PGPASSWORD=hunter2 psql -h db', 'hunter2'],
    ['DB_PASSWORD: hunter2', 'hunter2'],
    ['mysql -u root -pS3cret db', 'S3cret'],
    ['mysqldump --password=S3cret db', 'S3cret'],
    ['sshpass -p S3cret ssh host', 'S3cret'],
    ['export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvwxyz'],
    ['root:$6$saltsalt$abcdefghijklmnopqrstuvwxyz0123:19000', 'abcdefghijklmnopqrstuvwxyz0123'],
    ['curl -H "Authorization: Bearer abcDEF123456ghiJKL" https://x', 'abcDEF123456ghiJKL'],
    ['Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA=='],
    ['curl -u admin:S3cretPass https://x', 'S3cretPass'],
    ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
    ['aws_access AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
    ['git clone https://ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/x', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['SLACK xoxb-123456789012-abcdefghij', 'xoxb-123456789012-abcdefghij'],
  ])('oculta el secreto de %s', (text, secret) => {
    expect(redactSecrets(text)).not.toContain(secret);
  });

  it('respeta el texto sin secretos', () => {
    const text = 'Filesystem Size Used\n/dev/sda1 40G 12G\nmysql -u root -p\nToken generado correctamente con Basic auth';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('stripSensitiveKeys', () => {
  it('quita campos con nombre de secreto a cualquier profundidad', () => {
    const out = stripSensitiveKeys({ name: 'db', passwordEnc: 'x', nested: [{ privateKey: 'k', host: 'h' }] });
    expect(out).toEqual({ name: 'db', nested: [{ host: 'h' }] });
  });
});
