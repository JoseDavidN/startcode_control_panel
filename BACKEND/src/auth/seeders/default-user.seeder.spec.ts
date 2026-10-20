import { isAcceptableAdminPassword } from '@auth/seeders/default-user.seeder';

describe('isAcceptableAdminPassword', () => {
  it.each([undefined, '', 'Admin123!', 'cambia_esta_password', 'corta1!', 'sinmayuscula1!'])('rechaza %p', password => {
    expect(isAcceptableAdminPassword(password)).toBe(false);
  });

  it('acepta una contraseña fuerte', () => {
    expect(isAcceptableAdminPassword('Xk9!rTq2#mVz')).toBe(true);
  });
});
