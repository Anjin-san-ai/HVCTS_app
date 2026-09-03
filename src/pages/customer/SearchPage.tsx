import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { useAppStore } from '../../stores/appStore';
import { lookupPostcode, autocompletePostcode } from '../../services/api';
import { getPropertiesByPostcode } from '../../data/properties';

export function SearchPage() {
  const navigate = useNavigate();
  const { searchPostcode, setSearchPostcode, setSearchResults, setIsSearching, setPostcodeInfo } = useAppStore();
  const [postcode, setPostcode] = useState(searchPostcode);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Only ever open the suggestion list in response to typing. The list is
  // absolutely positioned over the Search button, so leaving it open on mount
  // (the postcode field has a default value) or re-opening it after a
  // selection made the button unclickable.
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [postcodeDetail, setPostcodeDetail] = useState<{ district: string; region: string } | null>(null);

  const fetchSuggestions = useCallback(async (value: string) => {
    if (value.length < 2) { setSuggestions([]); return; }
    const results = await autocompletePostcode(value);
    setSuggestions(results.slice(0, 6));
  }, []);

  useEffect(() => {
    if (!showSuggestions) return;
    const t = setTimeout(() => fetchSuggestions(postcode), 300);
    return () => clearTimeout(t);
  }, [postcode, fetchSuggestions, showSuggestions]);

  const handleSearch = async () => {
    setShowSuggestions(false);
    setError('');
    setValidating(true);
    const info = await lookupPostcode(postcode);
    setValidating(false);

    if (!info) {
      setError('Enter a valid postcode. Check it is a real England postcode.');
      return;
    }

    if (info.region !== 'London' && info.region !== 'South East' && info.region !== 'East of England') {
      // Still allow search, but most HVCTS properties are in London
    }

    setPostcodeDetail({ district: info.admin_district, region: info.region });
    setPostcodeInfo({ district: info.admin_district, region: info.region, lat: info.latitude, lng: info.longitude });
    setSearchPostcode(info.postcode);

    setIsSearching(true);
    const properties = getPropertiesByPostcode(info.postcode);
    setSearchResults(properties);
    setIsSearching(false);
    navigate('/results');
  };

  return (
    <PageLayout backLink={{ to: '/' }}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">Find a property</h1>
          <p className="govuk-body">Search by postcode to find properties on the HVCTS list in England.</p>

          <div className={`govuk-form-group${error ? ' govuk-form-group--error' : ''}`}>
            <label className="govuk-label" htmlFor="postcode">Postcode</label>
            <span className="govuk-hint">For example SW1X 8HG or SW7 3NP</span>
            {error && <span className="govuk-error-message">{error}</span>}
            <div style={{ position: 'relative' }}>
              <input
                className="govuk-input"
                id="postcode"
                value={postcode}
                onChange={(e) => { setShowSuggestions(true); setPostcode(e.target.value.toUpperCase()); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                // Suggestions are chosen on mouseDown, which fires before blur,
                // so closing here does not swallow the selection.
                onBlur={() => setShowSuggestions(false)}
                style={{ maxWidth: 250 }}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '2px solid var(--govuk-black)', width: 250, zIndex: 10 }}>
                  {suggestions.map((s) => (
                    <div key={s} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 16, borderBottom: '1px solid var(--govuk-light-grey)' }}
                      onMouseDown={() => { setPostcode(s); setSuggestions([]); setShowSuggestions(false); }}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {postcodeDetail && (
            <div style={{ background: 'var(--govuk-light-grey)', padding: 12, marginBottom: 20, fontSize: 14 }}>
              <span className="live-data-badge" style={{ marginRight: 8 }}>postcodes.io</span>
              {postcodeDetail.district}, {postcodeDetail.region}
            </div>
          )}

          <button className="govuk-button govuk-button--primary" onClick={handleSearch} disabled={validating}>
            {validating ? 'Validating...' : 'Search'}
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
