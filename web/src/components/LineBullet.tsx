interface Props { route: string; color: string; textColor: string; bus?: boolean; }

export function LineBullet({ route, color, textColor, bus }: Props) {
  return (
    <span className={`bullet${bus ? ' bus' : ''}`} style={{ backgroundColor: color, color: textColor }}>
      {route}
    </span>
  );
}
