import { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'plain';
}

export function Button({ variant = 'plain', children, style, ...rest }: ButtonProps) {
  const accent = variant === 'primary';
  return (
    <button
      {...rest}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '6px 0',
        borderBottom: accent ? '2px solid #b03a2e' : '1px solid transparent',
        font: 'inherit',
        fontSize: 16,
        color: '#1a1a1a',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        minHeight: 44,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
