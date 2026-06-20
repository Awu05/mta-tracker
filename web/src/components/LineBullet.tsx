interface Props { route: string; color: string; textColor: string; }

export function LineBullet({ route, color, textColor }: Props) {
  return (
    <span className="bullet" style={{ backgroundColor: color, color: textColor }}>
      {route}
    </span>
  );
}
