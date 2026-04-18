interface HealthCheckers {
  redis: () => Promise<boolean>;
  supabase: () => Promise<boolean>;
  evolution: () => Promise<boolean>;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    redis: 'up' | 'down';
    supabase: 'up' | 'down';
    evolution: 'up' | 'down';
  };
}

export async function buildHealthStatus(checkers: HealthCheckers): Promise<HealthStatus> {
  const [redis, supabase, evolution] = await Promise.all([
    checkers.redis().catch(() => false),
    checkers.supabase().catch(() => false),
    checkers.evolution().catch(() => false),
  ]);

  const services = {
    redis: redis ? 'up' as const : 'down' as const,
    supabase: supabase ? 'up' as const : 'down' as const,
    evolution: evolution ? 'up' as const : 'down' as const,
  };

  let status: 'healthy' | 'degraded' | 'unhealthy';

  if (!redis) {
    status = 'unhealthy';
  } else if (!supabase || !evolution) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return { status, timestamp: new Date().toISOString(), services };
}
