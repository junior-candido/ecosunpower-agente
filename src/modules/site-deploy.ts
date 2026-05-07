// Dispara rebuild do site Cloudflare Pages quando depoimento e aprovado/postado.
// O hookUrl e gerado em Cloudflare > Pages > <projeto> > Settings > Builds & deployments > Deploy hooks.

interface Deps {
  hookUrl: string;
  fetcher?: typeof fetch;
}

export class SiteDeployService {
  private readonly hookUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(deps: Deps) {
    this.hookUrl = deps.hookUrl;
    this.fetcher = deps.fetcher ?? fetch;
  }

  async dispatchRebuild(): Promise<boolean> {
    if (!this.hookUrl) {
      console.warn('[site-deploy] CLOUDFLARE_DEPLOY_HOOK_URL ausente, skip rebuild');
      return false;
    }
    try {
      const res = await this.fetcher(this.hookUrl, { method: 'POST' });
      return res.ok;
    } catch (err) {
      console.error('[site-deploy] erro disparando rebuild:', err);
      return false;
    }
  }
}
