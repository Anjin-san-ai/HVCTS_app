import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { EvidenceScore, showToast } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { fetchChatIntake } from '../../services/llm';
import { lookupPostcode } from '../../services/api';
import { getPropertiesByPostcode } from '../../data/properties';
import type { ChatMessage, EvidenceItem } from '../../types';

const GREETING: ChatMessage = {
  role: 'assistant',
  text: "Hello, I can help you challenge your HVCTS band, liability, property details, or a split/merge — just by talking it through. What's the postcode of the property you want to challenge?",
};

const DEMO_EVIDENCE: Omit<EvidenceItem, 'aiAssessment'>[] = [
  { id: 'demo-floor', fileName: 'floor_plan_hargreaves.pdf', type: 'Floor plan', description: 'Hargreaves Surveyors', score: 95, strength: 'strong' },
  { id: 'demo-survey', fileName: 'structural_survey.pdf', type: 'Structural survey', description: 'Subsidence report — east wing', score: 78, strength: 'relevant' },
  { id: 'demo-bill', fileName: 'gas_bill_march_2024.pdf', type: 'Utility bill', description: 'Gas utility bill — March 2024', score: 5, strength: 'weak' },
];

function buildStateSummary(store: ReturnType<typeof useAppStore.getState>): string {
  const { selectedProperty, challenge } = store;
  const lines: string[] = [];
  if (selectedProperty) {
    lines.push(`Selected property: ${selectedProperty.address.line1}, ${selectedProperty.address.postcode} (Band ${selectedProperty.hvctsBand})`);
  }
  if (challenge.reason) lines.push(`Reason: ${challenge.reason}`);
  if (challenge.evidence.length) lines.push(`Evidence items attached: ${challenge.evidence.length}`);
  if (challenge.notes) lines.push(`Notes: ${challenge.notes}`);
  return lines.join('\n');
}

