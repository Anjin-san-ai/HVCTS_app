import { Router } from 'express';
import { curlFetch } from '../lib/curlFetch.js';

const router = Router();

const CH_API = 'https://api.company-information.service.gov.uk';
const CH_KEY = (process.env.CompanySearch || process.env.COMPANIES_HOUSE_API_KEY || '').replace(/^["']|["']$/g, '');

function chOpts(timeoutSec = 10) {
  return {
    headers: { Accept: 'application/json' },
    basicAuth: `${CH_KEY}:`,
    timeoutSec,
  };
}

const DEMO_COMPANIES: Record<string, unknown> = {
  search: {
    items: [
      {
        company_number: 'OE012345', title: 'BELGRAVIA PROPERTIES LTD',
        company_status: 'registered', company_type: 'registered-overseas-entity',
        date_of_creation: '2022-08-01', address_snippet: '26 Chesham Place, London, SW1X 8HG',
        description: 'OE012345 - Registered overseas entity',
      },
      {
        company_number: '14567890', title: 'CHESHAM PLACE MANAGEMENT LTD',
        company_status: 'active', company_type: 'ltd',
        date_of_creation: '2019-03-14', address_snippet: '26 Chesham Place, London, SW1X 8HG',
        description: '14567890 - Incorporated on 14 March 2019',
      },
      {
        company_number: 'OE009876', title: 'EATON SQUARE HOLDINGS LTD',
        company_status: 'registered', company_type: 'registered-overseas-entity',
        date_of_creation: '2023-01-10', address_snippet: '48 Eaton Square, London, SW1W 9BE',
        description: 'OE009876 - Registered overseas entity',
      },
    ],
    total_results: 3, items_per_page: 20,
  },
  profile: {
    company_name: 'BELGRAVIA PROPERTIES LTD', company_number: 'OE012345',
    company_status: 'registered', type: 'registered-overseas-entity',
    date_of_creation: '2022-08-01', jurisdiction: 'british-virgin-islands',
    registered_office_address: { address_line_1: '26 Chesham Place', locality: 'London', postal_code: 'SW1X 8HG', country: 'United Kingdom' },
    service_address: { address_line_1: 'Trident Chambers, Road Town', locality: 'Tortola', country: 'British Virgin Islands' },
    sic_codes: ['68209'], has_charges: true, has_been_liquidated: false,
    accounts: { next_due: '2027-02-01', overdue: false },
    confirmation_statement: { next_due: '2027-08-01', overdue: false },
    foreign_company_details: { originating_registry: { name: 'BVI Financial Services Commission', country: 'British Virgin Islands' }, registration_number: 'BVI-2045891' },
  },
  officers: {
    items: [
      {
        name: 'NOVIKOV, Andrei', officer_role: 'managing-officer', appointed_on: '2022-08-01',
        nationality: 'Russian', country_of_residence: 'Monaco', occupation: 'Property Investment',
        address: { premises: 'Villa Les Oliviers', locality: 'Monte Carlo', country: 'Monaco' },
      },
      {
        name: 'FORTIS CORPORATE SERVICES LTD', officer_role: 'corporate-managing-officer', appointed_on: '2022-08-01',
        address: { premises: 'Trident Chambers', locality: 'Road Town, Tortola', country: 'British Virgin Islands' },
        identification: { legal_authority: 'BVI Business Companies Act', legal_form: 'Limited Company', place_registered: 'British Virgin Islands', registration_number: 'BVI-1928456' },
      },
    ],
    total_results: 2,
  },
  psc: {
    items: [
      {
        name: 'Mr Andrei Novikov', kind: 'individual-beneficial-owner',
        natures_of_control: ['ownership-of-shares-more-than-25-percent-registered-overseas-entity', 'voting-rights-more-than-25-percent-registered-overseas-entity'],
        nationality: 'Russian', country_of_residence: 'Monaco', notified_on: '2022-08-01',
        address: { premises: 'Villa Les Oliviers', locality: 'Monte Carlo', country: 'Monaco' },
      },
    ],
    total_results: 1,
  },
  filings: {
    items: [
      { date: '2026-07-15', description: 'overseas-entity-update-statement', type: 'OE UPDATE', category: 'confirmation-statement' },
      { date: '2025-07-20', description: 'overseas-entity-update-statement', type: 'OE UPDATE', category: 'confirmation-statement' },
      { date: '2024-01-10', description: 'change-of-registered-office-address', type: 'AD01', category: 'address' },
      { date: '2022-08-01', description: 'overseas-entity-registration', type: 'OE REG', category: 'registration' },
    ],
    total_results: 4,
  },
};

function chProxy(path: string, demoKey: string) {
  return async (req: import('express').Request, res: import('express').Response) => {
    const num = String(req.params.number ?? '');
    if (!CH_KEY) {
      res.json(DEMO_COMPANIES[demoKey]);
      return;
    }
    try {
      const result = curlFetch(`${CH_API}${path.replace(':number', encodeURIComponent(num))}`, chOpts());
      if (result.status === 200) { res.json(JSON.parse(result.body)); }
      else { res.json(DEMO_COMPANIES[demoKey]); }
    } catch (err) {
      console.error('[companies]', (err as Error).message);
      res.json(DEMO_COMPANIES[demoKey]);
    }
  };
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) { res.json({ items: [], total_results: 0 }); return; }

  if (!CH_KEY) {
    console.log('[companies] No API key — serving demo data');
    const demo = DEMO_COMPANIES.search as { items: Array<Record<string, unknown>>; total_results: number };
    const filtered = demo.items.filter(c =>
      (c.title as string).toLowerCase().includes(q.toLowerCase()) ||
      (c.address_snippet as string || '').toLowerCase().includes(q.toLowerCase())
    );
    res.json({ items: filtered.length > 0 ? filtered : demo.items, total_results: filtered.length > 0 ? filtered.length : demo.total_results });
    return;
  }

  try {
    const result = curlFetch(`${CH_API}/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`, chOpts());
    if (result.status === 200) {
      console.log(`[companies] LIVE API — search results for "${q}"`);
      res.json(JSON.parse(result.body));
    } else {
      console.log(`[companies] Search failed: ${result.status} — falling back to demo data`);
      const demo = DEMO_COMPANIES.search as { items: Array<Record<string, unknown>>; total_results: number };
      const filtered = demo.items.filter(c =>
        (c.title as string).toLowerCase().includes(q.toLowerCase()) ||
        (c.address_snippet as string || '').toLowerCase().includes(q.toLowerCase())
      );
      res.json({ items: filtered.length > 0 ? filtered : demo.items, total_results: filtered.length > 0 ? filtered.length : demo.total_results, demo: true });
    }
  } catch (err) {
    console.error('[companies]', (err as Error).message);
    const demo = DEMO_COMPANIES.search as { items: Array<Record<string, unknown>>; total_results: number };
    res.json({ ...demo, demo: true });
  }
});

router.get('/:number', chProxy('/company/:number', 'profile'));
router.get('/:number/officers', chProxy('/company/:number/officers', 'officers'));
router.get('/:number/psc', chProxy('/company/:number/persons-with-significant-control', 'psc'));
router.get('/:number/filings', chProxy('/company/:number/filing-history?items_per_page=10', 'filings'));

export default router;
