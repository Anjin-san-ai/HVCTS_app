// Centralised API endpoint configuration
// All external API URLs must be defined here to avoid scatter and duplication.

export const API = {
  postcodes: 'https://api.postcodes.io',
  landRegistry: 'https://landregistry.data.gov.uk/data/ppi',
  flood: 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas',
  crime: 'https://data.police.uk/api/crimes-street/all-crime',
  planningData: 'https://www.planning.data.gov.uk/entity.json',
  overpass: 'https://overpass-api.de/api/interpreter',
  epc: 'https://epc.opendatacommunities.org/api/v1/domestic/search',
  companiesHouse: 'https://api.company-information.service.gov.uk',
  esriImagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  esriLabels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  cartoVoyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
} as const;

export const OVERPASS_MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
] as const;

export const PROXY = {
  buildings: '/api/buildings',
  schools: '/api/schools',
  transport: '/api/transport',
  crime: '/api/crime',
  epc: '/api/epc',
  planning: '/api/planning',
  companiesSearch: '/api/companies/search',
} as const;
