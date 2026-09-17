import { create } from 'zustand';
import type { Property, ChallengeState, ChallengeReason, EvidenceItem } from '../types';

/** Prototype personas, in the order they appear in the top navigation. */
export type Persona = 'raio' | 'citizen' | 'story' | 'cw';

interface AppState {
  searchPostcode: string;
  searchResults: Property[];
  isSearching: boolean;
  postcodeInfo: { district: string; region: string; lat: number; lng: number } | null;
  selectedProperty: Property | null;
  challenge: ChallengeState;
  viewMode: 'form' | 'chat';
  /**
   * Which persona the prototype is being demonstrated as. Route-independent on
   * purpose: the RAIO-only AI Governance entry point has to react to the
   * persona being *selected*, not to the caseworker route being open.
   */
  persona: Persona;

  setSearchPostcode: (postcode: string) => void;
  setSearchResults: (results: Property[]) => void;
  setIsSearching: (loading: boolean) => void;
  setPostcodeInfo: (info: AppState['postcodeInfo']) => void;
  selectProperty: (property: Property) => void;
  setChallengeReason: (reason: ChallengeReason) => void;
  addEvidence: (evidence: EvidenceItem) => void;
  removeEvidence: (id: string) => void;
  setChallengeNotes: (notes: string) => void;
  setViewMode: (mode: 'form' | 'chat') => void;
  setPersona: (persona: Persona) => void;
  toggleComparable: (address: string) => void;
  submitChallenge: () => string;
  resetChallenge: () => void;
}

const INITIAL_CHALLENGE: ChallengeState = {
  propertyId: null,
  reason: null,
  evidence: [],
  notes: '',
  comparablesCited: [],
  status: 'draft',
};

export const useAppStore = create<AppState>((set, get) => ({
  searchPostcode: 'SW1X 8HG',
  searchResults: [],
  isSearching: false,
  postcodeInfo: null,
  selectedProperty: null,
  challenge: { ...INITIAL_CHALLENGE },
  viewMode: 'form',
  persona: 'citizen',

  setSearchPostcode: (postcode) => set({ searchPostcode: postcode }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (loading) => set({ isSearching: loading }),
  setPostcodeInfo: (info) => set({ postcodeInfo: info }),

  selectProperty: (property) =>
    set({
      selectedProperty: property,
      challenge: { ...INITIAL_CHALLENGE, propertyId: property.id },
    }),

  setChallengeReason: (reason) =>
    set((s) => ({ challenge: { ...s.challenge, reason } })),

  addEvidence: (evidence) =>
    set((s) => ({ challenge: { ...s.challenge, evidence: [...s.challenge.evidence, evidence] } })),

  removeEvidence: (id) =>
    set((s) => ({ challenge: { ...s.challenge, evidence: s.challenge.evidence.filter((e) => e.id !== id) } })),

  setChallengeNotes: (notes) =>
    set((s) => ({ challenge: { ...s.challenge, notes } })),

  setViewMode: (mode) => set({ viewMode: mode }),

  setPersona: (persona) => set({ persona }),

  toggleComparable: (address) =>
    set((s) => {
      const cited = s.challenge.comparablesCited;
      const next = cited.includes(address) ? cited.filter((a) => a !== address) : [...cited, address];
      return { challenge: { ...s.challenge, comparablesCited: next } };
    }),

  submitChallenge: () => {
    const ref = `HVCTS-2028-${String(Math.floor(10000 + Math.random() * 90000))}`;
    set((s) => ({
      challenge: { ...s.challenge, status: 'submitted', reference: ref },
    }));
    return ref;
  },

  resetChallenge: () => {
    const propId = get().selectedProperty?.id || null;
    set({ challenge: { ...INITIAL_CHALLENGE, propertyId: propId } });
  },
}));
