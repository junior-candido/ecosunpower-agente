import { describe, it, expect, vi } from 'vitest';

const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'uuid-1', phone: '5561999999999' }, error: null });
const mockEq = vi.fn().mockReturnValue({
  single: mockSingle,
  order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ data: [], error: null }) }),
});
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, single: mockSingle });

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) }),
      select: mockSelect,
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      upsert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) }),
    })),
  })),
}));

describe('SupabaseService', () => {
  it('should create an instance', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService({
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceKey: 'key',
    });
    expect(service).toBeDefined();
  });

  it('should have all required methods', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService({
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceKey: 'key',
    });
    expect(typeof service.upsertLead).toBe('function');
    expect(typeof service.getLeadByPhone).toBe('function');
    expect(typeof service.getOrCreateConversation).toBe('function');
    expect(typeof service.updateConversation).toBe('function');
    expect(typeof service.saveDossier).toBe('function');
    expect(typeof service.logEvent).toBe('function');
  });
});
