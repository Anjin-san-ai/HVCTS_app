import { create } from 'zustand';
import type { Property, ChallengeState, ChallengeReason, EvidenceItem } from '../types';

interface AppState {
  searchPostcode: string;
  searchResults: Property[];
  isSearching: boolean;
  postcodeInfo: { district: string; region: string; lat: number; lng: number } | null;
  selectedProperty: Property | null;
  challenge: ChallengeState;

  setSearchPostcode: (postcode: string) => void;
  setSearchResults: (results: Property[]) => void;
  setIsSearching: (loading: boolean) => void;
  setPostcodeInfo: (info: AppState['postcodeInfo']) => void;
  selectProperty: (property: Property) => void;
  setChallengeReason: (reason: ChallengeReason) => void;
  addEvidence: (evidence: EvidenceItem) => void;
  removeEvidence: (id: string) => void;
  setChallengeNotes: (notes: string) => void;
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
