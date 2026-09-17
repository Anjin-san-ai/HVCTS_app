import { useState, useCallback } from 'react';
import { showToast } from '../components/common';
import type { GateKey, GateState } from '../types';

export interface OverrideEntry {
  gate: string;
  aiSuggestion: string;
  caseworkerDecision: string;
  reason: string;
  timestamp: string;
}

export const GATE_LABELS: Record<GateKey, string> = {
  valuation: 'Valuation',
  comparables: 'Comparables',
  ownership: 'Ownership',
  bandAssessment: 'Band Assessment',
  evidenceReview: 'Evidence Review',
  finalDecision: 'Final Decision',
};

export const GATE_ORDER: GateKey[] = [
  'valuation', 'comparables', 'ownership', 'bandAssessment', 'evidenceReview', 'finalDecision',
];

const INITIAL_GATE_STATES: Record<GateKey, GateState> = {
  valuation: { status: 'pending', aiValue: '' },
  comparables: { status: 'pending', aiValue: '' },
  ownership: { status: 'pending', aiValue: '' },
  bandAssessment: { status: 'pending', aiValue: '' },
  evidenceReview: { status: 'pending', aiValue: '' },
  finalDecision: { status: 'pending', aiValue: '' },
};

export function useGates() {
  const [gateStates, setGateStates] = useState<Record<GateKey, GateState>>({ ...INITIAL_GATE_STATES });
  const [overrideJournal, setOverrideJournal] = useState<OverrideEntry[]>([]);
  const [overrideModal, setOverrideModal] = useState<{ gate: GateKey; aiValue: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideValue, setOverrideValue] = useState('');

  const confirmedGates = GATE_ORDER.filter(k => gateStates[k].status !== 'pending').length;
  const overriddenGates = GATE_ORDER.filter(k => gateStates[k].status === 'overridden').length;

  const approveGate = useCallback((gate: GateKey, aiValue: string) => {
    setGateStates(prev => ({
      ...prev,
      [gate]: { ...prev[gate], status: 'approved', aiValue, timestamp: new Date().toLocaleTimeString('en-GB') },
    }));
    showToast(`${GATE_LABELS[gate]} approved by caseworker`, 'success');
  }, []);

  const submitOverride = useCallback(() => {
    if (!overrideModal || !overrideReason.trim()) return;
    const { gate, aiValue } = overrideModal;
    setGateStates(prev => ({
      ...prev,
      [gate]: { ...prev[gate], status: 'overridden', aiValue, caseworkerValue: overrideValue, reason: overrideReason, timestamp: new Date().toLocaleTimeString('en-GB') },
    }));
    setOverrideJournal(prev => [...prev, {
      gate: GATE_LABELS[gate], aiSuggestion: aiValue,
      caseworkerDecision: overrideValue || 'Rejected AI recommendation',
      reason: overrideReason, timestamp: new Date().toLocaleString('en-GB'),
    }]);
    setOverrideModal(null);
    setOverrideReason('');
    setOverrideValue('');
    showToast(`${GATE_LABELS[gate]} overridden — recorded in audit journal`, 'warning');
  }, [overrideModal, overrideReason, overrideValue]);

  const resetGate = useCallback((gate: GateKey) => {
    setGateStates(prev => ({
      ...prev,
      [gate]: { ...prev[gate], status: 'pending', caseworkerValue: undefined, reason: undefined, timestamp: undefined },
    }));
  }, []);

  return {
    gateStates, overrideJournal, overrideModal, setOverrideModal,
    overrideReason, setOverrideReason, overrideValue, setOverrideValue,
    confirmedGates, overriddenGates,
    approveGate, submitOverride, resetGate,
  };
}
