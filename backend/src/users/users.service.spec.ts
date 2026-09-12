import { UsersService } from './users.service';

describe('UsersService', () => {
  it('reuses the profile created by a concurrent first-login request', async () => {
    const profile = {
      id: 'app-user-1',
      auth_user_id: '00000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
      display_name: 'user',
      role: 'operacional',
      active: true,
      created_at: '2026-09-12T00:00:00.000Z',
      updated_at: '2026-09-12T00:00:00.000Z',
    };

    const from = jest
      .fn()
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: '23505', message: 'duplicate key value' },
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: profile, error: null }),
          }),
        }),
      });

    const service = new UsersService({ admin: { from } } as any);

    await expect(service.ensureAppUser({
      id: profile.auth_user_id,
      email: profile.email,
      claims: {},
    })).resolves.toEqual(profile);
  });
});
