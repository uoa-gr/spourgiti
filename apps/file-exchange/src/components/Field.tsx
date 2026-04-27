import { type InputHTMLAttributes, useId } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/**
 * Persistent labels above the input. Bottom-border-only field.
 * Visible focus ring (2px accent) on :focus-visible. Error message
 * announced via aria-describedby + role="alert".
 */
export function Field({ label, error, id, style, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          fontFamily: 'inherit',
          fontSize: 14,
          color: '#5a5a5a',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={errId}
        style={{
          width: '100%',
          padding: '8px 0',
          fontSize: 16,
          minHeight: 44,
          border: 'none',
          borderBottom: `1px solid ${error ? '#b03a2e' : '#5a5a5a'}`,
          background: 'transparent',
          fontFamily: 'inherit',
          color: '#1a1a1a',
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.outline = '2px solid #b03a2e';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = 'none';
        }}
        {...rest}
      />
      {error && (
        <div
          id={errId}
          role="alert"
          style={{ color: '#b03a2e', fontSize: 14, marginTop: 4, fontFamily: 'inherit' }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
