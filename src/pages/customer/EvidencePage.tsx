import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, EvidenceScore, ProgressStepper, Tag, formatCurrency, showToast } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { getComparableSales } from '../../services/api';
import type { LandRegistryTransaction } from '../../types';
import { BAND_THRESHOLDS } from '../../data/properties';

export function EvidencePage() {
  const navigate = useNavigate();
  const property = useAppStore((s) => s.selectedProperty);
  const challenge = useAppStore((s) => s.challenge);
  const setChallengeNotes = useAppStore((s) => s.setChallengeNotes);
  const addEvidence = useAppStore((s) => s.addEvidence);
  const toggleComparable = useAppStore((s) => s.toggleComparable);
  const [liveComparables, setLiveComparables] = useState<LandRegistryTransaction[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [hasUploadedDemo, setHasUploadedDemo] = useState(false);

  useEffect(() => {
    if (!property) return;
    let cancelled = false;
    (async () => {
      setLoadingComps(true);
      const street = property.address.line1.replace(/^(Flat \d+,?\s*|Apartment \d+,?\s*|\d+\s*)/i, '').trim();
      const data = await getComparableSales(street || 'CHESHAM PLACE');
      if (!cancelled) { setLiveComparables(data); setLoadingComps(false); }
    })();
    return () => { cancelled = true; };
  }, [property]);

  if (!property) {
    return <PageLayout><p className="govuk-body">No property selected.</p></PageLayout>;
  }

  const threshold = BAND_THRESHOLDS[property.hvctsBand];

  const handleDemoUpload = () => {
    if (hasUploadedDemo) return;
    addEvidence({
      id: 'demo-floor', fileName: 'floor_plan_hargreaves.pdf', type: 'Floor plan',
      description: 'Hargreaves Surveyors', score: 95, strength: 'strong',
      aiAssessment: `Shows ${property.pad.floorArea - 60} sqm. PAD records ${property.pad.floorArea} sqm — significant difference of 60 sqm. Strong evidence for your challenge.`,
    });
    addEvidence({
      id: 'demo-survey', fileName: 'structural_survey.pdf', type: 'Structural survey',
      description: 'Subsidence report — east wing', score: 78, strength: 'relevant',
      aiAssessment: 'Reports subsidence in east wing. May reduce value but requires valuer assessment. Relevant supporting evidence.',
    });
    addEvidence({
      id: 'demo-bill', fileName: 'gas_bill_march_2024.pdf', type: 'Utility bill',
      description: 'Gas utility bill — March 2024', score: 5, strength: 'weak',
      aiAssessment: 'Utility bills cannot be used to support a band challenge. This will not affect your case, but you can still include it.',
    });
    setHasUploadedDemo(true);
    showToast('3 files uploaded — AI evidence assessment complete', 'success');
  };

  return (
    <PageLayout backLink={{ to: '/challenge' }}>
      <ProgressStepper steps={['Reason', 'Evidence', 'Review', 'Submit']} currentStep={1} />

      <span className="govuk-caption-xl">Challenge: Band dispute — {property.address.line1}</span>
      <h1 className="govuk-heading-l">Provide your evidence</h1>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          {/* AI Comparable Finder */}
          <AiPanel icon="S" label="AI Challenge Guide" title="Comparable properties for your challenge" animate>
            <p>To challenge your {property.hvctsBand} band, you'll need to show your property's value is below the <strong>{formatCurrency(threshold.min)}</strong> threshold. Here are recent sales that could support your case:</p>
          </AiPanel>

          {/* Static comparables from property data */}
          <table className="govuk-table">
            <thead>
              <tr>
                <th className="govuk-table__header">Property</th>
                <th className="govuk-table__header">Sale price</th>
                <th className="govuk-table__header">Date</th>
                <th className="govuk-table__header">Size</th>
                <th className="govuk-table__header">Match</th>
                <th className="govuk-table__header">Cite</th>
              </tr>
            </thead>
            <tbody>
              {property.comparables.map((c, i) => (
                <tr key={i}>
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>{c.address}, {c.postcode}</td>
                  <td className="govuk-table__cell"><strong>{formatCurrency(c.salePrice)}</strong></td>
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>{c.saleDate}</td>
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>{c.floorArea ? `${c.floorArea} sqm` : '—'}</td>
                  <td className="govuk-table__cell">
                    {c.matchStrength && <Tag color={c.matchStrength === 'strong' ? 'green' : 'default'}>{c.matchStrength}</Tag>}
                  </td>
                  <td className="govuk-table__cell">
                    <input
                      type="checkbox"
                      checked={challenge.comparablesCited.includes(c.address)}
                      onChange={() => toggleComparable(c.address)}
                      style={{ width: 20, height: 20 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Live Land Registry comparables */}
          {!loadingComps && liveComparables.length > 0 && (
            <>
              <h3 className="govuk-heading-s">
                Additional sales from Land Registry
                <span className="live-data-badge" style={{ marginLeft: 8 }}>Live API</span>
              </h3>
              <table className="govuk-table">
                <thead>
                  <tr>
                    <th className="govuk-table__header">Address</th>
                    <th className="govuk-table__header">Price</th>
                    <th className="govuk-table__header">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {liveComparables.slice(0, 5).map((tx, i) => (
                    <tr key={i}>
                      <td className="govuk-table__cell" style={{ fontSize: 14 }}>{tx.address}, {tx.postcode}</td>
                      <td className="govuk-table__cell"><strong>{formatCurrency(tx.price)}</strong></td>
                      <td className="govuk-table__cell" style={{ fontSize: 14 }}>{tx.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
            Source: HM Land Registry Price Paid Data. These are suggestions — you can reference any comparable you choose.
          </p>

          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          {/* Upload Section */}
          <h2 className="govuk-heading-m">Upload supporting documents</h2>
          <p className="govuk-body">You can upload floor plans, structural surveys, planning records, or any other evidence.</p>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="file-upload">Upload a file</label>
            <span className="govuk-hint">PDF, JPG, or PNG. Maximum 10MB per file.</span>
            <input className="govuk-file-upload" type="file" id="file-upload" onChange={handleDemoUpload} />
          </div>

          {!hasUploadedDemo && (
            <button className="govuk-button govuk-button--secondary" onClick={handleDemoUpload} style={{ fontSize: 14 }}>
              Load demo evidence files
            </button>
          )}

          {/* AI Evidence Assessment */}
          {challenge.evidence.length > 0 && (
            <AiPanel icon="✓" label="Evidence Assessment" title="Your evidence package assessment" variant="success">
              {challenge.evidence.map((e) => (
                <EvidenceScore key={e.id} score={e.score} strength={e.strength} title={`${e.description}`} assessment={e.aiAssessment} />
              ))}
            </AiPanel>
          )}

          {/* Notes */}
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="additional-notes">Additional information (optional)</label>
            <span className="govuk-hint">Explain why you believe the band is wrong in your own words.</span>
            <textarea
              className="govuk-textarea"
              id="additional-notes"
              rows={5}
              value={challenge.notes}
              onChange={(e) => setChallengeNotes(e.target.value)}
              placeholder={`The recorded floor area of ${property.pad.floorArea} sqm is incorrect. The attached floor plan from a qualified surveyor shows the actual floor area is ${property.pad.floorArea - 60} sqm...`}
            />
          </div>

          <button className="govuk-button govuk-button--primary" onClick={() => navigate('/review')}>
            Review your challenge
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
