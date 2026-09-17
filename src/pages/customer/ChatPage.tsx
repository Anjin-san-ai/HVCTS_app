import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { Tag, showToast } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { fetchChatIntake } from '../../services/llm';
import { lookupPostcode } from '../../services/api';
import { getPropertiesByPostcode } from '../../data/properties';
import { buildChallengeTypes } from '../../domain/challenge';
import { JOURNEY_LABELS, JOURNEY_PHASES } from '../../domain/journey';
import type { JourneyPhase } from '../../domain/journey';
import { renderMarkdown } from '../../domain/markdown';
import { GDS_COLOURS } from '../../config/gds';
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

/** Example postcodes offered as chips before a property is known. */
const POSTCODE_SUGGESTIONS = ['SW1X 8HG', 'SW7 3NP'];

/** Phases shown in the stepper — 'submitted' is the end state, not a step. */
const STEPPER_PHASES: JourneyPhase[] = JOURNEY_PHASES.filter((p) => p !== 'submitted');

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
  const challengeReason = useAppStore((s) => s.challenge.reason);
  const setChallengeReason = useAppStore((s) => s.setChallengeReason);
  const setChallengeNotes = useAppStore((s) => s.setChallengeNotes);
  const challengeEvidence = useAppStore((s) => s.challenge.evidence);
  const addEvidence = useAppStore((s) => s.addEvidence);
  const submitChallenge = useAppStore((s) => s.submitChallenge);
  const resetChallenge = useAppStore((s) => s.resetChallenge);

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // The model's own view of where the conversation has got. Treated as a hint
  // rather than the authority: it sometimes reports "listen" on the very turn
  // it classifies the challenge, which would leave the stepper behind reality.
  const [modelPhase, setModelPhase] = useState<JourneyPhase>('listen');
  const [submitted, setSubmitted] = useState(false);
  const [matches, setMatches] = useState<ReturnType<typeof getPropertiesByPostcode>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Challenge-type copy comes from config/rules/challenge-types.yaml, so the
  // chips and the classification card describe the same thing the caseworker
  // side does. Needs a property, so it only exists once one is selected.
  const challengeTypes = useMemo(
    () => (selectedProperty ? buildChallengeTypes(selectedProperty) : null),
    [selectedProperty],
  );

  // Floor the stepper against what the store actually holds, then take
  // whichever of the two is further along. The store cannot lie about whether
  // a property is chosen or evidence is attached.
  const phase: JourneyPhase = useMemo(() => {
    if (submitted) return 'submitted';
    const fromState: JourneyPhase =
      challengeEvidence.length > 0 ? 'evidence'
        : challengeReason ? 'analyse'
          : 'listen';
    const furthest = Math.max(STEPPER_PHASES.indexOf(fromState), STEPPER_PHASES.indexOf(modelPhase));
    return STEPPER_PHASES[furthest] ?? 'listen';
  }, [submitted, challengeEvidence.length, challengeReason, modelPhase]);

  const phaseIdx = STEPPER_PHASES.indexOf(phase);
  const activeType = challengeTypes && challengeReason ? challengeTypes[challengeReason] : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  /**
   * Appends `displayText` as the citizen's visible chat bubble, sends `llmText`
   * (defaults to the same text) to the intake model, and applies any field
   * updates it returns.
   *
   * `follow` holds assistant turns to land straight after the citizen's
   * bubble, ahead of the model's reply — the evidence score cards, for
   * instance. It exists because callers used to append their own message and
   * then call this function, which rebuilt the list from a stale `messages`
   * closure and silently dropped what they had just added; that is how the
   * evidence cards went missing. Routing every update through here keeps the
   * list authoritative. These turns are presentation only and are not sent to
   * the model, which already gets the same detail in `llmText`.
   *
   * Card-only turns carry no text, so they are filtered out of what the model
   * sees rather than sent as empty assistant messages.
   */
  async function send(displayText: string, llmText: string = displayText, follow: ChatMessage[] = []) {
    const trimmed = llmText.trim();
    if (!trimmed || sending) return;

    const displayMessages = [...messages, { role: 'user' as const, text: displayText }, ...follow];
    const llmMessages = [...messages.filter((m) => m.text.trim()), { role: 'user' as const, text: trimmed }];
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

    const { reply, updates, done, phase: nextPhase, classification } = res.data;

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
    if (nextPhase && STEPPER_PHASES.includes(nextPhase)) setModelPhase(nextPhase);

    const turn: ChatMessage[] = [];

    // The model sends `classification` only on the turn it first works out the
    // challenge type, so this card appears once rather than on every reply.
    if (classification && challengeTypes?.[classification.intent]) {
      const ct = challengeTypes[classification.intent];
      turn.push({
        role: 'assistant',
        text: '',
        card: 'intent-card',
        cardData: { label: ct.label, summary: ct.summary, colour: ct.colour, confidence: classification.confidence },
      });
    }

    turn.push({ role: 'assistant', text: reply, showUpload: !!updates?.addDemoEvidence });
    setMessages((m) => [...m, ...turn]);
    setSending(false);

    if (done) {
      const reference = submitChallenge();
      const accepted = useAppStore.getState().challenge.evidence.filter((e) => e.strength !== 'weak').length;
      setSubmitted(true);
      setMessages((m) => [...m, {
        role: 'assistant',
        text: '',
        card: 'submission-card',
        cardData: {
          reference,
          challengeType: activeType?.label || 'Challenge',
          property: selectedProperty ? `${selectedProperty.address.line1}, ${selectedProperty.address.postcode}` : '',
          accepted,
          total: useAppStore.getState().challenge.evidence.length,
          date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        },
      }]);
      showToast('Challenge submitted', 'success');
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
    void send(
      'Uploaded my evidence',
      `I've uploaded my evidence: ${DEMO_EVIDENCE.map((e) => `${e.description} (${e.score}% ${e.strength})`).join('; ')}.`,
      [{
        role: 'assistant',
        text: `Here's what your ${uploadedFileName ? `file "${uploadedFileName}"` : `${DEMO_EVIDENCE.length} files`} scored against your challenge:`,
        showEvidenceCards: true,
      }],
    );
  };

  const handleReset = () => {
    resetChallenge();
    setMessages([GREETING]);
    setModelPhase('listen');
    setSubmitted(false);
    setMatches([]);
    setInput('');
  };

  /**
   * Suggested replies for wherever the conversation has got to. This is the
   * "assisted" half of the chat: the citizen can always type freely, but never
   * has to guess what the assistant is waiting for.
   */
  function renderChips() {
    if (sending || phase === 'submitted') return null;

    // Before a property is known, the assistant is waiting on a postcode.
    if (!selectedProperty && matches.length === 0) {
      return (
        <ChipRow label="Try one of these postcodes">
          {POSTCODE_SUGGESTIONS.map((pc) => (
            <button key={pc} className="story-chip" onClick={() => void send(pc)}>{pc}</button>
          ))}
        </ChipRow>
      );
    }

    // Property known but no challenge type yet — offer the four types in the
    // citizen's own words, as the AI Citizen journey does.
    if (selectedProperty && !challengeReason && challengeTypes) {
      return (
        <ChipRow label="What concerns you about your assessment?">
          {Object.values(challengeTypes).map((ct) => (
            <button
              key={ct.key}
              className="story-chip"
              style={{ borderLeft: `3px solid ${ct.colour}`, textAlign: 'left' }}
              onClick={() => void send(PLAIN_CONCERN[ct.key] ?? ct.label)}
            >
              {PLAIN_CONCERN[ct.key] ?? ct.label}
            </button>
          ))}
        </ChipRow>
      );
    }

    // Challenge type known, nothing uploaded yet.
    if (challengeReason && challengeEvidence.length === 0) {
      return (
        <ChipRow label="Add your evidence">
          <button className="story-chip story-chip--upload" onClick={() => fileInputRef.current?.click()}>
            Upload a file
          </button>
          <button className="story-chip story-chip--action" onClick={() => handleUpload()}>
            Use demo evidence files
          </button>
          <button className="story-chip story-chip--action" onClick={() => void send("I don't have any evidence yet")}>
            I don't have evidence yet
          </button>
        </ChipRow>
      );
    }

    // Evidence in hand — nudge towards review and submission.
    if (challengeEvidence.length > 0) {
      return (
        <ChipRow label="Next steps">
          <button className="story-chip story-chip--action" onClick={() => void send('Summarise my challenge before I submit')}>
            Review my challenge
          </button>
          <button className="story-chip story-chip--action" onClick={() => handleUpload()}>
            Add more evidence
          </button>
          <button className="story-chip" onClick={() => void send("Yes, I confirm — submit my challenge")}>
            Submit my challenge
          </button>
        </ChipRow>
      );
    }

    return null;
  }

  return (
    <PageLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h1 className="govuk-heading-l" style={{ marginBottom: 0 }}>Challenge your HVCTS assessment</h1>
        <button className="govuk-button govuk-button--secondary" style={{ margin: 0 }} onClick={() => navigate('/')}>
          Switch to form view
        </button>
      </div>
      <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
        Talk naturally — I'll ask what I need and fill in the challenge for you. You can switch to
        the step-by-step form at any time without losing your progress.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => { handleUpload(e.target.files?.[0]?.name); e.target.value = ''; }}
      />

      <div className="story-chat story-chat--page">
        {/* Header */}
        <div className="story-chat__header">
          <div>
            <div className="story-chat__title">HVCTS AI Assistant</div>
            <div className="story-chat__sub">{activeType ? activeType.label : 'Challenge guide'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            {sending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.2s infinite' }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LLM</span>
              </div>
            )}
            <button className="story-chat__close" onClick={handleReset} aria-label="Start again" title="Start again">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Journey stepper — phases come from config/rules/journey.yaml */}
        <div style={{ display: 'flex', padding: '8px 18px', borderBottom: `1px solid ${GDS_COLOURS.grey}`, background: GDS_COLOURS.lightGrey, flexShrink: 0 }}>
          {STEPPER_PHASES.map((step, i) => {
            const isActive = phaseIdx === i;
            const isComplete = phaseIdx > i || phase === 'submitted';
            const colour = isComplete ? GDS_COLOURS.green : isActive ? GDS_COLOURS.darkBlue : GDS_COLOURS.midGrey;
            return (
              <div key={step} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isComplete ? GDS_COLOURS.green : isActive ? GDS_COLOURS.darkBlue : 'transparent',
                    border: `2px solid ${colour}`, color: isComplete || isActive ? '#fff' : GDS_COLOURS.midGrey,
                    fontSize: 10, fontWeight: 700, transition: 'all 0.3s ease',
                  }}>
                    {isComplete ? '✓' : i + 1}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, color: colour, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {JOURNEY_LABELS[step]}
                  </div>
                </div>
                {i < STEPPER_PHASES.length - 1 && (
                  <div style={{ height: 2, flex: 0.6, background: isComplete ? GDS_COLOURS.green : GDS_COLOURS.grey, marginBottom: 13, transition: 'background 0.3s ease' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Messages */}
        <div className="story-chat__messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`story-chat__msg story-chat__msg--${m.role}`}>
              <div style={{ maxWidth: '88%' }}>
                {/* AI classification card */}
                {m.card === 'intent-card' && m.cardData && (
                  <div style={{
                    background: '#fff', border: `1px solid ${GDS_COLOURS.grey}`, borderLeft: `4px solid ${m.cardData.colour as string}`,
                    padding: '10px 12px', marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI CLASSIFICATION</div>
                      <div style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                        background: (m.cardData.confidence as number) >= 85 ? '#e6f3ec' : '#fef7f0',
                        color: (m.cardData.confidence as number) >= 85 ? GDS_COLOURS.green : GDS_COLOURS.orange,
                      }}>
                        {m.cardData.confidence as number}% match
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: m.cardData.colour as string }}>{m.cardData.label as string}</div>
                    <div style={{ fontSize: 11, color: GDS_COLOURS.midGrey, marginTop: 2 }}>{m.cardData.summary as string}</div>
                  </div>
                )}

                {/* Submission confirmation card */}
                {m.card === 'submission-card' && m.cardData && (
                  <div style={{ background: '#fff', border: `2px solid ${GDS_COLOURS.green}`, overflow: 'hidden' }}>
                    <div style={{ background: GDS_COLOURS.green, padding: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0,
                      }}>✓</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Challenge submitted</div>
                        <div style={{ fontSize: 10, opacity: 0.85 }}>{m.cardData.date as string}</div>
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px', background: '#e6f3ec', borderBottom: `1px solid ${GDS_COLOURS.lightGrey}` }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference number</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: GDS_COLOURS.green, fontFamily: 'monospace', letterSpacing: '0.03em' }}>{m.cardData.reference as string}</div>
                    </div>
                    <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      <div>
                        <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Challenge type</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: GDS_COLOURS.black }}>{m.cardData.challengeType as string}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Evidence</div>
                        <div style={{ fontSize: 12, color: GDS_COLOURS.black }}>
                          {m.cardData.accepted as number} of {m.cardData.total as number} support the challenge
                        </div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Property</div>
                        <div style={{ fontSize: 11, color: GDS_COLOURS.black }}>{m.cardData.property as string}</div>
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px', borderTop: `1px solid ${GDS_COLOURS.lightGrey}` }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', marginBottom: 6 }}>What happens next</div>
                      <div className="chat-md" style={{ fontSize: 11, lineHeight: 1.6 }} dangerouslySetInnerHTML={{
                        __html: renderMarkdown('- A VOA caseworker reviews your challenge within **2 working days**\n- You will get an acknowledgement by email\n- Keep paying your existing Council Tax while the challenge is open'),
                      }} />
                      <button className="govuk-button" style={{ margin: '10px 0 0', fontSize: 14 }} onClick={() => navigate('/confirmation')}>
                        View full confirmation
                      </button>
                    </div>
                  </div>
                )}

                {/* Plain bubble */}
                {!m.card && (
                  <div className={`story-chat__bubble story-chat__bubble--${m.role}`}>
                    {m.role === 'assistant' && <div className="story-chat__ai-tag">AI</div>}
                    <div className="chat-md" style={{ fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                  </div>
                )}

                {/* Inline upload affordance. Hidden once the challenge is in,
                    so an earlier turn's buttons can't add evidence to a case
                    that has already been submitted. */}
                {m.showUpload && phase !== 'submitted' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="story-chip story-chip--upload" disabled={sending} onClick={() => fileInputRef.current?.click()}>
                      Choose a file to upload
                    </button>
                    <button className="story-chip story-chip--action" disabled={sending} onClick={() => handleUpload()}>
                      Use demo evidence files
                    </button>
                  </div>
                )}

                {/* Evidence verdict cards, scored against the challenge */}
                {m.showEvidenceCards && challengeEvidence.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {challengeEvidence.map((e) => {
                      const colour = e.strength === 'strong' ? GDS_COLOURS.green : e.strength === 'relevant' ? GDS_COLOURS.orange : GDS_COLOURS.red;
                      const bg = e.strength === 'strong' ? '#e6f3ec' : e.strength === 'relevant' ? '#fef7f0' : '#fdf0ed';
                      return (
                        <div key={e.id} style={{ background: bg, border: `1px solid ${colour}40`, borderLeft: `4px solid ${colour}`, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: GDS_COLOURS.black }}>{e.description}</div>
                            <Tag color={e.strength === 'strong' ? 'green' : e.strength === 'relevant' ? 'yellow' : 'red'}>
                              {e.score}%
                            </Tag>
                          </div>
                          <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey, marginBottom: 4 }}>{e.type} · {e.fileName}</div>
                          <div style={{ fontSize: 11, color: GDS_COLOURS.black, lineHeight: 1.5 }}>{e.aiAssessment}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="story-chat__msg story-chat__msg--assistant">
              <div className="story-chat__bubble story-chat__bubble--assistant">
                <div className="story-chat__ai-tag">AI</div>
                <div className="story-typing">
                  <span className="story-typing__dot" /><span className="story-typing__dot" /><span className="story-typing__dot" />
                </div>
              </div>
            </div>
          )}

          {/* Property matches for the postcode the citizen gave */}
          {matches.length > 0 && !sending && (
            <ChipRow label="Which property do you mean?">
              {matches.map((p) => (
                <button key={p.id} className="story-chip" onClick={() => handlePropertyPick(p.id)}>
                  {p.address.line1}, {p.address.postcode}
                </button>
              ))}
            </ChipRow>
          )}

          {renderChips()}
        </div>

        {/* Input bar */}
        {phase !== 'submitted' && (
          <div className="story-chat__input">
            <input
              className="story-chat__input-field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder={selectedProperty ? 'Ask me anything about your challenge…' : 'Enter your postcode…'}
              disabled={sending}
            />
            <button className="story-chat__send" onClick={() => send(input)} disabled={sending || !input.trim()} aria-label="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

/** The four challenge types in the words a citizen would actually use. */
const PLAIN_CONCERN: Record<string, string> = {
  'pad-wrong': 'The floor area is wrong',
  'band-wrong': 'The valuation is too high',
  'liability-wrong': 'I should not be liable',
  'split-merge': 'The property has been split',
};

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: '10px 0 4px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}
