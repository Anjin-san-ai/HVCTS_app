import type { Property } from '../types';
import { getRuleEngine, interpolate, propertyVars } from '../config/ruleEngine';
import type { OwnershipConfig } from '../config/ruleEngine';

export const OWNERSHIP_EXPLAINERS: Record<string, (p: Property) => string> = new Proxy(
  {} as Record<string, (p: Property) => string>,
  {
    get(_target, ownershipType: string) {
      return (property: Property) => {
        const config = getRuleEngine().get<OwnershipConfig>('ownership');
        const rule = config.ownershipTypes[ownershipType];
        if (!rule) return `Ownership type "${ownershipType}" not recognised.`;
        return interpolate(rule.explainerTemplate, propertyVars(property));
      };
    },
    has(_target, ownershipType: string) {
      const config = getRuleEngine().get<OwnershipConfig>('ownership');
      return ownershipType in config.ownershipTypes;
    },
    ownKeys() {
      const config = getRuleEngine().get<OwnershipConfig>('ownership');
      return Object.keys(config.ownershipTypes);
    },
    getOwnPropertyDescriptor(_target, ownershipType: string) {
      const config = getRuleEngine().get<OwnershipConfig>('ownership');
      if (ownershipType in config.ownershipTypes) {
        return { configurable: true, enumerable: true, writable: true };
      }
      return undefined;
    },
  },
);
