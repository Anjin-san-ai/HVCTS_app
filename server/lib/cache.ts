const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

export class BuildingCache {
  private cache = new Map<string, { elements: unknown[]; ts: number }>();

  async loadFromDisk(): Promise<void> {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cacheFile = path.default.join(import.meta.dirname || '.', '..', 'building-cache.json');
      const raw = fs.default.readFileSync(cacheFile, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown[]>;
      let count = 0;
      for (const [key, elements] of Object.entries(data)) {
        if (Array.isArray(elements) && elements.length > 0) {
          this.cache.set(key, { elements, ts: Date.now() });
          count += elements.length;
        }
      }
      console.log(`  Building cache: ${this.cache.size} locations, ${count} footprints loaded from disk`);
    } catch {
      console.log('  Building cache: no pre-fetched data found');
    }
  }

  get(key: string): unknown[] | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.elements;
    }
    return null;
  }

  set(key: string, elements: unknown[]): void {
    if (elements.length > 0) {
      this.cache.set(key, { elements, ts: Date.now() });
    }
  }

  makeKey(lat: number, lng: number, radius: number): string {
    return `${Math.round(lat * 10000)},${Math.round(lng * 10000)},${radius}`;
  }
}
