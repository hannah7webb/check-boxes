import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 22,
            background: '#18181b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="56" height="56" viewBox="0 0 100 100">
            <polyline
              points="22,52 40,68 78,34"
              fill="none"
              stroke="white"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 52,
              fontWeight: 600,
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            check boxes
          </span>
          <span
            style={{
              fontSize: 24,
              color: '#71717a',
              letterSpacing: '0.04em',
            }}
          >
            daily productivity tool
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
