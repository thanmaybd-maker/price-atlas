import type { Product } from '@domain/index';
export function ProductArt({ product, hero = false }: { product: Product; hero?: boolean }) {
  const p = product;
  if (p.sourceKind === 'live')
    return p.imageUrl ? (
      <img
        className={`product-art ${hero ? 'hero-art' : ''}`}
        src={p.imageUrl}
        alt={p.name}
        loading={hero ? 'eager' : 'lazy'}
        referrerPolicy="no-referrer"
      />
    ) : (
      <div
        className="product-art missing-image"
        role="img"
        aria-label="No permitted product image available"
      >
        Image unavailable
      </div>
    );
  const key = `art-${p.id}-${hero ? 'hero' : 'card'}`;
  return (
    <svg
      className={`product-art ${hero ? 'hero-art' : ''}`}
      viewBox="0 0 400 300"
      role="img"
      aria-label={`${p.name}, illustrative demo artwork`}
    >
      <defs>
        <linearGradient id={`${key}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={p.accent} />
          <stop offset=".5" stopColor={p.color === 'White' ? '#f7f7f3' : p.accent} />
          <stop offset="1" stopColor={p.category === 'audio' ? '#121818' : '#677b80'} />
        </linearGradient>
        <linearGradient id={`${key}-screen`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b9d1c9" />
          <stop offset=".48" stopColor="#568b80" />
          <stop offset="1" stopColor="#162f32" />
        </linearGradient>
        <filter id={`${key}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="15" stdDeviation="10" floodColor="#213b35" floodOpacity=".16" />
        </filter>
      </defs>
      <ellipse cx="203" cy="261" rx="100" ry="12" fill="#142e24" opacity=".06" />
      {p.category === 'phones' ? (
        <g filter={`url(#${key}-shadow)`} transform="rotate(-12 200 150)">
          <rect
            x="113"
            y="25"
            width="126"
            height="237"
            rx="22"
            fill={`url(#${key}-body)`}
            stroke="#fff"
            strokeOpacity=".6"
            strokeWidth="2"
          />
          {p.id === 'pixel-9' ? (
            <g>
              <rect x="123" y="53" width="106" height="37" rx="18" fill="#858e8c" />
              <rect x="130" y="60" width="63" height="23" rx="12" fill="#131a1b" />
              <circle cx="145" cy="71" r="8" fill="#253a46" stroke="#060c0f" strokeWidth="4" />
              <circle cx="178" cy="71" r="8" fill="#253a46" stroke="#060c0f" strokeWidth="4" />
              <circle cx="211" cy="71" r="5" fill="#eae8d9" />
              <text
                x="175"
                y="170"
                textAnchor="middle"
                fontSize="27"
                fill="#bdc2be"
                fontWeight="600"
              >
                G
              </text>
            </g>
          ) : (
            <g>
              {[0, 1, 2].map((i) => (
                <g key={i}>
                  <circle
                    cx="134"
                    cy={51 + i * 26}
                    r="11"
                    fill="#14191e"
                    stroke="#7c8385"
                    strokeWidth="2"
                  />
                  <circle cx="134" cy={51 + i * 26} r="5" fill="#304556" />
                </g>
              ))}
              {p.id === 'nothing-3a' && (
                <path
                  d="M170 65 h42 v71 h-40 v83 h35 M153 149 v56"
                  fill="none"
                  stroke="#fdfdfa"
                  strokeWidth="5"
                />
              )}
            </g>
          )}
          <g transform="translate(76 14) rotate(9 180 150)">
            <rect
              x="124"
              y="35"
              width="121"
              height="234"
              rx="22"
              fill="#141b1c"
              stroke="#99aaa6"
              strokeWidth="2"
            />
            <rect x="129" y="40" width="111" height="224" rx="18" fill={`url(#${key}-screen)`} />
            <path
              d="M130 202 Q210 110 240 185 L240 246 Q183 215 129 257 Z"
              fill="#c0d3b6"
              opacity=".45"
            />
            <path
              d="M129 191 Q220 270 240 99 L240 248 Q153 302 129 207"
              fill="#dce3c0"
              opacity=".55"
            />
            <circle cx="184" cy="47" r="3" fill="#101d1d" />
            <text x="184" y="108" textAnchor="middle" fill="#e4eedf" fontSize="31" fontWeight="300">
              09:41
            </text>
          </g>
        </g>
      ) : p.category === 'laptops' ? (
        <g filter={`url(#${key}-shadow)`}>
          <path d="M98 59 Q98 48 110 48 H302 Q313 48 313 59 V217 H98Z" fill="#8fa5ad" />
          <rect x="105" y="55" width="201" height="151" rx="5" fill="#1f3033" />
          <rect x="111" y="61" width="189" height="138" rx="2" fill={`url(#${key}-screen)`} />
          <path d="M112 164 Q214 61 299 165 V197 H112Z" fill="#8eae93" />
          <path d="M87 216 L326 216 L362 239 Q362 247 348 247 H57 Q43 247 45 239Z" fill="#b9c8ce" />
          <path d="M88 220 H326 L344 235 H64Z" fill="#7e959d" />
          <path d="M169 238 H234" stroke="#6d818b" strokeWidth="4" />
        </g>
      ) : p.category === 'monitors' ? (
        <g filter={`url(#${key}-shadow)`}>
          <rect x="51" y="37" width="298" height="190" rx="6" fill="#252e2e" />
          <rect x="57" y="43" width="286" height="171" fill={`url(#${key}-screen)`} />
          <path d="M58 170 Q170 45 343 166 V213 H58Z" fill="#bed0a2" opacity=".6" />
          <path d="M181 227 H218 L224 263 H174Z" fill="#adb9b6" />
          <path d="M145 266 Q199 245 254 266 V274 H145Z" fill="#c4ceca" />
        </g>
      ) : p.category === 'tablets' ? (
        <g transform="rotate(-11 200 150)" filter={`url(#${key}-shadow)`}>
          <rect x="101" y="28" width="198" height="244" rx="18" fill="#a7bdc8" />
          <rect x="108" y="35" width="184" height="230" rx="12" fill="#24363b" />
          <rect x="116" y="43" width="168" height="214" rx="7" fill={`url(#${key}-screen)`} />
          <path d="M117 212 Q183 55 283 172 V256 H117Z" fill="#b8d5bd" opacity=".6" />
          <path d="M117 86 Q258 123 282 54 V139 Q183 219 117 86" fill="#c6d9bb" opacity=".4" />
        </g>
      ) : p.id === 'buds-pro' ? (
        <g filter={`url(#${key}-shadow)`}>
          <rect
            x="98"
            y="112"
            width="205"
            height="131"
            rx="43"
            fill="#eeeee9"
            stroke="#bfc8c2"
            strokeWidth="2"
          />
          <path d="M101 166 H300" stroke="#c4cac6" />
          <g transform="rotate(-20 154 94)">
            <rect x="140" y="56" width="25" height="86" rx="12" fill="#d5d9d5" />
            <ellipse cx="147" cy="62" rx="26" ry="23" fill="#f7f7f2" />
            <ellipse cx="132" cy="60" rx="9" ry="12" fill="#343d3a" />
          </g>
          <g transform="rotate(24 245 94)">
            <rect x="231" y="53" width="25" height="86" rx="12" fill="#d5d9d5" />
            <ellipse cx="246" cy="59" rx="26" ry="23" fill="#f7f7f2" />
            <ellipse cx="261" cy="58" rx="9" ry="12" fill="#343d3a" />
          </g>
          <circle cx="203" cy="190" r="3" fill="#5b9365" />
        </g>
      ) : (
        <g transform="rotate(-13 200 150)" filter={`url(#${key}-shadow)`}>
          <path
            d="M109 176 V126 C109 10 289 10 289 126 V176"
            fill="none"
            stroke="#252d2b"
            strokeWidth="23"
          />
          <path
            d="M109 166 V122 C109 22 289 22 289 122 V164"
            fill="none"
            stroke="#555d58"
            strokeWidth="8"
          />
          <path d="M112 142 V201 M286 142 V201" stroke="#9fa29a" strokeWidth="8" />
          <rect x="88" y="153" width="57" height="96" rx="25" fill={`url(#${key}-body)`} />
          <rect x="257" y="153" width="57" height="96" rx="25" fill={`url(#${key}-body)`} />
          <rect x="132" y="167" width="19" height="67" rx="9" fill="#181f1d" />
          <rect x="249" y="167" width="19" height="67" rx="9" fill="#181f1d" />
          <text x="285" y="184" fill="#b4bbb0" fontSize="10" textAnchor="middle">
            SONY
          </text>
        </g>
      )}
    </svg>
  );
}
