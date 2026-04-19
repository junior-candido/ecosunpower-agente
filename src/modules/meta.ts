const GRAPH_API = 'https://graph.facebook.com/v21.0';

export interface MetaPublishResult {
  platform: 'facebook' | 'instagram';
  id: string;
  permalink?: string;
}

export class MetaService {
  private token: string;
  private pageId: string;
  private instagramId: string;
  private pageTokenCache: string | null = null;

  constructor(opts: { accessToken: string; pageId: string; instagramId: string }) {
    this.token = opts.accessToken;
    this.pageId = opts.pageId;
    this.instagramId = opts.instagramId;
  }

  // Lazily fetch the Page Access Token. Publishing to a Page requires a page-scoped
  // token, not a user/system-user token. Cached for the lifetime of the process.
  private async getPageToken(): Promise<string> {
    if (this.pageTokenCache) return this.pageTokenCache;
    const res = await fetch(
      `${GRAPH_API}/${this.pageId}?fields=access_token&access_token=${this.token}`,
    );
    const data = await res.json() as { access_token?: string; error?: { message: string } };
    if (!res.ok || !data.access_token) {
      throw new Error(`Failed to fetch page access token: ${data.error?.message ?? res.statusText}`);
    }
    this.pageTokenCache = data.access_token;
    return this.pageTokenCache;
  }

  // Publish an image + caption to the Facebook Page
  async publishFacebookImage(imageUrl: string, caption: string): Promise<MetaPublishResult> {
    const pageToken = await this.getPageToken();
    const url = `${GRAPH_API}/${this.pageId}/photos`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        message: caption,
        access_token: pageToken,
      }),
    });
    const data = await res.json() as { id?: string; post_id?: string; error?: { message: string } };
    if (!res.ok || data.error) {
      throw new Error(`Facebook publish failed: ${data.error?.message ?? res.statusText}`);
    }
    return {
      platform: 'facebook',
      id: data.post_id ?? data.id ?? '',
      permalink: data.post_id ? `https://www.facebook.com/${data.post_id}` : undefined,
    };
  }

  // Publish a single image to Instagram (2-step: container + publish)
  async publishInstagramImage(imageUrl: string, caption: string): Promise<MetaPublishResult> {
    const pageToken = await this.getPageToken();
    const containerRes = await fetch(`${GRAPH_API}/${this.instagramId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: pageToken,
      }),
    });
    const containerData = await containerRes.json() as { id?: string; error?: { message: string } };
    if (!containerRes.ok || containerData.error || !containerData.id) {
      throw new Error(`Instagram container failed: ${containerData.error?.message ?? containerRes.statusText}`);
    }

    // Wait a couple seconds to let Instagram process the image
    await new Promise((r) => setTimeout(r, 3000));

    const publishRes = await fetch(`${GRAPH_API}/${this.instagramId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerData.id,
        access_token: pageToken,
      }),
    });
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
    if (!publishRes.ok || publishData.error || !publishData.id) {
      throw new Error(`Instagram publish failed: ${publishData.error?.message ?? publishRes.statusText}`);
    }

    // Fetch permalink
    const permalinkRes = await fetch(
      `${GRAPH_API}/${publishData.id}?fields=permalink&access_token=${this.token}`,
    );
    const permalinkData = await permalinkRes.json() as { permalink?: string };

    return {
      platform: 'instagram',
      id: publishData.id,
      permalink: permalinkData.permalink,
    };
  }

  // Publish a carousel (2+ images) to Instagram
  async publishInstagramCarousel(imageUrls: string[], caption: string): Promise<MetaPublishResult> {
    const pageToken = await this.getPageToken();
    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new Error('Instagram carousel requires 2 to 10 images');
    }

    // 1. Create a container for each image
    const childIds: string[] = [];
    for (const imageUrl of imageUrls) {
      const res = await fetch(`${GRAPH_API}/${this.instagramId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          is_carousel_item: true,
          access_token: pageToken,
        }),
      });
      const data = await res.json() as { id?: string; error?: { message: string } };
      if (!res.ok || !data.id) {
        throw new Error(`Instagram carousel child failed: ${data.error?.message ?? res.statusText}`);
      }
      childIds.push(data.id);
    }

    // 2. Create the carousel container
    const carouselRes = await fetch(`${GRAPH_API}/${this.instagramId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
        access_token: pageToken,
      }),
    });
    const carouselData = await carouselRes.json() as { id?: string; error?: { message: string } };
    if (!carouselRes.ok || !carouselData.id) {
      throw new Error(`Instagram carousel container failed: ${carouselData.error?.message ?? carouselRes.statusText}`);
    }

    await new Promise((r) => setTimeout(r, 3000));

    // 3. Publish
    const publishRes = await fetch(`${GRAPH_API}/${this.instagramId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: carouselData.id,
        access_token: pageToken,
      }),
    });
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
    if (!publishRes.ok || !publishData.id) {
      throw new Error(`Instagram carousel publish failed: ${publishData.error?.message ?? publishRes.statusText}`);
    }

    const permalinkRes = await fetch(
      `${GRAPH_API}/${publishData.id}?fields=permalink&access_token=${this.token}`,
    );
    const permalinkData = await permalinkRes.json() as { permalink?: string };

    return {
      platform: 'instagram',
      id: publishData.id,
      permalink: permalinkData.permalink,
    };
  }
}
