interface RiskDimension {
  label: string;
  score: number; // 0-100
  color: string;
}

interface RiskRadarProps {
  dimensions: RiskDimension[];
  size?: number;
}

export function RiskRadar({ dimensions, size = 220 }: RiskRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30;
  const n = dimensions.length;

  const getPoint = (index: number, radius: number): [number, number] => {
    const angle = (2 * Math.PI * index) / n - Math.PI / 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const dataPoints = dimensions.map((d, i) => getPoint(i, (d.score / 100) * maxR));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';

  const overallRisk = Math.round(dimensions.reduce((a, d) => a + d.score, 0) / n);
  const riskLevel = overallRisk >= 70 ? 'Low' : overallRisk >= 40 ? 'Medium' : 'High';
  const riskColor = overallRisk >= 70 ? '#00703c' : overallRisk >= 40 ? '#f47738' : '#d4351c';

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ fontFamily: '"GDS Transport", Arial, sans-serif' }}>
        {/* Grid rings */}
        {gridLevels.map((level) => {
          const points = Array.from({ length: n }, (_, i) => getPoint(i, maxR * level));
          const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
          return <path key={level} d={path} fill="none" stroke="#b1b4b6" strokeWidth={0.5} opacity={0.5} />;
        })}

        {/* Axis lines */}
        {dimensions.map((_, i) => {
          const [ex, ey] = getPoint(i, maxR);
          return <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} stroke="#b1b4b6" strokeWidth={0.5} opacity={0.4} />;
        })}

        {/* Data polygon */}
        <path d={dataPath} fill={riskColor} fillOpacity={0.15} stroke={riskColor} strokeWidth={2} />

        {/* Data points */}
        {dataPoints.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={4} fill={dimensions[i].color} stroke="#fff" strokeWidth={1.5} />
        ))}

        {/* Labels */}
        {dimensions.map((d, i) => {
          const [lx, ly] = getPoint(i, maxR + 18);
          const anchor = lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle';
          return (
            <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
              fontSize={10} fontWeight={600} fill="#0b0c0c">
              {d.label}
            </text>
          );
        })}

        {/* Center score */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight={700} fill={riskColor}>
          {overallRisk}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#505a5f" fontWeight={600}>
          {riskLevel} Risk
        </text>
      </svg>

      {/* Score breakdown */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 6 }}>
        {dimensions.map((d) => (
          <div key={d.label} style={{
            padding: '2px 8px',
            fontSize: 11,
            background: '#f3f2f1',
            border: `1px solid ${d.color}`,
            borderLeftWidth: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{ color: '#505a5f' }}>{d.label}:</span>
            <strong style={{ color: d.color }}>{d.score}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
