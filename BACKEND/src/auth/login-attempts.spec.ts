import { ACCOUNT_POLICY, LoginAttempts, type AttemptPolicy } from '@auth/login-attempts';

describe('LoginAttempts', () => {
  let now = 0;
  const clock = () => now;
  const policy: AttemptPolicy = { max: 3, windowMs: 60_000, lockMs: 120_000 };

  beforeEach(() => {
    now = 1_000_000;
  });

  it('bloquea al llegar al máximo de fallos y desbloquea al pasar el tiempo', () => {
    const attempts = new LoginAttempts(clock);
    expect(attempts.fail('k', policy).locked).toBe(false);
    expect(attempts.fail('k', policy).locked).toBe(false);
    expect(attempts.fail('k', policy).locked).toBe(true);
    expect(attempts.lockedFor('k')).toBe(120_000);

    now += 120_001;
    expect(attempts.lockedFor('k')).toBe(0);
  });

  it('aplica un retardo progresivo con tope', () => {
    const attempts = new LoginAttempts(clock);
    const delays = [1, 2, 3, 4].map(() => attempts.fail('k', ACCOUNT_POLICY).delayMs);
    expect(delays).toEqual([0, 250, 500, 1000]);
    expect(attempts.fail('k', ACCOUNT_POLICY)).toEqual({ delayMs: 4000, locked: true });
  });

  it('reinicia la cuenta cuando vence la ventana', () => {
    const attempts = new LoginAttempts(clock);
    attempts.fail('k', policy);
    attempts.fail('k', policy);
    now += 60_001;
    expect(attempts.fail('k', policy).locked).toBe(false);
  });

  it('clear borra los fallos de la clave', () => {
    const attempts = new LoginAttempts(clock);
    attempts.fail('k', policy);
    attempts.fail('k', policy);
    attempts.clear('k');
    expect(attempts.fail('k', policy).locked).toBe(false);
  });

  it('hit deja pasar hasta el máximo y luego niega', () => {
    const attempts = new LoginAttempts(clock);
    expect(attempts.hit('r', policy)).toBe(true);
    expect(attempts.hit('r', policy)).toBe(true);
    expect(attempts.hit('r', policy)).toBe(false);
    expect(attempts.hit('r', policy)).toBe(false);
  });

  it('no crece sin límite al rociar claves', () => {
    const attempts = new LoginAttempts(clock, 100);
    for (let i = 0; i < 1000; i++) attempts.fail(`acct:${i}@x.co`, policy);
    expect(attempts.size).toBeLessThanOrEqual(100);
  });
});
