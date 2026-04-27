const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function RomanNumeral({ n, label }: { n: number; label: string }) {
  return (
    <span aria-label={`Section ${n}: ${label}`}>
      <span
        aria-hidden="true"
        style={{
          fontFamily: '"Cormorant Garamond", Garamond, serif',
          fontSize: 24,
          marginRight: '0.6rem',
          fontWeight: 600,
        }}
      >
        {NUMERALS[n] ?? n}.
      </span>
      <span>{label}</span>
    </span>
  );
}