export function ChatPage() {
  const navigate = useNavigate();
  const selectedProperty = useAppStore((s) => s.selectedProperty);
  const selectProperty = useAppStore((s) => s.selectProperty);
  const setChallengeReason = useAppStore((s) => s.setChallengeReason);
  const setChallengeNotes = useAppStore((s) => s.setChallengeNotes);
  const challengeEvidence = useAppStore((s) => s.challenge.evidence);
  const addEvidence = useAppStore((s) => s.addEvidence);
  const submitChallenge = useAppStore((s) => s.submitChallenge);

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [matches, setMatches] = useState<ReturnType<typeof getPropertiesByPostcode>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  /**
   * Appends `displayText` as the citizen's visible chat bubble, sends `llmText`
   * (defaults to the same text) to the intake model, and applies any field
   * updates it returns. Both are built from the `messages` snapshot captured
   * at call time, so callers that also want a custom user-facing bubble (e.g.
   * picking a property from a button) don't race a separate setMessages call.
   */
  async function send(displayText: string, llmText: string = displayText) {
    const trimmed = llmText.trim();
    if (!trimmed || sending) return;

    const displayMessages = [...messages, { role: 'user' as const, text: displayText }];
    const llmMessages = [...messages, { role: 'user' as const, text: trimmed }];
    setMessages(displayMessages);
    setInput('');
    setSending(true);

    const stateSummary = buildStateSummary(useAppStore.getState());
    const res = await fetchChatIntake(llmMessages, stateSummary);

    if (!res.success) {
      setMessages((m) => [...m, { role: 'assistant', text: res.error || "Sorry, I couldn't reach the AI service. You can switch to the form view above instead." }]);
      setSending(false);
      return;
    }

    const { reply, updates, done } = res.data;

    if (updates?.postcode) {
      const info = await lookupPostcode(updates.postcode);
      if (info) setMatches(getPropertiesByPostcode(info.postcode));
    }
    if (updates?.selectAddress && !selectedProperty && matches.length) {
      const found = matches.find((p) =>
        `${p.address.line1} ${p.address.postcode}`.toLowerCase().includes(updates.selectAddress!.toLowerCase()));
      if (found) selectProperty(found);
    }
    if (updates?.reason) setChallengeReason(updates.reason);
    if (updates?.notes) setChallengeNotes(updates.notes);

    setMessages((m) => [...m, { role: 'assistant', text: reply, showUpload: !!updates?.addDemoEvidence }]);
    setSending(false);

    if (done) {
      submitChallenge();
      showToast('Challenge submitted', 'success');
      navigate('/confirmation');
    }
  }

  const handlePropertyPick = (id: string) => {
    const property = matches.find((p) => p.id === id);
    if (!property) return;
    selectProperty(property);
    setMatches([]);
    void send(`${property.address.line1}, ${property.address.postcode}`, `I mean ${property.address.line1}, ${property.address.postcode}`);
  };

  const handleUpload = (uploadedFileName?: string) => {
    if (!selectedProperty || sending) return;
    DEMO_EVIDENCE.forEach((e) => addEvidence({
      ...e,
      aiAssessment: e.id === 'demo-floor'
        ? `Shows ${selectedProperty.pad.floorArea - 60} sqm vs PAD's ${selectedProperty.pad.floorArea} sqm — a difference of 60 sqm.`
        : e.id === 'demo-survey'
          ? 'Reports subsidence in the east wing. Relevant but requires a valuer assessment.'
          : 'Utility bills cannot be used to support a band challenge — included for completeness only.',
    }));
    setMessages((m) => [
      ...m,
      { role: 'assistant', text: `Here's what your ${uploadedFileName ? `file "${uploadedFileName}"` : `${DEMO_EVIDENCE.length} files`} scored against your challenge:`, showEvidenceCards: true },
    ]);
    void send(
      'Uploaded my evidence',
      `I've uploaded my evidence: ${DEMO_EVIDENCE.map((e) => `${e.description} (${e.score}% ${e.strength})`).join('; ')}.`,
    );
  };

  return (
    <PageLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h1 className="govuk-heading-l">Challenge your HVCTS assessment — chat</h1>
        <button className="govuk-button govuk-button--secondary" style={{ margin: 0 }} onClick={() => navigate('/')}>
          Switch to form view
        </button>
      </div>
      <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
        Talk naturally — I'll ask what I need and fill in the challenge for you. You can switch to
        the step-by-step form at any time without losing your progress.
      </p>

      <div
        ref={scrollRef}
        style={{
          border: '1px solid var(--govuk-mid-grey)', borderRadius: 4, padding: 16,
          maxHeight: 560, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
          background: 'var(--govuk-light-grey)',
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <div
              style={{
                background: m.role === 'user' ? '#1d70b8' : '#fff',
                color: m.role === 'user' ? '#fff' : '#0b0c0c',
                padding: '10px 14px', borderRadius: 8, fontSize: 16,
              }}
            >
              {m.text}
            </div>

            {m.showUpload && (
              <div style={{ marginTop: 8, padding: 12, background: '#fff', border: '1px dashed var(--govuk-blue)', borderRadius: 6 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => { handleUpload(e.target.files?.[0]?.name); e.target.value = ''; }}
                />
                <button
                  className="govuk-button"
                  style={{ margin: 0, fontSize: 14 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose a file to upload
                </button>
                <button
                  className="govuk-button govuk-button--secondary"
                  style={{ margin: '0 0 0 8px', fontSize: 14 }}
                  onClick={() => handleUpload()}
                >
                  Use demo evidence files
                </button>
                <p className="govuk-body-s" style={{ margin: '8px 0 0', color: 'var(--govuk-dark-grey)' }}>
                  PDF, JPG, or PNG — floor plans, surveys, or comparable sales work best.
                </p>
              </div>
            )}

            {m.showEvidenceCards && challengeEvidence.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {challengeEvidence.map((e) => (
                  <EvidenceScore key={e.id} score={e.score} strength={e.strength} title={e.description} assessment={e.aiAssessment} />
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--govuk-dark-grey)', fontSize: 14 }}>Thinking…</div>
        )}
      </div>

      {matches.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {matches.map((p) => (
            <button
              key={p.id}
              className="govuk-button govuk-button--secondary"
              style={{ margin: 0, fontSize: 14 }}
              onClick={() => handlePropertyPick(p.id)}
            >
              {p.address.line1}, {p.address.postcode}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          className="govuk-input"
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="Type your reply… (e.g. 'I want to upload some evidence')"
          disabled={sending}
        />
        <button className="govuk-button" style={{ margin: 0 }} onClick={() => send(input)} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </PageLayout>
  );
}
