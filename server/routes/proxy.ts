import { Router } from 'express';
import { curlFetch } from '../lib/curlFetch.js';
import { BuildingCache } from '../lib/cache.js';

const router = Router();
const buildingCache = new BuildingCache();

export async function initCache(): Promise<void> {
  await buildingCache.loadFromDisk();
}

router.get('/buildings', async (req, res) => {
  const lat = parseFloat(String(req.query.lat));
  const lng = parseFloat(String(req.query.lng));
  const radius = Math.min(parseFloat(String(req.query.radius || '150')), 300);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ elements: [] });
    return;
  }

  const cacheKey = buildingCache.makeKey(lat, lng, radius);
  const cached = buildingCache.get(cacheKey);
  if (cached) {
    res.json({ elements: cached });
    return;
  }

  const dlat = radius / 111320;
  const dlng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dlat},${lng - dlng},${lat + dlat},${lng + dlng}`;
  const query = `[out:json][timeout:10];way["building"](${bbox});out geom;`;

  const endpoints = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const host = endpoint.split('/')[2];
        const result = curlFetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*', 'User-Agent': 'HVCTS-Dev/1.0' },
          timeoutSec: 20,
        });
        if (result.status === 429 || result.status === 504) {
          console.log(`[buildings] ${host} → ${result.status}, retry ${attempt + 1}`);
          continue;
        }
        if (result.status < 200 || result.status >= 300) {
          console.log(`[buildings] ${host} → ${result.status}`);
          break;
        }
        const data = JSON.parse(result.body) as { elements?: unknown[] };
        const elements = data.elements || [];
        console.log(`[buildings] ${elements.length} footprints from ${host}`);
        buildingCache.set(cacheKey, elements);
        res.json({ elements });
        return;
      } catch (err) {
        console.log(`[buildings] ${endpoint.split('/')[2]} failed: ${(err as Error).message}`);
        break;
      }
    }
  }
  res.json({ elements: [] });
});

function overpassProxy(label: string, buildQuery: (lat: number, lng: number, radius: number) => string) {
  return async (req: typeof import('express').request, res: typeof import('express').response) => {
    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));
    const radius = Math.min(parseFloat(String(req.query.radius || '1500')), 3000);
    if (isNaN(lat) || isNaN(lng)) { res.json({ elements: [] }); return; }

    const query = buildQuery(lat, lng, radius);
    const endpoints = [
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ];

    for (const endpoint of endpoints) {
      try {
        const host = endpoint.split('/')[2];
        const result = curlFetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*', 'User-Agent': 'HVCTS-Dev/1.0' },
          timeoutSec: 15,
        });
        if (result.status >= 200 && result.status < 300) {
          const data = JSON.parse(result.body);
          console.log(`[${label}] ${(data.elements || []).length} results from ${host}`);
          res.json(data);
          return;
        }
        console.log(`[${label}] ${host} → ${result.status}`);
      } catch (err) {
        console.log(`[${label}] ${endpoint.split('/')[2]} failed: ${(err as Error).message}`);
      }
    }
    res.json({ elements: [] });
  };
}

router.get('/schools', overpassProxy('schools',
  (lat, lng, radius) => `[out:json][timeout:10];(node["amenity"="school"](around:${radius},${lat},${lng});way["amenity"="school"](around:${radius},${lat},${lng}););out center;`
));

router.get('/transport', overpassProxy('transport',
  (lat, lng, radius) => `[out:json][timeout:10];(node["station"="subway"](around:${radius},${lat},${lng});node["railway"="station"](around:${radius},${lat},${lng});node["railway"="halt"](around:${radius},${lat},${lng}););out;`
));

router.get('/epc', async (req, res) => {
  const postcode = String(req.query.postcode || '');
  if (!postcode) { res.json({ rows: [] }); return; }
  try {
    const result = curlFetch(
      `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=10`,
      { headers: { Accept: 'application/json' }, timeoutSec: 8 },
    );
    if (result.status < 200 || result.status >= 300) { res.json({ rows: [] }); return; }
    res.json(JSON.parse(result.body));
  } catch (err) {
    console.error('[epc]', (err as Error).message);
    res.json({ rows: [] });
  }
});

router.get('/crime', async (req, res) => {
  const lat = parseFloat(String(req.query.lat));
  const lng = parseFloat(String(req.query.lng));
  if (isNaN(lat) || isNaN(lng)) { res.json([]); return; }
  try {
    const result = curlFetch(
      `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}`,
      { headers: { Accept: 'application/json' }, timeoutSec: 10 },
    );
    if (result.status >= 200 && result.status < 300) {
      const crimes = JSON.parse(result.body);
      console.log(`[crime] ${Array.isArray(crimes) ? crimes.length : 0} crimes returned`);
      res.json(crimes);
    } else {
      console.log(`[crime] police.uk → ${result.status}`);
      res.json([]);
    }
  } catch (err) {
    console.log(`[crime] failed: ${(err as Error).message}`);
    res.json([]);
  }
});

router.get('/planning', async (req, res) => {
  const lat = parseFloat(String(req.query.lat));
  const lng = parseFloat(String(req.query.lng));
  if (isNaN(lat) || isNaN(lng)) { res.json({ entities: [] }); return; }

  const datasets = ['listed-building-outline', 'conservation-area'];
  const allEntities: unknown[] = [];

  for (const dataset of datasets) {
    try {
      const point = `POINT(${lng} ${lat})`;
      const url = `https://www.planning.data.gov.uk/entity.json?dataset=${dataset}&geometry=${encodeURIComponent(point)}&geometry_relation=intersects&limit=10`;
      const result = curlFetch(url, {
        headers: { Accept: 'application/json' },
        timeoutSec: 10,
      });
      if (result.status >= 200 && result.status < 300) {
        const data = JSON.parse(result.body);
        const entities = data?.entities ?? [];
        allEntities.push(...entities);
        console.log(`[planning] ${dataset}: ${entities.length} entities`);
      }
    } catch (err) {
      console.log(`[planning] ${dataset} failed: ${(err as Error).message}`);
    }
  }
  res.json({ entities: allEntities });
});

export default router;
