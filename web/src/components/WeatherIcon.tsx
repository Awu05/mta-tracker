import type { ReactNode } from 'react';

const CLOUD = 'M7 18h9a4 4 0 0 0 .5-7.97 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z';
const CLOUD_HI = 'M7 15h9a4 4 0 0 0 .5-7.97 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 15z';

const SHAPES: Record<string, ReactNode> = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
    </>
  ),
  cloudy: <path d={CLOUD} />,
  rain: (
    <>
      <path d={CLOUD_HI} />
      <line x1="8" y1="18" x2="8" y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="16" y1="18" x2="16" y2="21" />
    </>
  ),
  snow: (
    <>
      <path d={CLOUD_HI} />
      <line x1="8" y1="19" x2="8" y2="19" />
      <line x1="12" y1="20" x2="12" y2="20" />
      <line x1="16" y1="19" x2="16" y2="19" />
    </>
  ),
  fog: (
    <>
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="3" y1="16" x2="17" y2="16" />
      <line x1="19" y1="16" x2="21" y2="16" />
    </>
  ),
  storm: (
    <>
      <path d={CLOUD_HI} />
      <polyline points="13 17 10 21 12.5 21 10.5 24" />
    </>
  ),
};

export function WeatherIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  const slug = SHAPES[icon] ? icon : 'cloudy';
  return (
    <svg
      className="wx-icon"
      data-icon={slug}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={slug}
    >
      {SHAPES[slug]}
    </svg>
  );
}
